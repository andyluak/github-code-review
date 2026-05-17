export type CreateReviewSessionRequest = {
  repoPath: string;
  baseRef?: string | null;
  headRef?: string | null;
  target?: ReviewTargetRequest | null;
};

export type ReviewTargetRequest =
  | { kind: "workingTree" }
  | { kind: "branch"; baseRef: string; headRef: string }
  | { kind: "commit"; commit: string }
  | { kind: "commitRange"; fromRef: string; toRef: string }
  | {
      kind: "pullRequest";
      remote?: string | null;
      number?: number | null;
      url?: string | null;
      baseRef?: string | null;
      headRef?: string | null;
    };

export type ReviewTargetKind = ReviewTargetRequest["kind"];

export type ListReviewRefsRequest = {
  repoPath: string;
};

export type ImportReviewSessionRequest = {
  manifestPath: string;
};

export type ActiveReviewSessionRequest = {
  repoPath: string;
};

export type SaveTextFileRequest = {
  path: string;
  contents: string;
};

export type OpenReviewFileRequest = {
  repoPath: string;
  filePath: string;
};

export type LoadReviewAssetPreviewRequest = {
  repoPath: string;
  filePath: string;
  oldPath?: string | null;
  changeKind: ChangeKind;
  diffTarget: string;
};

export type ReviewAssetSide = {
  label: string;
  path: string;
  dataUrl: string;
  mimeType: string;
  byteSize: number;
};

export type ReviewAssetPreview = {
  filePath: string;
  mimeType: string;
  old: ReviewAssetSide | null;
  new: ReviewAssetSide | null;
  message?: string | null;
};

export type LoadReviewWorkspaceStateRequest = {
  repoPath: string;
  sessionId: string;
  legacySessionIds?: string[];
};

export type SaveReviewWorkspaceStateRequest = {
  repoPath: string;
  sessionId: string;
  state: ReviewWorkspaceState;
};

export type LoadReviewDiagramRequest = {
  repoPath: string;
  sessionId: string;
  scope?: ReviewDiagramScope | null;
};

export type SaveReviewDiagramRequest = {
  repoPath: string;
  diagram: ReviewDiagram;
};

export type ActiveReviewSession = {
  repoRoot: string;
  manifestPath: string;
  activatedAt?: string | null;
  source?: string | null;
};

export type RepoRefs = {
  requestedPath: string;
  root: string;
  currentBranch: string;
  defaultBranch?: string | null;
  headSha: string;
  remotes: GitRemote[];
  refs: GitRef[];
  commits: GitCommit[];
  pullRequests: PullRequestSummary[];
  pullRequestError?: string | null;
};

export type GitRemote = {
  name: string;
  url: string;
};

export type GitRef = {
  name: string;
  kind: GitRefKind;
  shortSha: string;
  isHead: boolean;
  upstream?: string | null;
};

export type GitRefKind = "local" | "remote";

export type GitCommit = {
  sha: string;
  shortSha: string;
  title: string;
  author: string;
  date: string;
  refs: string;
};

export type PullRequestSummary = {
  number: number;
  title: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  url: string;
  state: string;
};

export type ReviewSession = {
  id: string;
  legacySessionIds: string[];
  snapshotHash: string;
  target: ReviewTarget;
  repo: RepoSummary;
  summary: SessionSummary;
  files: ReviewFile[];
  excludedFiles: ExcludedFile[];
  patchArtifact: PatchArtifact;
  order: ReviewOrder;
};

export type ReviewTarget =
  | { kind: "workingTree"; label: string }
  | { kind: "branch"; baseRef: string; headRef: string; label: string }
  | { kind: "commit"; commit: string; label: string }
  | { kind: "commitRange"; fromRef: string; toRef: string; label: string }
  | {
      kind: "pullRequest";
      remote?: string | null;
      number?: number | null;
      url?: string | null;
      baseRef: string;
      headRef: string;
      label: string;
      headSha?: string | null;
      headRefName?: string | null;
      baseRefName?: string | null;
      headRepoOwner?: string | null;
      headRepoName?: string | null;
      isCrossRepository?: boolean | null;
    };

export type RepoSummary = {
  requestedPath: string;
  root: string;
  branch: string;
  headSha: string;
  baseRef?: string | null;
  headRef?: string | null;
};

export type SessionSummary = {
  totalFiles: number;
  includedFiles: number;
  excludedFiles: number;
  additions: number;
  deletions: number;
  generatedExcluded: number;
};

export type ReviewFile = {
  id: string;
  path: string;
  patchHash: string;
  oldPath?: string | null;
  changeKind: ChangeKind;
  additions: number;
  deletions: number;
  viewedStatus: ViewedStatus;
  orderGroup?: string | null;
  reviewReason?: string | null;
  agentNotes: AgentNote[];
  hunks: DiffHunk[];
};

export type AgentNote = {
  body: string;
  source?: string | null;
};

export type ReviewOrder = {
  source: ReviewOrderSource;
  title?: string | null;
  createdBy?: string | null;
  manifestPath?: string | null;
  groups: ReviewOrderGroup[];
  warnings: ReviewOrderWarning[];
};

export type ReviewOrderSource = "git" | "agent";

export type ReviewOrderGroup = {
  title: string;
  fileCount: number;
};

export type ReviewOrderWarning = {
  path?: string | null;
  message: string;
};

export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export type ViewedStatus =
  | "unseen"
  | "viewed"
  | "reviewed"
  | "changedSinceViewed"
  | "changedSinceReviewed";

export type DiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

export type DiffLine = {
  kind: DiffLineKind;
  oldLine?: number | null;
  newLine?: number | null;
  diffPosition?: number | null;
  content: string;
};

export type DiffLineKind = "context" | "addition" | "deletion";

export type ExcludedFile = {
  path: string;
  reason: string;
};

export type PatchArtifact = {
  strategy: string;
  fileCount: number;
  diffTarget: string;
};

export type ReviewDiagramScope = "session" | "neighbors" | "deep";

export type ReviewDiagram = {
  version: number;
  analyzerVersion: number;
  id: string;
  sessionId: string;
  repoRoot: string;
  kind: "reviewMap";
  scope: ReviewDiagramScope;
  format: "mermaid";
  source: string;
  overview?: ReviewDiagramOverview | null;
  targetLabel: string;
  target: ReviewTargetRequest;
  snapshotHash: string;
  nodes: ReviewDiagramNode[];
  edges: ReviewDiagramEdge[];
  warnings: ReviewDiagramWarning[];
  stats: ReviewDiagramStats;
  createdAt: string;
  updatedAt: string;
};

export type ReviewDiagramOverview = {
  version?: number | null;
  source?: string | null;
  nodes: ReviewDiagramOverviewNode[];
  edges: ReviewDiagramOverviewEdge[];
  generatedAt?: string | null;
  updatedAt?: string | null;
};

export type ReviewDiagramOverviewNode = {
  id: string;
  label: string;
  description?: string | null;
  kind?: "concept" | "group" | string | null;
  groups?: string[];
  paths?: string[];
  fileIds?: string[];
};

export type ReviewDiagramOverviewEdge = {
  id?: string | null;
  source: string;
  target: string;
  label?: string | null;
};

export type ReviewDiagramNode = {
  id: string;
  fileId?: string | null;
  path?: string | null;
  label: string;
  group: string;
  kind: "file" | "test" | "config" | "doc" | "neighbor" | "collapsed";
  collapsed: boolean;
  order: number;
  reason?: string | null;
};

export type ReviewDiagramEdge = {
  id: string;
  source: string;
  target: string;
  sourcePath?: string | null;
  targetPath?: string | null;
  kind: "reviewOrder" | "import" | "test";
  label: string;
};

export type ReviewDiagramWarning = {
  code?: string | null;
  path?: string | null;
  message: string;
};

export type ReviewDiagramStats = {
  files: number;
  nodes: number;
  edges: number;
  collapsedFiles: number;
  skippedLargeFiles: number;
};

export type InlineCommentVisibility = "private" | "review";

export type InlineCommentSide = "old" | "new";

export type InlineComment = {
  id: string;
  fileId: string;
  path: string;
  side: InlineCommentSide;
  startDiffPosition: number;
  endDiffPosition: number;
  startLine?: number | null;
  endLine?: number | null;
  body: string;
  visibility: InlineCommentVisibility;
  createdAt: string;
  updatedAt: string;
};

export type ThreadReplyDraft = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ThreadReplyDraftMap = Record<string, ThreadReplyDraft[]>;

export type SessionFileState = {
  status: ViewedStatus;
  lastPatchHash?: string;
  privateNote: string;
  inlineComments: InlineComment[];
  threadReplies?: ThreadReplyDraftMap;
};

export type ReviewWorkspaceState = Record<string, SessionFileState>;

export type RecentRepo = {
  root: string;
  requestedPath: string;
  name: string;
  branch: string;
  headSha: string;
  lastOpenedAt: string;
};

export type ReviewHistoryItem = {
  id: string;
  snapshotHash: string;
  repoRoot: string;
  requestedPath: string;
  repoName: string;
  branch: string;
  headSha: string;
  orderSource: ReviewOrderSource;
  title?: string | null;
  createdBy?: string | null;
  manifestPath?: string | null;
  baseRef?: string | null;
  headRef?: string | null;
  target: ReviewTarget;
  totalFiles: number;
  additions: number;
  deletions: number;
  createdAt: string;
  lastRefreshedAt: string;
};
