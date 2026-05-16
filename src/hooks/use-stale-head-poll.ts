import { useEffect, useRef, useState } from "react";
import { refreshPullRequestHead } from "@/lib/github";

export type StaleHeadState = {
  latestHeadSha: string | null;
  isStale: boolean;
  error: string | null;
};

export function useStaleHeadPoll(
  repoPath: string | null,
  prNumber: number | null,
  currentHeadSha: string | null,
  intervalMs = 60_000,
) {
  const [state, setState] = useState<StaleHeadState>({
    latestHeadSha: null,
    isStale: false,
    error: null,
  });
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    generation.current += 1;
    setState({ latestHeadSha: null, isStale: false, error: null });
  }, [prNumber, repoPath]);

  useEffect(() => {
    if (!repoPath || prNumber === null) return;
    const id = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      try {
        const result = await refreshPullRequestHead({
          repoPath: repoPath as string,
          number: prNumber as number,
        });
        if (id !== generation.current) return;
        const latest = result.probe.headRefOid;
        setState({
          latestHeadSha: latest,
          isStale:
            currentHeadSha !== null && latest !== null && latest !== currentHeadSha,
          error: null,
        });
      } catch (caught) {
        if (id !== generation.current) return;
        setState((current) => ({
          ...current,
          error: caught instanceof Error ? caught.message : String(caught),
        }));
      } finally {
        inFlight.current = false;
      }
    }

    void tick();
    timer = setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentHeadSha, intervalMs, prNumber, repoPath]);

  return state;
}
