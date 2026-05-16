import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveReviewSession,
  ActiveReviewSessionRequest,
  CreateReviewSessionRequest,
  ImportReviewSessionRequest,
  LoadReviewDiagramRequest,
  LoadReviewWorkspaceStateRequest,
  ListReviewRefsRequest,
  OpenReviewFileRequest,
  RecentRepo,
  RepoRefs,
  ReviewDiagram,
  ReviewHistoryItem,
  ReviewSession,
  ReviewWorkspaceState,
  SaveReviewDiagramRequest,
  SaveReviewWorkspaceStateRequest,
  SaveTextFileRequest,
  SessionFileState,
  ViewedStatus,
} from "@/types/review";

export async function createReviewSession(
  request: CreateReviewSessionRequest,
): Promise<ReviewSession> {
  return invoke<ReviewSession>("create_review_session", { request });
}

export async function importReviewSession(
  request: ImportReviewSessionRequest,
): Promise<ReviewSession> {
  return invoke<ReviewSession>("import_review_session", { request });
}

export async function getActiveReviewSession(
  request: ActiveReviewSessionRequest,
): Promise<ActiveReviewSession | null> {
  return invoke<ActiveReviewSession | null>("get_active_review_session", {
    request,
  });
}

export async function getGlobalActiveReviewSession(): Promise<ActiveReviewSession | null> {
  return invoke<ActiveReviewSession | null>("get_global_active_review_session");
}

export async function importActiveReviewSession(
  request: ActiveReviewSessionRequest,
): Promise<ReviewSession | null> {
  return invoke<ReviewSession | null>("import_active_review_session", {
    request,
  });
}

export async function importGlobalActiveReviewSession(): Promise<ReviewSession | null> {
  return invoke<ReviewSession | null>("import_global_active_review_session");
}

export async function listReviewRefs(
  request: ListReviewRefsRequest,
): Promise<RepoRefs> {
  return invoke<RepoRefs>("list_review_refs", { request });
}

export async function saveTextFile(
  request: SaveTextFileRequest,
): Promise<void> {
  return invoke<void>("save_text_file", { request });
}

export async function loadReviewDiagram(
  request: LoadReviewDiagramRequest,
): Promise<ReviewDiagram | null> {
  return invoke<ReviewDiagram | null>("load_review_diagram", { request });
}

export async function saveReviewDiagram(
  request: SaveReviewDiagramRequest,
): Promise<ReviewDiagram> {
  return invoke<ReviewDiagram>("save_review_diagram", { request });
}

export async function openReviewFile(
  request: OpenReviewFileRequest,
): Promise<void> {
  return invoke<void>("open_review_file", { request });
}

export function createDefaultFileState(): SessionFileState {
  return {
    status: "unseen",
    lastPatchHash: undefined,
    privateNote: "",
    publishableDraft: "",
    inlineComments: [],
    threadReplies: {},
  };
}

export async function loadWorkspaceState(
  session: ReviewSession,
): Promise<ReviewWorkspaceState> {
  const request: LoadReviewWorkspaceStateRequest = {
    repoPath: session.repo.root,
    sessionId: session.id,
    legacySessionIds: session.legacySessionIds,
  };
  const appState = await invoke<ReviewWorkspaceState | null>(
    "load_review_workspace_state",
    { request },
  );
  const legacyState = loadLegacyWorkspaceState(session);
  const mergedState = mergeWorkspaceStates(appState ?? {}, legacyState);

  if (
    hasWorkspaceState(mergedState) &&
    JSON.stringify(mergedState) !== JSON.stringify(appState ?? {})
  ) {
    await saveWorkspaceState(session, mergedState);
  }

  return mergedState;
}

export function loadLegacyWorkspaceState(session: ReviewSession): ReviewWorkspaceState {
  for (const sessionId of workspaceStateSessionIds(session)) {
    const value = window.localStorage.getItem(storageKey(sessionId));
    if (!value) {
      continue;
    }

    try {
      return JSON.parse(value) as ReviewWorkspaceState;
    } catch {
      continue;
    }
  }

  return {};
}

export async function saveWorkspaceState(
  session: ReviewSession,
  state: ReviewWorkspaceState,
): Promise<void> {
  const request: SaveReviewWorkspaceStateRequest = {
    repoPath: session.repo.root,
    sessionId: session.id,
    state,
  };
  await invoke<void>("save_review_workspace_state", { request });
}

export function loadRecentRepos(): RecentRepo[] {
  return readJson<RecentRepo[]>(RECENT_REPOS_KEY, []);
}

export function rememberRepo(refs: RepoRefs): RecentRepo[] {
  const nextRepo: RecentRepo = {
    root: refs.root,
    requestedPath: refs.requestedPath,
    name: basename(refs.root),
    branch: refs.currentBranch,
    headSha: refs.headSha,
    lastOpenedAt: new Date().toISOString(),
  };
  const nextRepos = [
    nextRepo,
    ...loadRecentRepos().filter((repo) => repo.root !== nextRepo.root),
  ].slice(0, 10);

  window.localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(nextRepos));
  window.localStorage.setItem(LAST_REPO_KEY, refs.root);
  return nextRepos;
}

export function loadLastRepoPath(): string {
  return window.localStorage.getItem(LAST_REPO_KEY) ?? "";
}

export function loadReviewHistory(): ReviewHistoryItem[] {
  const history = readJson<ReviewHistoryItem[]>(REVIEW_HISTORY_KEY, []);
  const nextHistory = dedupeReviewHistory(history);
  if (nextHistory.length !== history.length) {
    window.localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(nextHistory));
    pruneReviewSessionSnapshots(nextHistory);
  }
  return nextHistory;
}

export function rememberReviewSession(session: ReviewSession): ReviewHistoryItem[] {
  const currentHistory = loadReviewHistory();
  const now = new Date().toISOString();
  const nextItem: ReviewHistoryItem = {
    id: session.id,
    snapshotHash: session.snapshotHash,
    repoRoot: session.repo.root,
    requestedPath: session.repo.requestedPath,
    repoName: basename(session.repo.root),
    branch: session.repo.branch,
    headSha: session.repo.headSha,
    orderSource: session.order.source,
    title: session.order.title,
    createdBy: session.order.createdBy,
    manifestPath: session.order.manifestPath,
    baseRef: session.repo.baseRef,
    headRef: session.repo.headRef,
    target: session.target,
    totalFiles: session.summary.includedFiles,
    additions: session.summary.additions,
    deletions: session.summary.deletions,
    createdAt: createdAtForHistoryItem(currentHistory, session, now),
    lastRefreshedAt: now,
  };
  const nextKey = reviewHistoryKey(nextItem);
  const existingAgent = currentHistory.find(
    (item) => reviewHistoryKey(item) === nextKey && item.orderSource === "agent",
  );

  if (nextItem.orderSource === "git" && existingAgent) {
    return currentHistory;
  }

  const nextHistory = [
    nextItem,
    ...currentHistory.filter(
      (item) => item.id !== nextItem.id && reviewHistoryKey(item) !== nextKey,
    ),
  ].slice(0, 20);

  window.localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(nextHistory));
  saveReviewSessionSnapshot(session);
  pruneReviewSessionSnapshots(nextHistory);
  return nextHistory;
}

export function deleteReviewHistoryItem(sessionId: string): ReviewHistoryItem[] {
  const nextHistory = loadReviewHistory().filter((item) => item.id !== sessionId);
  window.localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(nextHistory));
  deleteReviewSessionSnapshot(sessionId);
  return nextHistory;
}

export function clearReviewHistory(): ReviewHistoryItem[] {
  const currentHistory = loadReviewHistory();
  window.localStorage.removeItem(REVIEW_HISTORY_KEY);
  for (const item of currentHistory) {
    deleteReviewSessionSnapshot(item.id);
  }
  pruneReviewSessionSnapshots([]);
  return [];
}

export function loadReviewSessionSnapshot(sessionId: string): ReviewSession | null {
  return readJson<ReviewSession | null>(reviewSessionSnapshotKey(sessionId), null);
}

export function saveReviewSessionSnapshot(session: ReviewSession) {
  try {
    window.localStorage.setItem(
      reviewSessionSnapshotKey(session.id),
      JSON.stringify(session),
    );
  } catch {
    // Snapshots are an acceleration cache; history/state should keep working if storage is full.
  }
}

export function pruneReviewSessionSnapshots(history = loadReviewHistory()) {
  const activeIds = new Set(history.map((item) => item.id));
  const staleKeys: string[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (
      key?.startsWith(REVIEW_SESSION_SNAPSHOT_PREFIX) &&
      !activeIds.has(key.slice(REVIEW_SESSION_SNAPSHOT_PREFIX.length))
    ) {
      staleKeys.push(key);
    }
  }

  for (const key of staleKeys) {
    window.localStorage.removeItem(key);
  }
}

function createdAtForHistoryItem(
  history: ReviewHistoryItem[],
  session: ReviewSession,
  fallback: string,
) {
  const exact = history.find((item) => item.id === session.id);
  if (exact) {
    return exact.createdAt;
  }

  const key = reviewHistoryKey({
    id: session.id,
    snapshotHash: session.snapshotHash,
    repoRoot: session.repo.root,
    requestedPath: session.repo.requestedPath,
    repoName: basename(session.repo.root),
    branch: session.repo.branch,
    headSha: session.repo.headSha,
    orderSource: session.order.source,
    title: session.order.title,
    createdBy: session.order.createdBy,
    manifestPath: session.order.manifestPath,
    baseRef: session.repo.baseRef,
    headRef: session.repo.headRef,
    target: session.target,
    totalFiles: session.summary.includedFiles,
    additions: session.summary.additions,
    deletions: session.summary.deletions,
    createdAt: fallback,
    lastRefreshedAt: fallback,
  });

  return history.find((item) => reviewHistoryKey(item) === key)?.createdAt ?? fallback;
}

function dedupeReviewHistory(history: ReviewHistoryItem[]) {
  const byKey = new Map<string, ReviewHistoryItem>();

  for (const item of history) {
    const key = reviewHistoryKey(item);
    const existing = byKey.get(key);
    if (!existing || shouldReplaceHistoryItem(item, existing)) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()];
}

function shouldReplaceHistoryItem(candidate: ReviewHistoryItem, current: ReviewHistoryItem) {
  if (candidate.orderSource === "agent" && current.orderSource !== "agent") {
    return true;
  }

  if (candidate.orderSource !== current.orderSource) {
    return false;
  }

  return timestampValue(candidate.lastRefreshedAt) > timestampValue(current.lastRefreshedAt);
}

function reviewHistoryKey(item: ReviewHistoryItem) {
  const target = item.target;
  const repo = item.repoRoot;

  if (target) {
    switch (target.kind) {
      case "workingTree":
        return `${repo}|workingTree`;
      case "branch":
        return `${repo}|branch|${target.baseRef}|${normalHistoryRef(target.headRef)}`;
      case "commit":
        return `${repo}|commit|${target.commit}`;
      case "commitRange":
        return `${repo}|commitRange|${target.fromRef}|${target.toRef}`;
      case "pullRequest":
        return target.number
          ? `${repo}|pullRequest|${target.remote ?? ""}|${target.number}`
          : `${repo}|pullRequest|${target.url ?? ""}|${target.baseRef}|${target.headRef}`;
    }
  }

  return `${repo}|legacy|${item.baseRef ?? ""}|${normalHistoryRef(item.headRef)}`;
}

function normalHistoryRef(value?: string | null) {
  if (!value) {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "worktree" ||
    normalized === "working-tree" ||
    normalized === "working tree"
  ) {
    return "WORKTREE";
  }
  return value;
}

function timestampValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function nextViewedStatus(
  current: ViewedStatus | undefined,
  target: "viewed" | "reviewed",
): ViewedStatus {
  if (target === "reviewed") {
    return "reviewed";
  }

  return current === "reviewed" ? "reviewed" : "viewed";
}

export function toggleViewedStatus(current: ViewedStatus | undefined): ViewedStatus {
  switch (current) {
    case "viewed":
      return "unseen";
    case "reviewed":
    case "changedSinceReviewed":
    case "changedSinceViewed":
      return "viewed";
    case "unseen":
    default:
      return "viewed";
  }
}

export function toggleReviewedStatus(current: ViewedStatus | undefined): ViewedStatus {
  switch (current) {
    case "reviewed":
      return "viewed";
    case "unseen":
    case "viewed":
    case "changedSinceViewed":
    case "changedSinceReviewed":
    default:
      return "reviewed";
  }
}

export function reconcileWorkspaceState(
  session: ReviewSession,
  state: ReviewWorkspaceState,
): ReviewWorkspaceState {
  const next: ReviewWorkspaceState = {};
  const claimed = new Set<string>();

  // Build lookup tables of prior state by path so rename/path-equality can carry forward.
  const stateByPath = new Map<string, { fileId: string; value: SessionFileState }>();
  for (const [fileId, value] of Object.entries(state)) {
    if (!value) continue;
    const previousFile = session.files.find((f) => f.id === fileId);
    if (previousFile) {
      stateByPath.set(previousFile.path, { fileId, value });
    }
  }

  for (const file of session.files) {
    const candidateById = state[file.id];
    const candidateByOldPath = file.oldPath
      ? Object.entries(state).find(([_fileId, value]) => {
          if (!value) return false;
          const prev = session.files.find((f) => f.id === _fileId);
          return prev?.path === file.oldPath;
        })?.[1]
      : undefined;
    const candidateByPath = stateByPath.get(file.path)?.value;

    const source: SessionFileState =
      candidateById ?? candidateByOldPath ?? candidateByPath ?? createDefaultFileState();

    const previous = {
      ...createDefaultFileState(),
      ...source,
    };
    let status = previous.status;

    if (
      previous.lastPatchHash &&
      previous.lastPatchHash !== file.patchHash &&
      (status === "viewed" || status === "reviewed")
    ) {
      status =
        status === "reviewed" ? "changedSinceReviewed" : "changedSinceViewed";
    }

    next[file.id] = {
      ...previous,
      status,
      lastPatchHash: file.patchHash,
    };
    claimed.add(file.id);
  }

  // Drop orphan entries — keep state lean once files leave the session.
  return next;
}

function mergeWorkspaceStates(
  current: ReviewWorkspaceState,
  recovered: ReviewWorkspaceState,
): ReviewWorkspaceState {
  const next: ReviewWorkspaceState = { ...current };

  for (const fileId of new Set([...Object.keys(current), ...Object.keys(recovered)])) {
    next[fileId] = mergeFileState(current[fileId], recovered[fileId]);
  }

  return next;
}

function mergeFileState(
  current: SessionFileState | undefined,
  recovered: SessionFileState | undefined,
): SessionFileState {
  const currentState = {
    ...createDefaultFileState(),
    ...current,
  };
  const recoveredState = {
    ...createDefaultFileState(),
    ...recovered,
  };

  return {
    ...currentState,
    status:
      viewedStatusRank(recoveredState.status) > viewedStatusRank(currentState.status)
        ? recoveredState.status
        : currentState.status,
    lastPatchHash: currentState.lastPatchHash ?? recoveredState.lastPatchHash,
    privateNote: currentState.privateNote?.trim()
      ? currentState.privateNote
      : (recoveredState.privateNote ?? ""),
    publishableDraft: currentState.publishableDraft?.trim()
      ? currentState.publishableDraft
      : (recoveredState.publishableDraft ?? ""),
    inlineComments: mergeInlineComments(
      currentState.inlineComments ?? [],
      recoveredState.inlineComments ?? [],
    ),
    threadReplies: {
      ...(recoveredState.threadReplies && typeof recoveredState.threadReplies === "object"
        ? recoveredState.threadReplies
        : {}),
      ...(currentState.threadReplies && typeof currentState.threadReplies === "object"
        ? currentState.threadReplies
        : {}),
    },
  };
}

function viewedStatusRank(status: ViewedStatus | undefined) {
  switch (status) {
    case "reviewed":
      return 4;
    case "changedSinceReviewed":
      return 3;
    case "viewed":
      return 2;
    case "changedSinceViewed":
      return 1;
    case "unseen":
    default:
      return 0;
  }
}

function mergeInlineComments(
  current: SessionFileState["inlineComments"],
  recovered: SessionFileState["inlineComments"],
) {
  const byId = new Map<string, SessionFileState["inlineComments"][number]>();

  for (const comment of [...current, ...recovered]) {
    const existing = byId.get(comment.id);
    if (!existing || timestampValue(comment.updatedAt) >= timestampValue(existing.updatedAt)) {
      byId.set(comment.id, comment);
    }
  }

  return [...byId.values()];
}

function workspaceStateSessionIds(session: ReviewSession) {
  return [session.id, ...(session.legacySessionIds ?? [])];
}

function hasWorkspaceState(state: ReviewWorkspaceState) {
  return Object.keys(state).length > 0;
}

function storageKey(sessionId: string) {
  return `review-desk.session.${sessionId}`;
}

function reviewSessionSnapshotKey(sessionId: string) {
  return `${REVIEW_SESSION_SNAPSHOT_PREFIX}${sessionId}`;
}

function deleteReviewSessionSnapshot(sessionId: string) {
  window.localStorage.removeItem(reviewSessionSnapshotKey(sessionId));
}

function readJson<T>(key: string, fallback: T): T {
  const value = window.localStorage.getItem(key);
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function basename(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const RECENT_REPOS_KEY = "review-desk.recent-repos";
const REVIEW_HISTORY_KEY = "review-desk.review-history";
const REVIEW_SESSION_SNAPSHOT_PREFIX = "review-desk.review-session-snapshot.";
const LAST_REPO_KEY = "review-desk.last-repo";
