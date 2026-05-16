import { invoke } from "@tauri-apps/api/core";
import type {
  GetRepoPrefsRequest,
  GetRepoPrefsResponse,
  GitHubViewer,
  ListMyPullRequestsRequest,
  ListMyPullRequestsResponse,
  LoadPullRequestContextRequest,
  LoadPullRequestContextResponse,
  MergePullRequestRequest,
  MergePullRequestResponse,
  PublishReviewRequest,
  PublishReviewResponse,
  RefreshPullRequestHeadRequest,
  RefreshPullRequestHeadResponse,
  SetRepoPrefsRequest,
} from "@/types/github";

const inFlightReads = new Map<string, Promise<unknown>>();

function invokeRead<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const key = `${command}:${JSON.stringify(args ?? {})}`;
  const existing = inFlightReads.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = invoke<T>(command, args).finally(() => {
    inFlightReads.delete(key);
  });
  inFlightReads.set(key, request);
  return request;
}

export function getGithubViewer(): Promise<GitHubViewer> {
  return invokeRead("get_github_viewer");
}

export function listMyPullRequests(
  request: ListMyPullRequestsRequest,
): Promise<ListMyPullRequestsResponse> {
  return invokeRead("list_my_pull_requests", { request });
}

export function loadPullRequestContext(
  request: LoadPullRequestContextRequest,
): Promise<LoadPullRequestContextResponse> {
  return invokeRead("load_pull_request_context", { request });
}

export function refreshPullRequestHead(
  request: RefreshPullRequestHeadRequest,
): Promise<RefreshPullRequestHeadResponse> {
  return invokeRead("refresh_pull_request_head", { request });
}

export function publishPullRequestReview(
  request: PublishReviewRequest,
): Promise<PublishReviewResponse> {
  return invoke("publish_pull_request_review", { request });
}

export function mergePullRequest(
  request: MergePullRequestRequest,
): Promise<MergePullRequestResponse> {
  return invoke("merge_pull_request", { request });
}

export function getRepoPrefs(
  request: GetRepoPrefsRequest,
): Promise<GetRepoPrefsResponse> {
  return invokeRead("get_repo_prefs", { request });
}

export function setRepoPrefs(
  request: SetRepoPrefsRequest,
): Promise<GetRepoPrefsResponse> {
  return invoke("set_repo_prefs", { request });
}
