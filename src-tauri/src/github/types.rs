use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubViewer {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InboxReason {
    Assigned,
    ReviewRequested,
    Both,
    Authored,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChecksState {
    Passing,
    Pending,
    Failing,
    Cancelled,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChecksSummary {
    pub state: ChecksState,
    pub passing: u32,
    pub pending: u32,
    pub failing: u32,
    pub total: u32,
}

impl Default for ChecksSummary {
    fn default() -> Self {
        Self {
            state: ChecksState::Unknown,
            passing: 0,
            pending: 0,
            failing: 0,
            total: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PrAuthor {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSummary {
    pub number: i64,
    pub node_id: String,
    pub title: String,
    pub url: String,
    pub state: String,
    pub is_draft: bool,
    pub author: PrAuthor,
    pub base_ref_name: String,
    pub head_ref_name: String,
    pub head_ref_oid: String,
    pub updated_at: String,
    pub review_decision: Option<String>,
    pub mergeable: Option<String>,
    pub is_assigned_to_viewer: bool,
    pub is_review_requested_from_viewer: bool,
    pub viewer_review_state: Option<String>,
    pub latest_review_request_at: Option<String>,
    pub labels: Vec<String>,
    pub checks_summary: ChecksSummary,
    pub unresolved_thread_count: u32,
    pub comment_count: u32,
    pub inbox_reason: InboxReason,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxCache {
    pub repo_key: String,
    pub fetched_at: String,
    pub viewer_login: String,
    pub pull_requests: Vec<PullRequestSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadComment {
    pub id: String,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub viewer_did_author: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewThread {
    pub id: String,
    pub path: String,
    pub line: Option<u32>,
    pub original_line: Option<u32>,
    pub diff_side: String,
    pub is_resolved: bool,
    pub is_outdated: bool,
    pub is_collapsed: bool,
    pub viewer_can_resolve: bool,
    pub viewer_can_reply: bool,
    pub start_line: Option<u32>,
    pub comments: Vec<ThreadComment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub kind: String,
    pub actor: String,
    pub created_at: String,
    pub body: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestMergeReadiness {
    pub viewer_can_merge: bool,
    pub viewer_can_resolve_threads: bool,
    pub allowed_merge_methods: Vec<String>,
    pub default_merge_method: Option<String>,
    pub merge_state_status: String,
    pub merge_blockers: Vec<String>,
    pub expected_head_sha: String,
    pub head_ref_name: String,
    pub head_repo_owner: String,
    pub head_repo_name: String,
    pub safe_to_delete_branch: bool,
    #[serde(default)]
    pub delete_branch_on_merge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestContext {
    pub summary: PullRequestSummary,
    pub merge: PullRequestMergeReadiness,
    pub timeline: Vec<TimelineEvent>,
    pub review_threads: Vec<ReviewThread>,
    pub top_level_comments: Vec<TimelineEvent>,
    pub fetched_at: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestHeadProbe {
    pub head_ref_oid: String,
    pub updated_at: String,
    pub checks_summary: ChecksSummary,
    pub merge_state_status: String,
    pub mergeable: Option<String>,
    pub review_decision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoPrefs {
    pub preferred_merge_method: Option<String>,
    pub delete_branch_default: bool,
}

impl Default for RepoPrefs {
    fn default() -> Self {
        Self {
            preferred_merge_method: None,
            delete_branch_default: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishedReviewAttempt {
    pub review_id: String,
    pub event: String,
    pub head_sha: String,
    pub body_fingerprint: Option<String>,
    pub posted_inline_fingerprints: Vec<String>,
    pub posted_thread_reply_fingerprints: Vec<String>,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishedReviewRecord {
    pub attempts: Vec<PublishedReviewAttempt>,
}
