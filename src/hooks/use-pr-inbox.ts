import { useCallback, useEffect, useRef, useState } from "react";
import { listMyPullRequests } from "@/lib/github";
import type { ListMyPullRequestsResponse } from "@/types/github";

export type InboxState = {
  data: ListMyPullRequestsResponse | null;
  isRefreshing: boolean;
  error: string | null;
};

export function usePrInbox(repoPath: string | null) {
  const [state, setState] = useState<InboxState>({
    data: null,
    isRefreshing: false,
    error: null,
  });
  const generation = useRef(0);

  const loadCachedThenRefresh = useCallback(async () => {
    if (!repoPath) return;
    const id = ++generation.current;
    setState({ data: null, isRefreshing: true, error: null });

    try {
      const cached = await listMyPullRequests({ repoPath, force: false });
      if (id === generation.current && cached.fromCache) {
        setState({ data: cached, isRefreshing: true, error: null });
      }
    } catch {
      // Cache miss or GitHub-unavailable is not fatal; the forced refresh reports real errors.
    }

    try {
      const fresh = await listMyPullRequests({ repoPath, force: true });
      if (id === generation.current) {
        setState({ data: fresh, isRefreshing: false, error: null });
      }
    } catch (caught) {
      if (id === generation.current) {
        setState((current) => ({
          ...current,
          isRefreshing: false,
          error: caught instanceof Error ? caught.message : String(caught),
        }));
      }
    }
  }, [repoPath]);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    const id = ++generation.current;
    setState((current) => ({ ...current, isRefreshing: true, error: null }));
    try {
      const fresh = await listMyPullRequests({ repoPath, force: true });
      if (id === generation.current) {
        setState({ data: fresh, isRefreshing: false, error: null });
      }
    } catch (caught) {
      if (id === generation.current) {
        setState((current) => ({
          ...current,
          isRefreshing: false,
          error: caught instanceof Error ? caught.message : String(caught),
        }));
      }
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) {
      generation.current += 1;
      setState({ data: null, isRefreshing: false, error: null });
      return;
    }
    void loadCachedThenRefresh();
  }, [loadCachedThenRefresh, repoPath]);

  return { ...state, refresh };
}
