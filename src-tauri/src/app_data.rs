use serde::{de::DeserializeOwned, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::env;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn review_desk_data_dir() -> Option<PathBuf> {
    if let Some(path) = env::var_os("REVIEW_DESK_DATA_DIR") {
        return Some(PathBuf::from(path));
    }

    #[cfg(target_os = "macos")]
    {
        return env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Review Desk")
        });
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = env::var_os("APPDATA") {
            return Some(PathBuf::from(app_data).join("Review Desk"));
        }
        return env::var_os("USERPROFILE").map(|home| {
            PathBuf::from(home)
                .join("AppData")
                .join("Roaming")
                .join("Review Desk")
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(state_home) = env::var_os("XDG_STATE_HOME") {
            return Some(PathBuf::from(state_home).join("review-desk"));
        }
        env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join(".local")
                .join("state")
                .join("review-desk")
        })
    }
}

pub fn repo_storage_key(repo_root: &Path) -> String {
    let repo_name = repo_root
        .file_name()
        .and_then(|name| name.to_str())
        .map(slug)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "repo".to_string());
    format!(
        "{}-{:016x}",
        repo_name,
        fnv1a64(repo_root.display().to_string().as_bytes())
    )
}

pub fn repo_data_dir(repo_root: &Path) -> Result<PathBuf, String> {
    let data_dir = review_desk_data_dir()
        .ok_or_else(|| "Review Desk app data directory is unavailable".to_string())?;
    Ok(data_dir.join("repos").join(repo_storage_key(repo_root)))
}

pub fn workspace_state_dir(repo_root: &Path) -> Result<PathBuf, String> {
    Ok(repo_data_dir(repo_root)?.join("workspace-state"))
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!("Failed to read {}: {error}", path.display()));
        }
    };
    match serde_json::from_slice::<T>(&bytes) {
        Ok(value) => Ok(Some(value)),
        Err(_) => Ok(None),
    }
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize JSON for {}: {error}", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid path: {}", path.display()))?;
    let tmp_name = format!(".{file_name}.tmp");
    let tmp_path = path
        .parent()
        .map(|parent| parent.join(&tmp_name))
        .unwrap_or_else(|| PathBuf::from(&tmp_name));
    {
        let mut tmp_file = fs::File::create(&tmp_path)
            .map_err(|error| format!("Failed to open tmp file {}: {error}", tmp_path.display()))?;
        tmp_file
            .write_all(&bytes)
            .map_err(|error| format!("Failed to write {}: {error}", tmp_path.display()))?;
        tmp_file
            .sync_all()
            .map_err(|error| format!("Failed to sync {}: {error}", tmp_path.display()))?;
    }
    fs::rename(&tmp_path, path).map_err(|error| {
        format!(
            "Failed to rename {} to {}: {error}",
            tmp_path.display(),
            path.display()
        )
    })?;
    Ok(())
}

fn slug(value: &str) -> String {
    let slug = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    slug.trim_matches('-')
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[allow(dead_code)]
pub fn fast_hash(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[cfg(test)]
pub(crate) static TEST_ENV_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Sample {
        name: String,
        count: u32,
    }

    #[test]
    fn distinct_repo_paths_produce_distinct_keys() {
        let a = repo_storage_key(Path::new("/tmp/clone-a"));
        let b = repo_storage_key(Path::new("/tmp/clone-b"));
        assert_ne!(a, b);
    }

    #[test]
    fn read_missing_returns_none() {
        let dir = std::env::temp_dir().join(format!(
            "review-desk-app-data-read-missing-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("missing.json");
        let result: Result<Option<Sample>, _> = read_json(&path);
        assert!(matches!(result, Ok(None)));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_corrupt_returns_none() {
        let dir = std::env::temp_dir().join(format!(
            "review-desk-app-data-corrupt-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("corrupt.json");
        fs::write(&path, b"{not valid json").unwrap();
        let result: Result<Option<Sample>, _> = read_json(&path);
        assert!(matches!(result, Ok(None)));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn atomic_write_round_trips() {
        let dir = std::env::temp_dir().join(format!(
            "review-desk-app-data-roundtrip-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("nested").join("sample.json");
        let value = Sample {
            name: "alex".to_string(),
            count: 7,
        };
        write_json_atomic(&path, &value).unwrap();
        let read: Sample = read_json(&path).unwrap().unwrap();
        assert_eq!(read, value);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn workspace_state_dir_under_repos_repo_key() {
        let _guard = TEST_ENV_MUTEX.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "review-desk-app-data-workspace-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("REVIEW_DESK_DATA_DIR", &dir);
        let repo = Path::new("/tmp/example-clone");
        let path = workspace_state_dir(repo).unwrap();
        let key = repo_storage_key(repo);
        assert_eq!(path, dir.join("repos").join(&key).join("workspace-state"));
        std::env::remove_var("REVIEW_DESK_DATA_DIR");
        fs::remove_dir_all(&dir).unwrap();
    }
}
