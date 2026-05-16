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

export function getGithubViewer(): Promise<GitHubViewer> {
  return invoke("get_github_viewer");
}

export function listMyPullRequests(
  request: ListMyPullRequestsRequest,
): Promise<ListMyPullRequestsResponse> {
  return invoke("list_my_pull_requests", { request });
}

export function loadPullRequestContext(
  request: LoadPullRequestContextRequest,
): Promise<LoadPullRequestContextResponse> {
  return invoke("load_pull_request_context", { request });
}

export function refreshPullRequestHead(
  request: RefreshPullRequestHeadRequest,
): Promise<RefreshPullRequestHeadResponse> {
  return invoke("refresh_pull_request_head", { request });
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
  return invoke("get_repo_prefs", { request });
}

export function setRepoPrefs(
  request: SetRepoPrefsRequest,
): Promise<GetRepoPrefsResponse> {
  return invoke("set_repo_prefs", { request });
}
