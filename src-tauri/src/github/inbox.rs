use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::github::auth::fetch_viewer;
use crate::github::cache::{inbox_cache_path, read_json, write_json_atomic};
use crate::github::gh::{parse_graphql, GhRunner, RealGh};
use crate::github::remote::{resolve_github_repo, GitHubRepoRef};
use crate::github::types::{
    ChecksState, ChecksSummary, InboxCache, InboxReason, PrAuthor, PullRequestSummary,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListMyPullRequestsRequest {
    pub repo_path: String,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMyPullRequestsResponse {
    pub repo_key: String,
    pub viewer_login: String,
    pub fetched_at: String,
    pub from_cache: bool,
    pub pull_requests: Vec<PullRequestSummary>,
}

const INBOX_QUERY: &str = r#"
query($q1: String!, $q2: String!, $q3: String!) {
  assigned: search(query: $q1, type: ISSUE, first: 50) {
    nodes { ...PrFields }
  }
  reviewRequested: search(query: $q2, type: ISSUE, first: 50) {
    nodes { ...PrFields }
  }
  authored: search(query: $q3, type: ISSUE, first: 50) {
    nodes { ...PrFields }
  }
}
fragment PrFields on PullRequest {
  number id title url state isDraft updatedAt mergeable reviewDecision
  baseRefName headRefName headRefOid
  author { login ... on User { avatarUrl } }
  labels(first: 20) { nodes { name } }
  reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
  assignees(first: 20) { nodes { login } }
  latestReviews(first: 20) { nodes { author { login } state submittedAt } }
  comments(first: 0) { totalCount }
  reviewThreads(first: 50) { nodes { isResolved } totalCount }
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          state
          contexts(first: 100) {
            nodes {
              __typename
              ... on CheckRun { conclusion status }
              ... on StatusContext { state }
            }
          }
        }
      }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct InboxResponse {
    data: InboxData,
}

#[derive(Debug, Deserialize)]
struct InboxData {
    assigned: SearchConnection,
    #[serde(rename = "reviewRequested")]
    review_requested: SearchConnection,
    #[serde(default)]
    authored: SearchConnection,
}

#[derive(Debug, Deserialize, Default)]
struct SearchConnection {
    #[serde(default)]
    nodes: Vec<PrNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PrNode {
    #[serde(default)]
    number: i64,
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    mergeable: Option<String>,
    #[serde(default)]
    review_decision: Option<String>,
    #[serde(default)]
    base_ref_name: String,
    #[serde(default)]
    head_ref_name: String,
    #[serde(default)]
    head_ref_oid: String,
    #[serde(default)]
    author: Option<AuthorNode>,
    #[serde(default)]
    labels: Option<LabelsConnection>,
    #[serde(default)]
    review_requests: Option<ReviewRequestsConnection>,
    #[serde(default)]
    assignees: Option<AssigneesConnection>,
    #[serde(default)]
    latest_reviews: Option<LatestReviewsConnection>,
    #[serde(default)]
    comments: Option<TotalCount>,
    #[serde(default)]
    review_threads: Option<ReviewThreadsConnection>,
    #[serde(default)]
    commits: Option<CommitsConnection>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct AuthorNode {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct LabelsConnection {
    #[serde(default)]
    nodes: Vec<LabelNode>,
}

#[derive(Debug, Deserialize, Default)]
struct LabelNode {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewRequestsConnection {
    nodes: Vec<ReviewRequestNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewRequestNode {
    requested_reviewer: Option<RequestedReviewer>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct RequestedReviewer {
    login: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct AssigneesConnection {
    #[serde(default)]
    nodes: Vec<AssigneeNode>,
}

#[derive(Debug, Deserialize, Default)]
struct AssigneeNode {
    #[serde(default)]
    login: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct LatestReviewsConnection {
    nodes: Vec<LatestReviewNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct LatestReviewNode {
    author: Option<AuthorNode>,
    state: Option<String>,
    submitted_at: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct TotalCount {
    #[serde(default, rename = "totalCount")]
    total_count: u32,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewThreadsConnection {
    nodes: Vec<ReviewThreadResolvedNode>,
    total_count: u32,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewThreadResolvedNode {
    is_resolved: bool,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CommitsConnection {
    nodes: Vec<CommitConnectionNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CommitConnectionNode {
    commit: CommitNode,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct CommitNode {
    status_check_rollup: Option<StatusCheckRollup>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct StatusCheckRollup {
    state: Option<String>,
    contexts: Option<ContextsConnection>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ContextsConnection {
    nodes: Vec<ContextNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ContextNode {
    #[serde(rename = "__typename")]
    typename: Option<String>,
    conclusion: Option<String>,
    status: Option<String>,
    state: Option<String>,
}

fn pr_node_to_summary(node: PrNode, viewer_login: &str, reason: InboxReason) -> PullRequestSummary {
    let author = node.author.unwrap_or_default();
    let viewer_did_author = author.login == viewer_login;
    let labels = node
        .labels
        .map(|c| {
            c.nodes
                .into_iter()
                .map(|n| n.name)
                .filter(|name| !name.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let is_assigned = node
        .assignees
        .as_ref()
        .map(|c| c.nodes.iter().any(|n| n.login == viewer_login))
        .unwrap_or(false);
    let is_review_requested = node
        .review_requests
        .as_ref()
        .map(|c| {
            c.nodes
                .iter()
                .filter_map(|n| n.requested_reviewer.as_ref())
                .filter_map(|r| r.login.as_deref())
                .any(|login| login == viewer_login)
        })
        .unwrap_or(false);
    let viewer_review_state = node.latest_reviews.as_ref().and_then(|c| {
        c.nodes
            .iter()
            .filter(|n| {
                n.author
                    .as_ref()
                    .map(|a| a.login == viewer_login)
                    .unwrap_or(false)
            })
            .last()
            .and_then(|n| n.state.clone())
    });
    let checks_summary = node
        .commits
        .as_ref()
        .and_then(|c| c.nodes.first())
        .and_then(|n| n.commit.status_check_rollup.as_ref())
        .map(parse_checks_summary)
        .unwrap_or_default();
    let unresolved_thread_count = node
        .review_threads
        .as_ref()
        .map(|c| c.nodes.iter().filter(|n| !n.is_resolved).count() as u32)
        .unwrap_or(0);
    let comment_count = node.comments.map(|c| c.total_count).unwrap_or(0);
    PullRequestSummary {
        number: node.number,
        node_id: node.id,
        title: node.title,
        url: node.url,
        state: node.state,
        is_draft: node.is_draft,
        author: PrAuthor {
            login: author.login,
            avatar_url: author.avatar_url,
        },
        viewer_did_author,
        base_ref_name: node.base_ref_name,
        head_ref_name: node.head_ref_name,
        head_ref_oid: node.head_ref_oid,
        updated_at: node.updated_at,
        review_decision: node.review_decision,
        mergeable: node.mergeable,
        is_assigned_to_viewer: is_assigned,
        is_review_requested_from_viewer: is_review_requested,
        viewer_review_state,
        latest_review_request_at: None,
        labels,
        checks_summary,
        unresolved_thread_count,
        comment_count,
        inbox_reason: reason,
    }
}

fn parse_checks_summary(rollup: &StatusCheckRollup) -> ChecksSummary {
    let mut passing = 0u32;
    let mut pending = 0u32;
    let mut failing = 0u32;
    let mut total = 0u32;
    if let Some(contexts) = &rollup.contexts {
        for node in &contexts.nodes {
            total += 1;
            let typename = node.typename.as_deref().unwrap_or("");
            if typename == "CheckRun" {
                let status = node.status.as_deref().unwrap_or("");
                let conclusion = node.conclusion.as_deref().unwrap_or("");
                if status == "COMPLETED" {
                    match conclusion {
                        "SUCCESS" | "NEUTRAL" | "SKIPPED" => passing += 1,
                        "FAILURE" | "TIMED_OUT" | "STARTUP_FAILURE" | "ACTION_REQUIRED" => {
                            failing += 1
                        }
                        "CANCELLED" => failing += 1,
                        _ => pending += 1,
                    }
                } else {
                    pending += 1;
                }
            } else if typename == "StatusContext" {
                let state = node.state.as_deref().unwrap_or("");
                match state {
                    "SUCCESS" => passing += 1,
                    "FAILURE" | "ERROR" => failing += 1,
                    "PENDING" | "EXPECTED" => pending += 1,
                    _ => pending += 1,
                }
            }
        }
    }
    let state = match rollup.state.as_deref().unwrap_or("") {
        "SUCCESS" => ChecksState::Passing,
        "FAILURE" | "ERROR" => ChecksState::Failing,
        "PENDING" | "EXPECTED" => ChecksState::Pending,
        _ if total == 0 => ChecksState::Unknown,
        _ if failing > 0 => ChecksState::Failing,
        _ if pending > 0 => ChecksState::Pending,
        _ if passing > 0 => ChecksState::Passing,
        _ => ChecksState::Unknown,
    };
    ChecksSummary {
        state,
        passing,
        pending,
        failing,
        total,
    }
}

pub fn fetch_inbox(
    gh: &dyn GhRunner,
    repo: &GitHubRepoRef,
    viewer_login: &str,
) -> Result<Vec<PullRequestSummary>, String> {
    let assignee_query = format!(
        "repo:{}/{} is:pr is:open assignee:@me",
        repo.owner, repo.repo
    );
    let review_query = format!(
        "repo:{}/{} is:pr is:open review-requested:@me",
        repo.owner, repo.repo
    );
    let authored_query = format!("repo:{}/{} is:pr is:open author:@me", repo.owner, repo.repo);
    let body = gh.run(
        &[
            "api",
            "graphql",
            "-f",
            &format!("query={INBOX_QUERY}"),
            "-f",
            &format!("q1={assignee_query}"),
            "-f",
            &format!("q2={review_query}"),
            "-f",
            &format!("q3={authored_query}"),
        ],
        None,
    )?;
    let response: InboxResponse = parse_graphql(&body)?;
    let mut by_number: std::collections::BTreeMap<i64, PullRequestSummary> =
        std::collections::BTreeMap::new();
    for node in response.data.assigned.nodes {
        let summary = pr_node_to_summary(node, viewer_login, InboxReason::Assigned);
        by_number.insert(summary.number, summary);
    }
    for node in response.data.review_requested.nodes {
        let summary = pr_node_to_summary(node, viewer_login, InboxReason::ReviewRequested);
        by_number
            .entry(summary.number)
            .and_modify(|existing| {
                existing.inbox_reason = InboxReason::Both;
                existing.is_review_requested_from_viewer = true;
            })
            .or_insert_with(|| {
                let mut copy = summary.clone();
                copy.is_review_requested_from_viewer = true;
                copy
            });
    }
    for node in response.data.authored.nodes {
        let summary = pr_node_to_summary(node, viewer_login, InboxReason::Authored);
        by_number.entry(summary.number).or_insert(summary);
    }
    let mut results: Vec<PullRequestSummary> = by_number.into_values().collect();
    sort_inbox(&mut results);
    Ok(results)
}

pub fn sort_inbox(results: &mut [PullRequestSummary]) {
    results.sort_by(|a, b| {
        // 1) actionable reviews first, then assignments, then viewer-authored PRs.
        let a_priority = inbox_priority(a);
        let b_priority = inbox_priority(b);
        match a_priority.cmp(&b_priority) {
            Ordering::Equal => {}
            ord => return ord,
        }
        // 2) latestReviewRequestAt or updatedAt newest first
        let a_when = a
            .latest_review_request_at
            .as_deref()
            .unwrap_or(a.updated_at.as_str());
        let b_when = b
            .latest_review_request_at
            .as_deref()
            .unwrap_or(b.updated_at.as_str());
        match b_when.cmp(a_when) {
            Ordering::Equal => {}
            ord => return ord,
        }
        // 3) PR number descending as tie-breaker
        b.number.cmp(&a.number)
    });
}

fn inbox_priority(pr: &PullRequestSummary) -> u8 {
    if pr.is_review_requested_from_viewer {
        0
    } else if pr.is_assigned_to_viewer {
        1
    } else {
        2
    }
}

pub fn now_iso_pub() -> String {
    now_iso()
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", iso8601_from_unix(secs))
}

fn iso8601_from_unix(secs: u64) -> String {
    // Simple UTC ISO-8601 formatter without chrono.
    let days = (secs / 86400) as i64;
    let mut sec_of_day = secs % 86400;
    let hour = sec_of_day / 3600;
    sec_of_day %= 3600;
    let minute = sec_of_day / 60;
    let second = sec_of_day % 60;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    // From "chrono::naive::date" algorithm: civil_from_days
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

pub fn run_list_my_pull_requests(
    gh: &dyn GhRunner,
    request: &ListMyPullRequestsRequest,
) -> Result<ListMyPullRequestsResponse, String> {
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let repo_key = crate::app_data::repo_storage_key(&repo_root);
    let force = request.force.unwrap_or(false);
    let cache_path = inbox_cache_path(&repo_root)?;

    if !force {
        if let Some(cache) = read_json::<InboxCache>(&cache_path)? {
            return Ok(ListMyPullRequestsResponse {
                repo_key: cache.repo_key,
                viewer_login: cache.viewer_login,
                fetched_at: cache.fetched_at,
                from_cache: true,
                pull_requests: cache.pull_requests,
            });
        }
    }

    let viewer = fetch_viewer(gh)?;
    let repo = resolve_github_repo(&repo_root)?;
    let pull_requests = fetch_inbox(gh, &repo, &viewer.login)?;
    let fetched_at = now_iso();
    let cache = InboxCache {
        repo_key: repo_key.clone(),
        fetched_at: fetched_at.clone(),
        viewer_login: viewer.login.clone(),
        pull_requests: pull_requests.clone(),
    };
    // Best-effort write; failures to persist should not break the response.
    let _ = write_json_atomic(&cache_path, &cache);

    Ok(ListMyPullRequestsResponse {
        repo_key,
        viewer_login: viewer.login,
        fetched_at,
        from_cache: false,
        pull_requests,
    })
}

#[tauri::command]
pub async fn list_my_pull_requests(
    request: ListMyPullRequestsRequest,
) -> Result<ListMyPullRequestsResponse, String> {
    crate::blocking::run("list_my_pull_requests", move || {
        run_list_my_pull_requests(&RealGh, &request)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::gh::FakeGh;

    fn make_summary(number: i64, requested: bool, updated_at: &str) -> PullRequestSummary {
        PullRequestSummary {
            number,
            node_id: format!("id{number}"),
            title: format!("Title {number}"),
            url: format!("https://github.com/owner/repo/pull/{number}"),
            state: "OPEN".into(),
            is_draft: false,
            author: PrAuthor {
                login: "octocat".into(),
                avatar_url: None,
            },
            viewer_did_author: false,
            base_ref_name: "main".into(),
            head_ref_name: format!("feature-{number}"),
            head_ref_oid: "abc".into(),
            updated_at: updated_at.into(),
            review_decision: None,
            mergeable: None,
            is_assigned_to_viewer: !requested,
            is_review_requested_from_viewer: requested,
            viewer_review_state: None,
            latest_review_request_at: None,
            labels: vec![],
            checks_summary: ChecksSummary::default(),
            unresolved_thread_count: 0,
            comment_count: 0,
            inbox_reason: if requested {
                InboxReason::ReviewRequested
            } else {
                InboxReason::Assigned
            },
        }
    }

    #[test]
    fn sorts_review_requested_before_assigned() {
        let mut items = vec![
            make_summary(1, false, "2026-01-01T00:00:00Z"),
            make_summary(2, true, "2026-01-01T00:00:00Z"),
        ];
        sort_inbox(&mut items);
        assert_eq!(items[0].number, 2);
        assert_eq!(items[1].number, 1);
    }

    #[test]
    fn sorts_by_updated_at_within_priority() {
        let mut items = vec![
            make_summary(1, true, "2026-01-01T00:00:00Z"),
            make_summary(2, true, "2026-02-01T00:00:00Z"),
            make_summary(3, true, "2026-03-01T00:00:00Z"),
        ];
        sort_inbox(&mut items);
        assert_eq!(items[0].number, 3);
        assert_eq!(items[1].number, 2);
        assert_eq!(items[2].number, 1);
    }

    #[test]
    fn sorts_assigned_before_authored() {
        let assigned = make_summary(1, false, "2026-01-01T00:00:00Z");
        let mut authored = make_summary(2, false, "2026-02-01T00:00:00Z");
        authored.is_assigned_to_viewer = false;
        authored.inbox_reason = InboxReason::Authored;
        let mut items = vec![authored, assigned];

        sort_inbox(&mut items);

        assert_eq!(items[0].number, 1);
        assert_eq!(items[1].number, 2);
    }

    #[test]
    fn dedupes_assigned_and_review_requested_marks_both() {
        let fake = FakeGh::new(vec![Ok(r#"{
            "data": {
                "assigned": { "nodes": [
                    {"number": 5, "id":"x", "title":"t", "url":"u", "state":"OPEN", "isDraft":false,
                     "updatedAt":"2026-01-01T00:00:00Z", "baseRefName":"main", "headRefName":"feat", "headRefOid":"sha",
                     "author":{"login":"a"},
                     "labels":{"nodes":[]},
                     "reviewRequests":{"nodes":[]},
                     "assignees":{"nodes":[{"login":"alex"}]},
                     "latestReviews":{"nodes":[]},
                     "comments":{"totalCount":0},
                     "reviewThreads":{"nodes":[], "totalCount":0},
                     "commits":{"nodes":[]} }
                ]},
                "reviewRequested": { "nodes": [
                    {"number": 5, "id":"x", "title":"t", "url":"u", "state":"OPEN", "isDraft":false,
                     "updatedAt":"2026-01-01T00:00:00Z", "baseRefName":"main", "headRefName":"feat", "headRefOid":"sha",
                     "author":{"login":"a"},
                     "labels":{"nodes":[]},
                     "reviewRequests":{"nodes":[{"requestedReviewer":{"login":"alex"}}]},
                     "assignees":{"nodes":[]},
                     "latestReviews":{"nodes":[]},
                     "comments":{"totalCount":0},
                     "reviewThreads":{"nodes":[], "totalCount":0},
                     "commits":{"nodes":[]} }
                ]}
            }
        }"#.into())]);
        let repo = GitHubRepoRef {
            owner: "owner".into(),
            repo: "repo".into(),
        };
        let prs = fetch_inbox(&fake, &repo, "alex").unwrap();
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].inbox_reason, InboxReason::Both);
        assert!(prs[0].is_review_requested_from_viewer);
    }

    #[test]
    fn includes_viewer_authored_open_pull_requests() {
        let fake = FakeGh::new(vec![Ok(r#"{
            "data": {
                "assigned": { "nodes": [] },
                "reviewRequested": { "nodes": [] },
                "authored": { "nodes": [
                    {"number": 7, "id":"x", "title":"mine", "url":"u", "state":"OPEN", "isDraft":false,
                     "updatedAt":"2026-01-01T00:00:00Z", "baseRefName":"main", "headRefName":"feat", "headRefOid":"sha",
                     "author":{"login":"alex"},
                     "labels":{"nodes":[]},
                     "reviewRequests":{"nodes":[]},
                     "assignees":{"nodes":[]},
                     "latestReviews":{"nodes":[]},
                     "comments":{"totalCount":0},
                     "reviewThreads":{"nodes":[], "totalCount":0},
                     "commits":{"nodes":[]} }
                ]}
            }
        }"#.into())]);
        let repo = GitHubRepoRef {
            owner: "owner".into(),
            repo: "repo".into(),
        };

        let prs = fetch_inbox(&fake, &repo, "alex").unwrap();

        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 7);
        assert_eq!(prs[0].inbox_reason, InboxReason::Authored);
        assert_eq!(prs[0].author.login, "alex");
        assert!(!prs[0].is_assigned_to_viewer);
        assert!(!prs[0].is_review_requested_from_viewer);

        let calls = fake.calls.lock().unwrap();
        let args = calls[0].0.join("\n");
        assert!(args.contains("q3=repo:owner/repo is:pr is:open author:@me"));
    }

    #[test]
    fn parses_checks_summary_failure_state() {
        let rollup = StatusCheckRollup {
            state: Some("FAILURE".into()),
            contexts: Some(ContextsConnection {
                nodes: vec![ContextNode {
                    typename: Some("CheckRun".into()),
                    conclusion: Some("FAILURE".into()),
                    status: Some("COMPLETED".into()),
                    state: None,
                }],
            }),
        };
        let summary = parse_checks_summary(&rollup);
        assert_eq!(summary.state, ChecksState::Failing);
        assert_eq!(summary.failing, 1);
        assert_eq!(summary.total, 1);
    }

    #[test]
    fn iso_formats_unix_zero() {
        assert_eq!(iso8601_from_unix(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn iso_formats_known_date() {
        // 2026-01-01T00:00:00Z
        let secs = 1767225600;
        assert_eq!(iso8601_from_unix(secs), "2026-01-01T00:00:00Z");
    }

    #[test]
    fn corrupt_inbox_cache_is_treated_as_missing() {
        // read_json under cache.rs returns Ok(None) on parse failure. We assert behaviour at
        // that seam without needing a real repo or gh — the production path then proceeds to
        // a live fetch.
        let dir =
            std::env::temp_dir().join(format!("review-desk-inbox-corrupt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("inbox.json");
        std::fs::write(&path, b"{ not valid").unwrap();
        let result: Result<Option<crate::github::types::InboxCache>, _> =
            crate::app_data::read_json(&path);
        assert!(matches!(result, Ok(None)));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
