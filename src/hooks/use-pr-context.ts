import { useCallback, useEffect, useRef, useState } from "react";
import { loadPullRequestContext } from "@/lib/github";
import type { PullRequestContext } from "@/types/github";

export type PrContextState = {
  context: PullRequestContext | null;
  isRefreshing: boolean;
  error: string | null;
};

export function usePrContext(repoPath: string | null, number: number | null) {
  const [state, setState] = useState<PrContextState>({
    context: null,
    isRefreshing: false,
    error: null,
  });
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!repoPath || number === null) return;
    const id = ++generation.current;
    setState({ context: null, isRefreshing: true, error: null });

    try {
      const cached = await loadPullRequestContext({
        repoPath,
        number,
        force: false,
      });
      if (id === generation.current && cached.fromCache) {
        setState({
          context: cached.context,
          isRefreshing: true,
          error: null,
        });
      }
    } catch {
      // Non-fatal; live refresh below reports errors.
    }

    try {
      const fresh = await loadPullRequestContext({
        repoPath,
        number,
        force: true,
      });
      if (id === generation.current) {
        setState({
          context: fresh.context,
          isRefreshing: false,
          error: null,
        });
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
  }, [number, repoPath]);

  const refresh = useCallback(async () => {
    if (!repoPath || number === null) return;
    const id = ++generation.current;
    setState((current) => ({ ...current, isRefreshing: true, error: null }));
    try {
      const fresh = await loadPullRequestContext({
        repoPath,
        number,
        force: true,
      });
      if (id === generation.current) {
        setState({
          context: fresh.context,
          isRefreshing: false,
          error: null,
        });
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
  }, [number, repoPath]);

  useEffect(() => {
    if (!repoPath || number === null) {
      generation.current += 1;
      setState({ context: null, isRefreshing: false, error: null });
      return;
    }
    void load();
  }, [load, number, repoPath]);

  return { ...state, refresh };
}
