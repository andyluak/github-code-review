use serde::{Deserialize, Serialize};

use crate::github::context::fetch_pr_context;
use crate::github::gh::{GhRunner, RealGh};
use crate::github::refresh::{assert_expected_head, fetch_pr_head_probe};
use crate::github::remote::resolve_github_repo;

const ALLOWED_METHODS: &[&str] = &["MERGE", "SQUASH", "REBASE"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MergePullRequestRequest {
    pub repo_path: String,
    pub number: i64,
    pub expected_head_sha: String,
    pub method: String,
    pub delete_branch: bool,
    pub commit_title: Option<String>,
    pub commit_body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePullRequestResponse {
    pub merged: bool,
    pub message: String,
    pub branch_deleted: bool,
}

pub fn run_merge_pull_request(
    gh: &dyn GhRunner,
    request: &MergePullRequestRequest,
) -> Result<MergePullRequestResponse, String> {
    let upper = request.method.to_uppercase();
    if !ALLOWED_METHODS.contains(&upper.as_str()) {
        return Err(format!("Unsupported merge method: {}", request.method));
    }
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let repo = resolve_github_repo(&repo_root)?;
    let probe = fetch_pr_head_probe(gh, &repo.owner, &repo.repo, request.number)?;
    assert_expected_head(&probe, &request.expected_head_sha)?;

    let url = format!(
        "repos/{}/{}/pulls/{}/merge",
        repo.owner, repo.repo, request.number
    );
    let payload = serde_json::json!({
        "merge_method": upper.to_lowercase(),
        "sha": probe.head_ref_oid,
        "commit_title": request.commit_title,
        "commit_message": request.commit_body,
    });
    let body = gh.run(
        &[
            "api",
            "--method",
            "PUT",
            "-H",
            "Accept: application/vnd.github+json",
            &url,
            "--input",
            "-",
        ],
        Some(&payload.to_string()),
    )?;

    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|error| format!("Failed to parse merge response: {error}"))?;
    let merged = parsed
        .get("merged")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let message = parsed
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut branch_deleted = false;
    if merged && request.delete_branch {
        // Re-fetch PR context to determine whether the head ref lives in the base repo.
        // Cross-repo (fork) PRs are never auto-deleted here regardless of caller intent.
        if let Ok(ctx) = fetch_pr_context(gh, &repo.owner, &repo.repo, request.number) {
            if ctx.merge.safe_to_delete_branch
                && ctx.merge.head_repo_owner.eq_ignore_ascii_case(&repo.owner)
                && ctx.merge.head_repo_name.eq_ignore_ascii_case(&repo.repo)
            {
                let url = format!(
                    "repos/{}/{}/git/refs/heads/{}",
                    repo.owner, repo.repo, ctx.merge.head_ref_name
                );
                if gh
                    .run(
                        &[
                            "api",
                            "--method",
                            "DELETE",
                            "-H",
                            "Accept: application/vnd.github+json",
                            &url,
                        ],
                        None,
                    )
                    .is_ok()
                {
                    branch_deleted = true;
                }
            }
        }
    }

    Ok(MergePullRequestResponse {
        merged,
        message,
        branch_deleted,
    })
}

#[tauri::command]
pub fn merge_pull_request(
    request: MergePullRequestRequest,
) -> Result<MergePullRequestResponse, String> {
    run_merge_pull_request(&RealGh, &request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::gh::FakeGh;

    #[test]
    fn rejects_invalid_method() {
        let req = MergePullRequestRequest {
            repo_path: "/".into(),
            number: 1,
            expected_head_sha: "sha".into(),
            method: "PLAID".into(),
            delete_branch: false,
            commit_title: None,
            commit_body: None,
        };
        let fake = FakeGh::new(vec![]);
        let err = run_merge_pull_request(&fake, &req).unwrap_err();
        assert!(err.contains("Unsupported"));
    }

    #[test]
    fn allowed_methods_three() {
        assert!(ALLOWED_METHODS.contains(&"MERGE"));
        assert!(ALLOWED_METHODS.contains(&"SQUASH"));
        assert!(ALLOWED_METHODS.contains(&"REBASE"));
    }
}
