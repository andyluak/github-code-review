import { useMemo, useState } from "react";
import { compactPath } from "@/lib/format";
import { relativeTime } from "@/lib/format-time";
import type { PullRequestContext, ReviewThread } from "@/types/github";

type ThreadFilter = "open" | "resolved" | "outdated" | "all";

type Props = {
  prContext: PullRequestContext | null;
  error?: string | null;
  onJump: (target: { path: string; line: number }) => void;
};

export function ThreadsTab({ prContext, error, onJump }: Props) {
  const [filter, setFilter] = useState<ThreadFilter>("open");
  const [query, setQuery] = useState("");

  const threads = prContext?.reviewThreads ?? [];
  const filtered = useMemo(
    () => applyThreadFilter(threads, filter, query),
    [threads, filter, query],
  );
  const grouped = useMemo(() => groupByFile(filtered), [filtered]);
  const counts = useMemo(() => countThreads(threads), [threads]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 text-[10px]">
        <Chip label={`Open · ${counts.open}`} active={filter === "open"} onClick={() => setFilter("open")} />
        <Chip label={`Resolved · ${counts.resolved}`} active={filter === "resolved"} onClick={() => setFilter("resolved")} />
        <Chip label={`Outdated · ${counts.outdated}`} active={filter === "outdated"} onClick={() => setFilter("outdated")} />
        <Chip label={`All · ${counts.total}`} active={filter === "all"} onClick={() => setFilter("all")} />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search…"
          className="ml-auto h-6 w-32 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[10px] text-[var(--rd-cream)] placeholder:text-[var(--rd-graphite)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="p-4 rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            No threads match.
          </div>
        ) : (
          grouped.map((group) => (
            <section
              key={group.path}
              className="border-b border-[var(--rd-hair)] px-3 py-2.5"
            >
              <div className="mb-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]">
                {compactPath(group.path, 42)}
              </div>
              <ul className="space-y-1">
                {group.threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onJump({
                          path: t.path,
                          line: t.line ?? t.originalLine ?? 0,
                        })
                      }
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--rd-ink-2)]"
                    >
                      <span
                        className={
                          t.isResolved
                            ? "mt-1 size-1.5 rounded-full bg-[var(--rd-pencil)]"
                            : t.isOutdated
                              ? "mt-1 size-1.5 rounded-full bg-[var(--rd-cream-2)]"
                              : "mt-1 size-1.5 rounded-full bg-[var(--rd-vermillion-2)]"
                        }
                      />
                      <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
                        L{t.line ?? t.originalLine ?? "?"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[9.5px] text-[var(--rd-graphite)]">
                          {t.comments[0]?.author ?? "unknown"} ·{" "}
                          {t.comments[0]?.createdAt ? relativeTime(t.comments[0].createdAt) : ""}
                        </span>
                        <span className="line-clamp-2 text-[11px] text-[var(--rd-cream)]">
                          {t.comments[0]?.body ?? ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-[var(--rd-pencil)]">
                        {t.comments.length} ↩
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-6 rounded-full px-2.5 font-mono text-[10px] uppercase tracking-wider",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function applyThreadFilter(
  threads: ReviewThread[],
  filter: ThreadFilter,
  query: string,
): ReviewThread[] {
  const q = query.trim().toLowerCase();
  return threads.filter((t) => {
    if (filter === "open" && (t.isResolved || t.isOutdated)) return false;
    if (filter === "resolved" && !t.isResolved) return false;
    if (filter === "outdated" && !t.isOutdated) return false;
    if (q) {
      const haystack = (t.comments[0]?.body ?? "") + " " + t.path;
      if (!haystack.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function countThreads(threads: ReviewThread[]) {
  let open = 0;
  let resolved = 0;
  let outdated = 0;
  for (const t of threads) {
    if (t.isOutdated) outdated += 1;
    else if (t.isResolved) resolved += 1;
    else open += 1;
  }
  return { open, resolved, outdated, total: threads.length };
}

function groupByFile(threads: ReviewThread[]) {
  const map = new Map<string, ReviewThread[]>();
  for (const t of threads) {
    const arr = map.get(t.path) ?? [];
    arr.push(t);
    map.set(t.path, arr);
  }
  return Array.from(map.entries())
    .map(([path, ts]) => ({
      path,
      threads: [...ts].sort((a, b) => (a.line ?? 0) - (b.line ?? 0)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
