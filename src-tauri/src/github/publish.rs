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
    pub start_line: Option<i64>,
    pub start_side: Option<String>,
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
const ADD_THREAD_REPLY_MUTATION: &str = r#"
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId,
    body: $body
  }) {
    comment { id }
  }
}
"#;

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
    let duplicate_inline_fingerprints: Vec<String> = request
        .inline_comments
        .iter()
        .filter(|c| already_inline.contains(&c.fingerprint))
        .map(|c| c.fingerprint.clone())
        .collect();
    let duplicate_thread_fingerprints: Vec<String> = request
        .thread_replies
        .iter()
        .filter(|r| already_thread.contains(&r.fingerprint))
        .map(|r| r.fingerprint.clone())
        .collect();

    let body_already_posted = body_or_event_already_posted(
        &request.event,
        &request.body,
        request.body_fingerprint.as_deref(),
        body_fingerprint_already_posted,
    );

    if pending_inline.is_empty() && pending_thread.is_empty() && body_already_posted {
        let last_review_id = record
            .attempts
            .last()
            .map(|a| a.review_id.clone())
            .unwrap_or_default();
        let mut posted_fingerprints = duplicate_inline_fingerprints;
        posted_fingerprints.extend(duplicate_thread_fingerprints);
        return Ok(PublishReviewResponse {
            review_id: Some(last_review_id),
            head_sha: probe.head_ref_oid,
            posted_fingerprints,
            failed_fingerprints: vec![],
            skipped_because_duplicate: true,
        });
    }

    let review_id =
        if should_create_review(&request.event, pending_inline.len(), body_already_posted) {
            // Build review payload and POST. We use gh api to call REST /repos/.../pulls/:n/reviews.
            let inline_json: Vec<serde_json::Value> = pending_inline
                .iter()
                .map(|c| inline_comment_payload(c))
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
            parsed
                .get("id")
                .and_then(|v| v.as_u64())
                .map(|v| v.to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };

    let mut posted_fingerprints = duplicate_inline_fingerprints;
    posted_fingerprints.extend(pending_inline.iter().map(|c| c.fingerprint.clone()));
    if !body_already_posted {
        if let Some(fp) = request.body_fingerprint.clone() {
            posted_fingerprints.push(fp);
        }
    }

    let mut posted_thread_fingerprints: Vec<String> = Vec::new();
    let mut failed_fingerprints: Vec<String> = Vec::new();
    for reply in &pending_thread {
        match post_thread_reply(gh, reply) {
            Ok(_) => posted_thread_fingerprints.push(reply.fingerprint.clone()),
            Err(_) => failed_fingerprints.push(reply.fingerprint.clone()),
        }
    }
    posted_fingerprints.extend(duplicate_thread_fingerprints);
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

fn post_thread_reply(gh: &dyn GhRunner, reply: &PublishThreadReply) -> Result<(), String> {
    let payload = serde_json::json!({
        "query": ADD_THREAD_REPLY_MUTATION,
        "variables": {
            "threadId": reply.thread_id,
            "body": reply.body,
        },
    });
    gh.run(
        &["api", "graphql", "--input", "-"],
        Some(&payload.to_string()),
    )?;
    Ok(())
}

fn inline_comment_payload(comment: &PublishInlineComment) -> serde_json::Value {
    let side = comment.side.clone().unwrap_or_else(|| "RIGHT".to_string());
    let mut payload = serde_json::json!({
        "path": comment.path,
        "line": comment.line,
        "side": side.clone(),
        "body": comment.body,
    });
    if let Some(start_line) = comment.start_line {
        if start_line != comment.line {
            payload["start_line"] = serde_json::json!(start_line);
            payload["start_side"] =
                serde_json::json!(comment.start_side.clone().unwrap_or_else(|| side.clone()));
        }
    }
    payload
}

#[tauri::command]
pub async fn publish_pull_request_review(
    request: PublishReviewRequest,
) -> Result<PublishReviewResponse, String> {
    crate::blocking::run("publish_pull_request_review", move || {
        run_publish_pull_request_review(&RealGh, &request)
    })
    .await
}

fn body_or_event_already_posted(
    event: &str,
    body: &str,
    body_fingerprint: Option<&str>,
    body_fingerprint_already_posted: bool,
) -> bool {
    if body_fingerprint.is_some() {
        return body_fingerprint_already_posted;
    }
    event == "COMMENT" && body.trim().is_empty()
}

fn should_create_review(
    event: &str,
    pending_inline_count: usize,
    body_already_posted: bool,
) -> bool {
    pending_inline_count > 0 || !body_already_posted || event != "COMMENT"
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

    #[test]
    fn duplicate_inline_fingerprint_filter_is_correct() {
        // Backend logic check: comments whose fingerprint matches a previously-recorded one
        // must be filtered before any GitHub call. We exercise the filter inline without
        // hitting the full command (which needs filesystem + a repo).
        let already: std::collections::HashSet<String> = ["FP-A".to_string()].into_iter().collect();
        let comments = vec![
            PublishInlineComment {
                fingerprint: "FP-A".into(),
                path: "a.rs".into(),
                line: 1,
                side: None,
                start_line: None,
                start_side: None,
                body: "x".into(),
            },
            PublishInlineComment {
                fingerprint: "FP-B".into(),
                path: "b.rs".into(),
                line: 2,
                side: None,
                start_line: None,
                start_side: None,
                body: "y".into(),
            },
        ];
        let pending: Vec<_> = comments
            .iter()
            .filter(|c| !already.contains(&c.fingerprint))
            .collect();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].fingerprint, "FP-B");
    }

    #[test]
    fn multiline_inline_payload_includes_start_line_and_side() {
        let comment = PublishInlineComment {
            fingerprint: "FP-RANGE".into(),
            path: "script.sh".into(),
            line: 13,
            side: Some("RIGHT".into()),
            start_line: Some(10),
            start_side: Some("RIGHT".into()),
            body: "range".into(),
        };

        let payload = inline_comment_payload(&comment);

        assert_eq!(payload["line"], 13);
        assert_eq!(payload["side"], "RIGHT");
        assert_eq!(payload["start_line"], 10);
        assert_eq!(payload["start_side"], "RIGHT");
    }

    #[test]
    fn empty_approval_is_publishable_review_event() {
        assert!(!body_or_event_already_posted("APPROVE", "", None, false));
        assert!(body_or_event_already_posted("COMMENT", "", None, false));
        assert!(body_or_event_already_posted(
            "APPROVE",
            "",
            Some("approval-fingerprint"),
            true,
        ));
    }

    #[test]
    fn reply_only_comment_does_not_create_empty_review() {
        assert!(!should_create_review("COMMENT", 0, true));
        assert!(should_create_review("COMMENT", 1, true));
        assert!(should_create_review("COMMENT", 0, false));
        assert!(should_create_review("APPROVE", 0, true));
    }

    #[test]
    fn thread_replies_use_graphql_thread_reply_mutation() {
        let fake = crate::github::gh::FakeGh::new(vec![Ok(
            r#"{"data":{"addPullRequestReviewThreadReply":{"comment":{"id":"c1"}}}}"#.into(),
        )]);
        let reply = PublishThreadReply {
            fingerprint: "fp".into(),
            thread_id: "PRRT_kwDOSeLMTM5A".into(),
            body: "looks good".into(),
        };

        post_thread_reply(&fake, &reply).unwrap();

        let calls = fake.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].0,
            vec![
                "api".to_string(),
                "graphql".to_string(),
                "--input".to_string(),
                "-".to_string()
            ]
        );
        let payload: serde_json::Value =
            serde_json::from_str(calls[0].1.as_deref().unwrap()).unwrap();
        assert!(payload["query"]
            .as_str()
            .unwrap()
            .contains("addPullRequestReviewThreadReply"));
        assert_eq!(payload["variables"]["threadId"], "PRRT_kwDOSeLMTM5A");
        assert_eq!(payload["variables"]["body"], "looks good");
    }
}
