export type InboxReason =
  | "ASSIGNED"
  | "REVIEW_REQUESTED"
  | "BOTH"
  | "AUTHORED";

export type ChecksState =
  | "PASSING"
  | "PENDING"
  | "FAILING"
  | "CANCELLED"
  | "UNKNOWN";

export type ChecksSummary = {
  state: ChecksState;
  passing: number;
  pending: number;
  failing: number;
  total: number;
};

export type CheckRunState =
  | "success"
  | "failure"
  | "timed_out"
  | "in_progress"
  | "queued"
  | "neutral"
  | "skipped"
  | "cancelled"
  | "action_required"
  | "stale";

export type CheckRun = {
  id: string;
  name: string;
  source: string | null;
  state: CheckRunState;
  required: boolean;
  url: string | null;
  startedAt: string | null;
  durationMs: number | null;
};

export type ListCheckRunsResponse = {
  headSha: string;
  fetchedAt: string;
  checks: CheckRun[];
};

export type PrAuthor = {
  login: string;
  avatarUrl?: string | null;
};

export type PullRequestSummary = {
  number: number;
  nodeId: string;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  author: PrAuthor;
  viewerDidAuthor?: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  updatedAt: string;
  reviewDecision: string | null;
  mergeable: string | null;
  isAssignedToViewer: boolean;
  isReviewRequestedFromViewer: boolean;
  viewerReviewState: string | null;
  latestReviewRequestAt: string | null;
  labels: string[];
  checksSummary: ChecksSummary;
  unresolvedThreadCount: number;
  commentCount: number;
  inboxReason: InboxReason;
};

export type GitHubViewer = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

export type ListMyPullRequestsRequest = {
  repoPath: string;
  force?: boolean;
};

export type ListMyPullRequestsResponse = {
  repoKey: string;
  viewerLogin: string;
  fetchedAt: string;
  fromCache: boolean;
  pullRequests: PullRequestSummary[];
};

export type ThreadComment = {
  id: string;
  author: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  viewerDidAuthor: boolean;
};

export type ReviewThread = {
  id: string;
  path: string;
  line: number | null;
  originalLine: number | null;
  diffSide: string;
  isResolved: boolean;
  isOutdated: boolean;
  isCollapsed: boolean;
  viewerCanResolve: boolean;
  viewerCanReply: boolean;
  startLine: number | null;
  comments: ThreadComment[];
};

export type TimelineEvent = {
  id: string;
  kind: string;
  actor: string;
  createdAt: string;
  body: string | null;
  state: string | null;
};

export type PullRequestMergeReadiness = {
  viewerCanMerge: boolean;
  viewerCanResolveThreads: boolean;
  allowedMergeMethods: string[];
  defaultMergeMethod: "MERGE" | "SQUASH" | "REBASE" | null;
  mergeStateStatus: string;
  mergeBlockers: string[];
  expectedHeadSha: string;
  headRefName: string;
  headRepoOwner: string;
  headRepoName: string;
  safeToDeleteBranch: boolean;
  deleteBranchOnMerge: boolean;
};

export type PullRequestContext = {
  summary: PullRequestSummary;
  merge: PullRequestMergeReadiness;
  timeline: TimelineEvent[];
  reviewThreads: ReviewThread[];
  topLevelComments: TimelineEvent[];
  fetchedAt: string;
  truncated: boolean;
};

export type PullRequestHeadProbe = {
  headRefOid: string;
  updatedAt: string;
  checksSummary: ChecksSummary;
  mergeStateStatus: string;
  mergeable: string | null;
  reviewDecision: string | null;
};

export type LoadPullRequestContextRequest = {
  repoPath: string;
  number: number;
  force?: boolean;
};

export type LoadPullRequestContextResponse = {
  fromCache: boolean;
  context: PullRequestContext;
};

export type RefreshPullRequestHeadRequest = {
  repoPath: string;
  number: number;
};

export type RefreshPullRequestHeadResponse = {
  probe: PullRequestHeadProbe;
};

export type PublishInlineComment = {
  fingerprint: string;
  path: string;
  line: number;
  side?: string | null;
  startLine?: number | null;
  startSide?: string | null;
  body: string;
};

export type PublishThreadReply = {
  fingerprint: string;
  threadId: string;
  body: string;
};

export type PublishReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export type PublishReviewRequest = {
  repoPath: string;
  number: number;
  expectedHeadSha: string;
  event: PublishReviewEvent;
  body: string;
  bodyFingerprint?: string | null;
  inlineComments: PublishInlineComment[];
  threadReplies: PublishThreadReply[];
};

export type PublishReviewResponse = {
  reviewId: string | null;
  headSha: string;
  postedFingerprints: string[];
  failedFingerprints: string[];
  skippedBecauseDuplicate: boolean;
};

export type MergePullRequestRequest = {
  repoPath: string;
  number: number;
  expectedHeadSha: string;
  method: "MERGE" | "SQUASH" | "REBASE";
  deleteBranch: boolean;
  commitTitle?: string | null;
  commitBody?: string | null;
};

export type MergePullRequestResponse = {
  merged: boolean;
  message: string;
  branchDeleted: boolean;
};

export type RepoPrefs = {
  preferredMergeMethod: string | null;
  deleteBranchDefault: boolean;
};

export type GetRepoPrefsRequest = {
  repoPath: string;
};

export type GetRepoPrefsResponse = {
  prefs: RepoPrefs;
};

export type SetRepoPrefsRequest = {
  repoPath: string;
  preferredMergeMethod?: string | null;
  deleteBranchDefault?: boolean;
};
