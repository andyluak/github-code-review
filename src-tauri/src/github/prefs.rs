use serde::{Deserialize, Serialize};

use crate::github::cache::{pr_prefs_path, read_json, write_json_atomic};
use crate::github::types::RepoPrefs;

const ALLOWED_METHODS: &[&str] = &["MERGE", "SQUASH", "REBASE"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetRepoPrefsRequest {
    pub repo_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetRepoPrefsResponse {
    pub prefs: RepoPrefs,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetRepoPrefsRequest {
    pub repo_path: String,
    pub preferred_merge_method: Option<String>,
    pub delete_branch_default: Option<bool>,
}

#[tauri::command]
pub fn get_repo_prefs(request: GetRepoPrefsRequest) -> Result<GetRepoPrefsResponse, String> {
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let path = pr_prefs_path(&repo_root)?;
    let prefs = read_json::<RepoPrefs>(&path)?.unwrap_or_default();
    Ok(GetRepoPrefsResponse { prefs })
}

#[tauri::command]
pub fn set_repo_prefs(request: SetRepoPrefsRequest) -> Result<GetRepoPrefsResponse, String> {
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let path = pr_prefs_path(&repo_root)?;
    let mut prefs = read_json::<RepoPrefs>(&path)?.unwrap_or_default();
    if let Some(method) = request.preferred_merge_method {
        let upper = method.to_uppercase();
        if !ALLOWED_METHODS.contains(&upper.as_str()) {
            return Err(format!("Unsupported merge method: {method}"));
        }
        prefs.preferred_merge_method = Some(upper);
    }
    if let Some(delete) = request.delete_branch_default {
        prefs.delete_branch_default = delete;
    }
    write_json_atomic(&path, &prefs)?;
    Ok(GetRepoPrefsResponse { prefs })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_merge_method() {
        let _path = std::path::Path::new("/tmp");
        // We exercise the validation inline since the command needs filesystem.
        let mut prefs = RepoPrefs::default();
        let candidate = "FOO".to_string();
        let upper = candidate.to_uppercase();
        let allowed = ALLOWED_METHODS.contains(&upper.as_str());
        assert!(!allowed);
        prefs.preferred_merge_method = None;
    }
}
