use std::path::{Path, PathBuf};

pub use crate::app_data::{read_json, write_json_atomic};

pub fn repo_github_dir(repo_root: &Path) -> Result<PathBuf, String> {
    Ok(crate::app_data::repo_data_dir(repo_root)?.join("github"))
}

pub fn inbox_cache_path(repo_root: &Path) -> Result<PathBuf, String> {
    Ok(repo_github_dir(repo_root)?.join("inbox.json"))
}

pub fn pr_context_path(repo_root: &Path, number: i64) -> Result<PathBuf, String> {
    Ok(repo_github_dir(repo_root)?
        .join("pr-context")
        .join(format!("{number}.json")))
}

pub fn pr_prefs_path(repo_root: &Path) -> Result<PathBuf, String> {
    Ok(repo_github_dir(repo_root)?.join("pr-prefs.json"))
}

pub fn published_review_path(repo_root: &Path, number: i64) -> Result<PathBuf, String> {
    Ok(repo_github_dir(repo_root)?
        .join("published-reviews")
        .join(format!("{number}.json")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn repo_github_dir_under_repo_data_dir() {
        let _guard = crate::app_data::TEST_ENV_MUTEX.lock().unwrap();
        let dir =
            std::env::temp_dir().join(format!("review-desk-github-cache-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("REVIEW_DESK_DATA_DIR", &dir);

        let repo = Path::new("/tmp/some-repo");
        let path = repo_github_dir(repo).unwrap();
        let key = crate::app_data::repo_storage_key(repo);
        assert_eq!(path, dir.join("repos").join(&key).join("github"));
        assert_eq!(
            inbox_cache_path(repo).unwrap(),
            dir.join("repos")
                .join(&key)
                .join("github")
                .join("inbox.json"),
        );

        std::env::remove_var("REVIEW_DESK_DATA_DIR");
        fs::remove_dir_all(&dir).unwrap();
    }
}
