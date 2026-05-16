import { useMemo } from "react";
import type { PullRequestContext, ReviewThread } from "@/types/github";

type Props = {
  prContext: PullRequestContext | null;
  error?: string | null;
  onJump: (target: { path: string; line: number }) => void;
};

export function ConversationsList({ prContext, error, onJump }: Props) {
  const grouped = useMemo(
    () => groupByFile(prContext?.reviewThreads ?? []),
    [prContext],
  );
  if (!prContext) {
    if (error) {
      return (
        <div className="p-4 font-mono text-[11px] leading-snug text-[var(--rd-del)]">
          {error}
        </div>
      );
    }
    return (
      <div className="p-4 font-mono text-[11px] text-[var(--rd-pencil)]">
        Loading conversations…
      </div>
    );
  }
  if (grouped.length === 0) {
    return (
      <div className="p-4 font-mono text-[11px] text-[var(--rd-pencil)]">
        No conversations yet.
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {grouped.map(({ path, threads }) => (
        <section
          key={path}
          className="border-b border-[var(--rd-hair)] px-4 py-3"
        >
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]">
            {path}
          </div>
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() =>
                    onJump({
                      path: t.path,
                      line: t.line ?? t.originalLine ?? 0,
                    })
                  }
                  className="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-[var(--rd-ink-2)]"
                >
                  <span
                    className={
                      t.isResolved
                        ? "font-mono text-[10px] text-[var(--rd-pencil)]"
                        : t.isOutdated
                          ? "font-mono text-[10px] text-[var(--rd-cream-2)]"
                          : "font-mono text-[10px] text-[var(--rd-vermillion-2)]"
                    }
                  >
                    {t.isResolved ? "●" : t.isOutdated ? "○" : "◐"}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
                    L{t.line ?? t.originalLine ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--rd-cream)]">
                    {t.comments[0]?.body ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByFile(
  threads: ReviewThread[],
): { path: string; threads: ReviewThread[] }[] {
  const map = new Map<string, ReviewThread[]>();
  for (const t of threads) {
    const arr = map.get(t.path) ?? [];
    arr.push(t);
    map.set(t.path, arr);
  }
  return Array.from(map.entries())
    .map(([path, ts]) => ({
      path,
      threads: [...ts].sort((a, b) => {
        if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1;
        return (a.line ?? 0) - (b.line ?? 0);
      }),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
