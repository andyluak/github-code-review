import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mockListCheckRuns } from "@/lib/mock-checks";
import type { ListCheckRunsResponse } from "@/types/github";

type UseChecksOptions = {
  enabled: boolean;
  refreshIntervalMs?: number;
};

type UseChecksResult = {
  data: ListCheckRunsResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const DEFAULT_REFRESH_MS = 30_000;

export function useChecks(
  repoPath: string | null,
  prNumber: number | null,
  options: UseChecksOptions,
): UseChecksResult {
  const [data, setData] = useState<ListCheckRunsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const enabled = options.enabled && repoPath !== null && prNumber !== null;
  const fetchIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || repoPath === null || prNumber === null) {
      return;
    }
    const id = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await mockListCheckRuns(repoPath, prNumber);
      if (id !== fetchIdRef.current) return;
      setData(response);
    } catch (caught) {
      if (id !== fetchIdRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (id === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, repoPath, prNumber]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    void refresh();
    const handle = window.setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
    return () => window.clearInterval(handle);
  }, [enabled, refresh, refreshIntervalMs]);

  return useMemo(
    () => ({ data, isLoading, error, refresh }),
    [data, isLoading, error, refresh],
  );
}
