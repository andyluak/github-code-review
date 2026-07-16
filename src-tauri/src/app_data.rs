use serde::{de::DeserializeOwned, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::env;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static ATOMIC_WRITE_COUNTER: AtomicU64 = AtomicU64::new(0);

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
    let identity_root = repo_identity_root(repo_root);
    let repo_name = identity_root
        .file_name()
        .and_then(|name| name.to_str())
        .map(slug)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "repo".to_string());
    format!(
        "{}-{:016x}",
        repo_name,
        fnv1a64(identity_root.display().to_string().as_bytes())
    )
}

pub fn repo_identity_root(repo_root: &Path) -> PathBuf {
    let fallback_root = repo_root
        .canonicalize()
        .unwrap_or_else(|_| repo_root.to_path_buf());
    let dot_git = repo_root.join(".git");
    if dot_git.is_dir() {
        return fallback_root;
    }

    let Ok(pointer) = fs::read_to_string(&dot_git) else {
        return fallback_root;
    };
    let Some(git_dir_value) = pointer.trim().strip_prefix("gitdir:") else {
        return fallback_root;
    };
    let git_dir_value = git_dir_value.trim();
    let git_dir = if Path::new(git_dir_value).is_absolute() {
        PathBuf::from(git_dir_value)
    } else {
        repo_root.join(git_dir_value)
    };
    let Ok(common_dir_value) = fs::read_to_string(git_dir.join("commondir")) else {
        return fallback_root;
    };
    let common_dir_value = common_dir_value.trim();
    let common_dir = if Path::new(common_dir_value).is_absolute() {
        PathBuf::from(common_dir_value)
    } else {
        git_dir.join(common_dir_value)
    };
    let common_dir = common_dir.canonicalize().unwrap_or(common_dir);

    if common_dir.file_name().and_then(|name| name.to_str()) == Some(".git") {
        common_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or(fallback_root)
    } else {
        fallback_root
    }
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
    let tmp_path = atomic_write_tmp_path(path, file_name);
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

fn atomic_write_tmp_path(path: &Path, file_name: &str) -> PathBuf {
    let counter = ATOMIC_WRITE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp_name = format!(".{file_name}.{}.{}.tmp", std::process::id(), counter);
    path.parent()
        .map(|parent| parent.join(&tmp_name))
        .unwrap_or_else(|| PathBuf::from(&tmp_name))
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
    fn linked_worktree_uses_main_checkout_storage_key() {
        let root = std::env::temp_dir().join(format!(
            "review-desk-worktree-storage-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let main = root.join("loft-enterprise");
        let worktree = root.join("loft-wt-graph");
        let worktree_git_dir = main.join(".git/worktrees/loft-wt-graph");
        fs::create_dir_all(&worktree_git_dir).unwrap();
        fs::create_dir_all(&worktree).unwrap();
        fs::write(
            worktree.join(".git"),
            format!("gitdir: {}\n", worktree_git_dir.display()),
        )
        .unwrap();
        fs::write(worktree_git_dir.join("commondir"), "../..\n").unwrap();

        assert_eq!(repo_identity_root(&worktree), main.canonicalize().unwrap());
        assert_eq!(repo_storage_key(&worktree), repo_storage_key(&main));

        fs::remove_dir_all(root).unwrap();
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
    fn atomic_write_temp_paths_do_not_collide() {
        let path = Path::new("/tmp/review-desk-sample.json");
        let left = atomic_write_tmp_path(path, "review-desk-sample.json");
        let right = atomic_write_tmp_path(path, "review-desk-sample.json");
        assert_ne!(left, right);
    }

    #[test]
    fn atomic_write_allows_concurrent_same_path_writes() {
        let dir = std::env::temp_dir().join(format!(
            "review-desk-app-data-concurrent-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");

        let handles = (0..16)
            .map(|count| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let value = Sample {
                        name: "alex".to_string(),
                        count,
                    };
                    write_json_atomic(&path, &value)
                })
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle.join().unwrap().unwrap();
        }

        let read: Sample = read_json(&path).unwrap().unwrap();
        assert_eq!(read.name, "alex");
        assert!(read.count < 16);
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
