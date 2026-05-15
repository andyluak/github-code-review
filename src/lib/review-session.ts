import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveReviewSession,
  ActiveReviewSessionRequest,
  CreateReviewSessionRequest,
  ImportReviewSessionRequest,
  ListReviewRefsRequest,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
  ReviewWorkspaceState,
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

export function createDefaultFileState(): SessionFileState {
  return {
    status: "unseen",
    privateNote: "",
    publishableDraft: "",
    inlineComments: [],
  };
}

export function loadWorkspaceState(sessionId: string): ReviewWorkspaceState {
  const value = window.localStorage.getItem(storageKey(sessionId));
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as ReviewWorkspaceState;
  } catch {
    return {};
  }
}

export function saveWorkspaceState(
  sessionId: string,
  state: ReviewWorkspaceState,
) {
  window.localStorage.setItem(storageKey(sessionId), JSON.stringify(state));
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
  return readJson<ReviewHistoryItem[]>(REVIEW_HISTORY_KEY, []);
}

export function rememberReviewSession(session: ReviewSession): ReviewHistoryItem[] {
  const nextItem: ReviewHistoryItem = {
    id: session.id,
    repoRoot: session.repo.root,
    requestedPath: session.repo.requestedPath,
    repoName: basename(session.repo.root),
    branch: session.repo.branch,
    headSha: session.repo.headSha,
    orderSource: session.order.source,
    title: session.order.title,
    createdBy: session.order.createdBy,
    baseRef: session.repo.baseRef,
    headRef: session.repo.headRef,
    totalFiles: session.summary.includedFiles,
    additions: session.summary.additions,
    deletions: session.summary.deletions,
    createdAt: new Date().toISOString(),
  };
  const nextHistory = [
    nextItem,
    ...loadReviewHistory().filter((item) => item.id !== nextItem.id),
  ].slice(0, 20);

  window.localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(nextHistory));
  return nextHistory;
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

function storageKey(sessionId: string) {
  return `review-desk.session.${sessionId}`;
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
const LAST_REPO_KEY = "review-desk.last-repo";
