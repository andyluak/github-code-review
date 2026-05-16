use serde::{Deserialize, Serialize};

use crate::github::cache::{pr_context_path, read_json, write_json_atomic};
use crate::github::gh::{parse_graphql, GhRunner, RealGh};
use crate::github::remote::resolve_github_repo;
use crate::github::types::{
    ChecksState, ChecksSummary, PrAuthor, PullRequestContext, PullRequestMergeReadiness,
    PullRequestSummary, ReviewThread, ThreadComment, TimelineEvent,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadPullRequestContextRequest {
    pub repo_path: String,
    pub number: i64,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadPullRequestContextResponse {
    pub from_cache: bool,
    pub context: PullRequestContext,
}

const CONTEXT_QUERY: &str = r#"
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    mergeCommitAllowed
    squashMergeAllowed
    rebaseMergeAllowed
    viewerDefaultMergeMethod
    deleteBranchOnMerge
    pullRequest(number: $number) {
      number id title url state isDraft updatedAt mergeable mergeStateStatus reviewDecision
      baseRefName headRefName headRefOid
      headRepository { name owner { login } }
      headRef { name }
      isCrossRepository
      author { login ... on User { avatarUrl } }
      viewerCanUpdate
      labels(first: 30) { nodes { name } }
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated isCollapsed viewerCanReply viewerCanResolve
          path line originalLine startLine diffSide
          comments(first: 50) {
            nodes {
              id body createdAt updatedAt viewerDidAuthor
              author { login ... on User { avatarUrl } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
      comments(first: 100) {
        nodes {
          id body createdAt
          author { login }
        }
        pageInfo { hasNextPage endCursor }
      }
      reviews(first: 50) {
        nodes {
          id body createdAt state
          author { login }
        }
        pageInfo { hasNextPage endCursor }
      }
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
  }
}
"#;

#[derive(Debug, Deserialize)]
struct ContextResponse {
    data: ContextData,
}

#[derive(Debug, Deserialize)]
struct ContextData {
    repository: Option<RepoNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoNode {
    #[serde(default)]
    merge_commit_allowed: bool,
    #[serde(default)]
    squash_merge_allowed: bool,
    #[serde(default)]
    rebase_merge_allowed: bool,
    #[serde(default)]
    viewer_default_merge_method: Option<String>,
    #[serde(default)]
    delete_branch_on_merge: bool,
    pull_request: Option<PullRequestNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PullRequestNode {
    number: i64,
    id: String,
    title: String,
    url: String,
    state: String,
    is_draft: bool,
    updated_at: String,
    mergeable: Option<String>,
    merge_state_status: Option<String>,
    review_decision: Option<String>,
    base_ref_name: String,
    head_ref_name: String,
    head_ref_oid: String,
    head_repository: Option<HeadRepoNode>,
    is_cross_repository: bool,
    author: Option<AuthorNode>,
    viewer_can_update: bool,
    labels: Option<LabelsConn>,
    review_threads: Option<ReviewThreadsConn>,
    comments: Option<CommentsConn>,
    reviews: Option<ReviewsConn>,
    commits: Option<CommitsConn>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct HeadRepoNode {
    name: String,
    owner: OwnerNode,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
struct OwnerNode {
    login: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct AuthorNode {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct LabelsConn {
    nodes: Vec<LabelNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct LabelNode {
    name: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewThreadsConn {
    nodes: Vec<ReviewThreadNode>,
    page_info: Option<PageInfo>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewThreadNode {
    id: String,
    is_resolved: bool,
    is_outdated: bool,
    is_collapsed: bool,
    viewer_can_reply: bool,
    viewer_can_resolve: bool,
    path: String,
    line: Option<u32>,
    original_line: Option<u32>,
    start_line: Option<u32>,
    diff_side: Option<String>,
    comments: Option<CommentsConn>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct CommentsConn {
    nodes: Vec<CommentNode>,
    page_info: Option<PageInfo>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct CommentNode {
    id: String,
    body: String,
    created_at: String,
    updated_at: Option<String>,
    viewer_did_author: bool,
    author: Option<AuthorNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewsConn {
    nodes: Vec<ReviewNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ReviewNode {
    id: String,
    body: String,
    created_at: String,
    state: Option<String>,
    author: Option<AuthorNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CommitsConn {
    nodes: Vec<CommitConnNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CommitConnNode {
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
    contexts: Option<ContextsConn>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ContextsConn {
    nodes: Vec<ContextItemNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ContextItemNode {
    #[serde(rename = "__typename")]
    typename: Option<String>,
    conclusion: Option<String>,
    status: Option<String>,
    state: Option<String>,
}

pub fn fetch_pr_context(
    gh: &dyn GhRunner,
    owner: &str,
    repo: &str,
    number: i64,
) -> Result<PullRequestContext, String> {
    let body = gh.run(
        &[
            "api",
            "graphql",
            "-f",
            &format!("query={CONTEXT_QUERY}"),
            "-f",
            &format!("owner={owner}"),
            "-f",
            &format!("repo={repo}"),
            "-F",
            &format!("number={number}"),
        ],
        None,
    )?;
    let response: ContextResponse = parse_graphql(&body)?;
    let repo_node = response
        .data
        .repository
        .ok_or_else(|| format!("Repository {owner}/{repo} not found"))?;
    let merge_settings = repo_node.merge_settings();
    let pr_node = repo_node
        .pull_request
        .ok_or_else(|| format!("Pull request {number} not found in {owner}/{repo}"))?;
    build_context_from_node(merge_settings, pr_node)
}

#[derive(Debug, Clone, Default)]
struct RepositoryMergeSettings {
    merge_commit_allowed: bool,
    squash_merge_allowed: bool,
    rebase_merge_allowed: bool,
    viewer_default_merge_method: Option<String>,
    delete_branch_on_merge: bool,
}

impl RepoNode {
    fn merge_settings(&self) -> RepositoryMergeSettings {
        RepositoryMergeSettings {
            merge_commit_allowed: self.merge_commit_allowed,
            squash_merge_allowed: self.squash_merge_allowed,
            rebase_merge_allowed: self.rebase_merge_allowed,
            viewer_default_merge_method: self.viewer_default_merge_method.clone(),
            delete_branch_on_merge: self.delete_branch_on_merge,
        }
    }
}

fn build_context_from_node(
    merge_settings: RepositoryMergeSettings,
    node: PullRequestNode,
) -> Result<PullRequestContext, String> {
    let author = node.author.clone().unwrap_or_default();
    let labels = node
        .labels
        .map(|c| c.nodes.into_iter().map(|n| n.name).collect::<Vec<_>>())
        .unwrap_or_default();
    let checks_summary = node
        .commits
        .as_ref()
        .and_then(|c| c.nodes.first())
        .and_then(|n| n.commit.status_check_rollup.as_ref())
        .map(parse_checks_summary)
        .unwrap_or_default();

    let head_repo = node.head_repository.clone().unwrap_or_default();
    let head_owner = head_repo.owner.login.clone();
    let head_name = head_repo.name.clone();

    let summary = PullRequestSummary {
        number: node.number,
        node_id: node.id.clone(),
        title: node.title.clone(),
        url: node.url.clone(),
        state: node.state.clone(),
        is_draft: node.is_draft,
        author: PrAuthor {
            login: author.login,
            avatar_url: author.avatar_url,
        },
        base_ref_name: node.base_ref_name.clone(),
        head_ref_name: node.head_ref_name.clone(),
        head_ref_oid: node.head_ref_oid.clone(),
        updated_at: node.updated_at.clone(),
        review_decision: node.review_decision.clone(),
        mergeable: node.mergeable.clone(),
        is_assigned_to_viewer: false,
        is_review_requested_from_viewer: false,
        viewer_review_state: None,
        latest_review_request_at: None,
        labels,
        checks_summary: checks_summary.clone(),
        unresolved_thread_count: node
            .review_threads
            .as_ref()
            .map(|c| c.nodes.iter().filter(|n| !n.is_resolved).count() as u32)
            .unwrap_or(0),
        comment_count: 0,
        inbox_reason: crate::github::types::InboxReason::Assigned,
    };

    let mut review_threads: Vec<ReviewThread> = node
        .review_threads
        .map(|c| {
            c.nodes
                .into_iter()
                .map(|t| ReviewThread {
                    id: t.id,
                    path: t.path,
                    line: t.line,
                    original_line: t.original_line,
                    diff_side: t.diff_side.unwrap_or_else(|| "RIGHT".to_string()),
                    is_resolved: t.is_resolved,
                    is_outdated: t.is_outdated,
                    is_collapsed: t.is_collapsed,
                    viewer_can_reply: t.viewer_can_reply,
                    viewer_can_resolve: t.viewer_can_resolve,
                    start_line: t.start_line,
                    comments: t
                        .comments
                        .map(|c| {
                            c.nodes
                                .into_iter()
                                .map(|n| ThreadComment {
                                    id: n.id,
                                    author: n
                                        .author
                                        .as_ref()
                                        .map(|a| a.login.clone())
                                        .unwrap_or_default(),
                                    author_avatar_url: n.author.and_then(|a| a.avatar_url),
                                    body: n.body,
                                    created_at: n.created_at,
                                    updated_at: n.updated_at,
                                    viewer_did_author: n.viewer_did_author,
                                })
                                .collect()
                        })
                        .unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();

    // Stable sort by path then line
    review_threads.sort_by(|a, b| match a.path.cmp(&b.path) {
        std::cmp::Ordering::Equal => a.line.unwrap_or(0).cmp(&b.line.unwrap_or(0)),
        ord => ord,
    });

    let top_level_comments: Vec<TimelineEvent> = node
        .comments
        .map(|c| {
            c.nodes
                .into_iter()
                .map(|n| TimelineEvent {
                    id: n.id,
                    kind: "comment".into(),
                    actor: n.author.map(|a| a.login).unwrap_or_default(),
                    created_at: n.created_at,
                    body: Some(n.body),
                    state: None,
                })
                .collect()
        })
        .unwrap_or_default();

    let timeline: Vec<TimelineEvent> = node
        .reviews
        .map(|c| {
            c.nodes
                .into_iter()
                .map(|n| TimelineEvent {
                    id: n.id,
                    kind: "review".into(),
                    actor: n.author.map(|a| a.login).unwrap_or_default(),
                    created_at: n.created_at,
                    body: if n.body.is_empty() {
                        None
                    } else {
                        Some(n.body)
                    },
                    state: n.state,
                })
                .collect()
        })
        .unwrap_or_default();

    let mut blockers: Vec<String> = Vec::new();
    if node.is_draft {
        blockers.push("draft".into());
    }
    if !node.viewer_can_update {
        blockers.push("viewer cannot merge".into());
    }
    let merge_state = node
        .merge_state_status
        .clone()
        .unwrap_or_else(|| "UNKNOWN".to_string());
    match merge_state.as_str() {
        "BLOCKED" => blockers.push("blocked".into()),
        "DIRTY" => blockers.push("conflicts".into()),
        "BEHIND" => blockers.push("behind base".into()),
        "UNSTABLE" => blockers.push("unstable checks".into()),
        "UNKNOWN" => {}
        _ => {}
    }
    if matches!(checks_summary.state, ChecksState::Failing) {
        blockers.push("checks failing".into());
    }
    if matches!(checks_summary.state, ChecksState::Pending) && checks_summary.total > 0 {
        blockers.push("checks pending".into());
    }
    let unresolved = summary.unresolved_thread_count;
    if unresolved > 0 {
        blockers.push(format!("{unresolved} unresolved threads"));
    }
    let allowed_merge_methods = allowed_merge_methods(&merge_settings);

    let merge = PullRequestMergeReadiness {
        viewer_can_merge: node.viewer_can_update && !allowed_merge_methods.is_empty(),
        viewer_can_resolve_threads: node.viewer_can_update,
        default_merge_method: merge_settings
            .viewer_default_merge_method
            .filter(|method| allowed_merge_methods.contains(method)),
        allowed_merge_methods,
        merge_state_status: merge_state,
        merge_blockers: blockers,
        expected_head_sha: node.head_ref_oid.clone(),
        head_ref_name: node.head_ref_name.clone(),
        head_repo_owner: head_owner,
        head_repo_name: head_name,
        safe_to_delete_branch: !node.is_cross_repository,
        delete_branch_on_merge: merge_settings.delete_branch_on_merge,
    };

    Ok(PullRequestContext {
        summary,
        merge,
        timeline,
        review_threads,
        top_level_comments,
        fetched_at: super::inbox::now_iso_pub(),
        truncated: false,
    })
}

pub fn allowed_merge_methods_from_flags(
    merge_commit_allowed: bool,
    squash_merge_allowed: bool,
    rebase_merge_allowed: bool,
) -> Vec<String> {
    let mut methods = Vec::new();
    if merge_commit_allowed {
        methods.push("MERGE".to_string());
    }
    if squash_merge_allowed {
        methods.push("SQUASH".to_string());
    }
    if rebase_merge_allowed {
        methods.push("REBASE".to_string());
    }
    methods
}

fn allowed_merge_methods(settings: &RepositoryMergeSettings) -> Vec<String> {
    allowed_merge_methods_from_flags(
        settings.merge_commit_allowed,
        settings.squash_merge_allowed,
        settings.rebase_merge_allowed,
    )
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
                        "FAILURE" | "TIMED_OUT" | "STARTUP_FAILURE" | "ACTION_REQUIRED"
                        | "CANCELLED" => failing += 1,
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

pub fn run_load_pull_request_context(
    gh: &dyn GhRunner,
    request: &LoadPullRequestContextRequest,
) -> Result<LoadPullRequestContextResponse, String> {
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let force = request.force.unwrap_or(false);
    let cache_path = pr_context_path(&repo_root, request.number)?;
    if !force {
        if let Some(cache) = read_json::<PullRequestContext>(&cache_path)? {
            return Ok(LoadPullRequestContextResponse {
                from_cache: true,
                context: cache,
            });
        }
    }
    let repo = resolve_github_repo(&repo_root)?;
    let context = fetch_pr_context(gh, &repo.owner, &repo.repo, request.number)?;
    let _ = write_json_atomic(&cache_path, &context);
    Ok(LoadPullRequestContextResponse {
        from_cache: false,
        context,
    })
}

#[tauri::command]
pub async fn load_pull_request_context(
    request: LoadPullRequestContextRequest,
) -> Result<LoadPullRequestContextResponse, String> {
    crate::blocking::run("load_pull_request_context", move || {
        run_load_pull_request_context(&RealGh, &request)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::gh::FakeGh;

    #[test]
    fn surfaces_pr_not_found() {
        let fake = FakeGh::new(vec![Ok(
            r#"{"data":{"repository":{"pullRequest":null}}}"#.into()
        )]);
        let err = fetch_pr_context(&fake, "o", "r", 1).unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn parses_minimal_context_with_blockers() {
        let body = r#"{"data":{"repository":{
            "mergeCommitAllowed":false,
            "squashMergeAllowed":true,
            "rebaseMergeAllowed":true,
            "viewerDefaultMergeMethod":"REBASE",
            "deleteBranchOnMerge":true,
            "pullRequest":{
            "number":1,"id":"id","title":"t","url":"u","state":"OPEN","isDraft":true,
            "updatedAt":"2026-01-01T00:00:00Z","mergeable":"MERGEABLE","mergeStateStatus":"BLOCKED",
            "reviewDecision":null,"baseRefName":"main","headRefName":"feat","headRefOid":"sha",
            "headRepository":{"name":"r","owner":{"login":"o"}},
            "isCrossRepository":false,"author":{"login":"a"},
            "viewerCanUpdate":false,
            "labels":{"nodes":[]},
            "reviewThreads":{"nodes":[], "pageInfo":null},
            "comments":{"nodes":[], "pageInfo":null},
            "reviews":{"nodes":[], "pageInfo":null},
            "commits":{"nodes":[]}
        }}}}"#;
        let fake = FakeGh::new(vec![Ok(body.into())]);
        let ctx = fetch_pr_context(&fake, "o", "r", 1).unwrap();
        assert!(ctx.merge.merge_blockers.contains(&"draft".to_string()));
        assert!(ctx
            .merge
            .merge_blockers
            .contains(&"viewer cannot merge".to_string()));
        assert!(ctx.merge.merge_blockers.contains(&"blocked".to_string()));
        assert!(!ctx.merge.viewer_can_merge);
        assert_eq!(ctx.merge.allowed_merge_methods, vec!["SQUASH", "REBASE"]);
        assert_eq!(ctx.merge.default_merge_method.as_deref(), Some("REBASE"));
        assert!(ctx.merge.delete_branch_on_merge);
    }

    #[test]
    fn derives_allowed_merge_methods_from_repository_settings() {
        assert_eq!(
            allowed_merge_methods_from_flags(false, true, true),
            vec!["SQUASH", "REBASE"]
        );
        assert_eq!(
            allowed_merge_methods_from_flags(true, false, false),
            vec!["MERGE"]
        );
    }
}
