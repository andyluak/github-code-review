use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::github::cache::{published_review_path, read_json, write_json_atomic};
use crate::github::gh::{parse_graphql, GhRunner, RealGh};
use crate::github::inbox::now_iso_pub;
use crate::github::refresh::{assert_expected_head, fetch_pr_head_probe};
use crate::github::remote::resolve_github_repo;
use crate::github::types::{PublishedReviewAttempt, PublishedReviewRecord};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishInlineComment {
    pub fingerprint: String,
    pub path: String,
    pub line: i64,
    pub side: Option<String>,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishThreadReply {
    pub fingerprint: String,
    pub thread_id: String,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishReviewRequest {
    pub repo_path: String,
    pub number: i64,
    pub expected_head_sha: String,
    pub event: String,
    pub body: String,
    pub body_fingerprint: Option<String>,
    pub inline_comments: Vec<PublishInlineComment>,
    pub thread_replies: Vec<PublishThreadReply>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishReviewResponse {
    pub review_id: Option<String>,
    pub head_sha: String,
    pub posted_fingerprints: Vec<String>,
    pub failed_fingerprints: Vec<String>,
    pub skipped_because_duplicate: bool,
}

const ALLOWED_EVENTS: &[&str] = &["APPROVE", "REQUEST_CHANGES", "COMMENT"];

pub fn run_publish_pull_request_review(
    gh: &dyn GhRunner,
    request: &PublishReviewRequest,
) -> Result<PublishReviewResponse, String> {
    if !ALLOWED_EVENTS.contains(&request.event.as_str()) {
        return Err(format!("Unsupported review event: {}", request.event));
    }
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let repo = resolve_github_repo(&repo_root)?;
    let probe = fetch_pr_head_probe(gh, &repo.owner, &repo.repo, request.number)?;
    assert_expected_head(&probe, &request.expected_head_sha)?;

    let record_path = published_review_path(&repo_root, request.number)?;
    let mut record = read_json::<PublishedReviewRecord>(&record_path)?.unwrap_or_default();

    let already_inline: HashSet<String> = record
        .attempts
        .iter()
        .flat_map(|a| a.posted_inline_fingerprints.iter().cloned())
        .collect();
    let already_thread: HashSet<String> = record
        .attempts
        .iter()
        .flat_map(|a| a.posted_thread_reply_fingerprints.iter().cloned())
        .collect();
    let body_fingerprint_already_posted = request
        .body_fingerprint
        .as_ref()
        .map(|fp| {
            record
                .attempts
                .iter()
                .any(|a| a.body_fingerprint.as_deref() == Some(fp.as_str()))
        })
        .unwrap_or(false);

    let pending_inline: Vec<&PublishInlineComment> = request
        .inline_comments
        .iter()
        .filter(|c| !already_inline.contains(&c.fingerprint))
        .collect();
    let pending_thread: Vec<&PublishThreadReply> = request
        .thread_replies
        .iter()
        .filter(|r| !already_thread.contains(&r.fingerprint))
        .collect();

    let body_already_posted = request.body.trim().is_empty() || body_fingerprint_already_posted;

    if pending_inline.is_empty() && pending_thread.is_empty() && body_already_posted {
        let last_review_id = record
            .attempts
            .last()
            .map(|a| a.review_id.clone())
            .unwrap_or_default();
        return Ok(PublishReviewResponse {
            review_id: Some(last_review_id),
            head_sha: probe.head_ref_oid,
            posted_fingerprints: vec![],
            failed_fingerprints: vec![],
            skipped_because_duplicate: true,
        });
    }

    // Build review payload and POST. We use gh api to call REST /repos/.../pulls/:n/reviews.
    let inline_json: Vec<serde_json::Value> = pending_inline
        .iter()
        .map(|c| {
            serde_json::json!({
                "path": c.path,
                "line": c.line,
                "side": c.side.clone().unwrap_or_else(|| "RIGHT".to_string()),
                "body": c.body,
            })
        })
        .collect();
    let payload = serde_json::json!({
        "commit_id": probe.head_ref_oid,
        "body": request.body,
        "event": request.event,
        "comments": inline_json,
    });

    let url = format!(
        "repos/{}/{}/pulls/{}/reviews",
        repo.owner, repo.repo, request.number
    );
    let body = gh.run(
        &[
            "api",
            "--method",
            "POST",
            "-H",
            "Accept: application/vnd.github+json",
            &url,
            "--input",
            "-",
        ],
        Some(&payload.to_string()),
    )?;
    let parsed: serde_json::Value = parse_graphql(&body)?;
    let review_id = parsed
        .get("id")
        .and_then(|v| v.as_u64())
        .map(|v| v.to_string())
        .unwrap_or_default();

    let mut posted_fingerprints: Vec<String> = pending_inline
        .iter()
        .map(|c| c.fingerprint.clone())
        .collect();
    if !body_already_posted {
        if let Some(fp) = request.body_fingerprint.clone() {
            posted_fingerprints.push(fp);
        }
    }

    let mut posted_thread_fingerprints: Vec<String> = Vec::new();
    let mut failed_fingerprints: Vec<String> = Vec::new();
    for reply in &pending_thread {
        let url = format!(
            "repos/{}/{}/pulls/comments/{}/replies",
            repo.owner, repo.repo, reply.thread_id
        );
        let payload = serde_json::json!({"body": reply.body});
        match gh.run(
            &[
                "api",
                "--method",
                "POST",
                "-H",
                "Accept: application/vnd.github+json",
                &url,
                "--input",
                "-",
            ],
            Some(&payload.to_string()),
        ) {
            Ok(_) => posted_thread_fingerprints.push(reply.fingerprint.clone()),
            Err(_) => failed_fingerprints.push(reply.fingerprint.clone()),
        }
    }
    posted_fingerprints.extend(posted_thread_fingerprints.clone());

    record.attempts.push(PublishedReviewAttempt {
        review_id: review_id.clone(),
        event: request.event.clone(),
        head_sha: probe.head_ref_oid.clone(),
        body_fingerprint: if body_already_posted {
            None
        } else {
            request.body_fingerprint.clone()
        },
        posted_inline_fingerprints: pending_inline
            .iter()
            .map(|c| c.fingerprint.clone())
            .collect(),
        posted_thread_reply_fingerprints: posted_thread_fingerprints,
        submitted_at: now_iso_pub(),
    });
    let _ = write_json_atomic(&record_path, &record);

    Ok(PublishReviewResponse {
        review_id: if review_id.is_empty() {
            None
        } else {
            Some(review_id)
        },
        head_sha: probe.head_ref_oid,
        posted_fingerprints,
        failed_fingerprints,
        skipped_because_duplicate: false,
    })
}

#[tauri::command]
pub fn publish_pull_request_review(
    request: PublishReviewRequest,
) -> Result<PublishReviewResponse, String> {
    run_publish_pull_request_review(&RealGh, &request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_event() {
        let req = PublishReviewRequest {
            repo_path: "/".into(),
            number: 1,
            expected_head_sha: "sha".into(),
            event: "ZAP".into(),
            body: "".into(),
            body_fingerprint: None,
            inline_comments: vec![],
            thread_replies: vec![],
        };
        let fake = crate::github::gh::FakeGh::new(vec![]);
        let err = run_publish_pull_request_review(&fake, &req).unwrap_err();
        assert!(err.contains("Unsupported"));
    }

    #[test]
    fn allowed_events_const_includes_three_options() {
        assert!(ALLOWED_EVENTS.contains(&"APPROVE"));
        assert!(ALLOWED_EVENTS.contains(&"REQUEST_CHANGES"));
        assert!(ALLOWED_EVENTS.contains(&"COMMENT"));
    }
}
