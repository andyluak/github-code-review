import type { CheckRun, CheckRunState } from "@/types/github";

export type CheckPresentation = {
  symbol: string;
  label: string;
  tone: "pass" | "fail" | "run" | "queue" | "neutral" | "dim";
};

const PRESENTATION: Record<CheckRunState, CheckPresentation> = {
  success:         { symbol: "✓", label: "passed",      tone: "pass"    },
  failure:         { symbol: "✗", label: "failed",      tone: "fail"    },
  timed_out:       { symbol: "✗", label: "timed out",   tone: "fail"    },
  in_progress:     { symbol: "●", label: "running",     tone: "run"     },
  queued:          { symbol: "◐", label: "queued",      tone: "queue"   },
  action_required: { symbol: "!", label: "action req",  tone: "fail"    },
  neutral:         { symbol: "―", label: "neutral",     tone: "neutral" },
  skipped:         { symbol: "⤼", label: "skipped",     tone: "dim"     },
  cancelled:       { symbol: "◯", label: "cancelled",   tone: "dim"     },
  stale:           { symbol: "⌚", label: "stale",       tone: "dim"     },
};

export function presentationFor(state: CheckRunState): CheckPresentation {
  return PRESENTATION[state];
}

const SORT_BUCKET: Record<CheckRunState, number> = {
  failure:         2,
  timed_out:       2,
  action_required: 1,
  in_progress:     3,
  queued:          4,
  success:         5,
  neutral:         6,
  skipped:         7,
  cancelled:       8,
  stale:           9,
};

export function sortChecks(checks: CheckRun[]): CheckRun[] {
  return [...checks].sort((a, b) => {
    const aRequiredFail =
      a.required && (a.state === "failure" || a.state === "timed_out") ? 0 : 1;
    const bRequiredFail =
      b.required && (b.state === "failure" || b.state === "timed_out") ? 0 : 1;
    if (aRequiredFail !== bRequiredFail) {
      return aRequiredFail - bRequiredFail;
    }
    const bucketDiff = SORT_BUCKET[a.state] - SORT_BUCKET[b.state];
    if (bucketDiff !== 0) return bucketDiff;
    return a.name.localeCompare(b.name);
  });
}

export type ChecksBucketCounts = {
  passed: number;
  failed: number;
  running: number;
  queued: number;
  other: number;
};

export function bucketCounts(checks: CheckRun[]): ChecksBucketCounts {
  let passed = 0;
  let failed = 0;
  let running = 0;
  let queued = 0;
  let other = 0;
  for (const c of checks) {
    if (c.state === "success") passed += 1;
    else if (c.state === "failure" || c.state === "timed_out" || c.state === "action_required") failed += 1;
    else if (c.state === "in_progress") running += 1;
    else if (c.state === "queued") queued += 1;
    else other += 1;
  }
  return { passed, failed, running, queued, other };
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function formatUpdatedAt(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
