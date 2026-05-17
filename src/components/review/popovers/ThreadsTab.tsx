import { useMemo, useState } from "react";
import { compactPath } from "@/lib/format";
import {
  threadCommentAuthorLabel,
  threadJumpLine,
  threadLineLabel,
} from "@/lib/github-labels";
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
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2">
        <Chip label="open" count={counts.open} active={filter === "open"} onClick={() => setFilter("open")} />
        <Chip label="resolved" count={counts.resolved} active={filter === "resolved"} onClick={() => setFilter("resolved")} />
        <Chip label="outdated" count={counts.outdated} active={filter === "outdated"} onClick={() => setFilter("outdated")} />
        <Chip label="all" count={counts.total} active={filter === "all"} onClick={() => setFilter("all")} />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="search…"
          className="ml-auto h-7 w-36 rounded-none border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-2 font-voice text-[12px] lowercase text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)] focus-visible:border-[var(--rd-vermillion-line)] focus-visible:outline-none"
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
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="truncate font-mono text-[11px] text-[var(--rd-cream-2)]">
                  {compactPath(group.path, 42)}
                </span>
                <span className="font-voice text-[10.5px] lowercase tracking-[0.02em] text-[var(--rd-pencil)]">
                  · {group.threads.length} {group.threads.length === 1 ? "thread" : "threads"}
                </span>
              </div>
              <ul className="space-y-1">
                {group.threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onJump({
                          path: t.path,
                          line: threadJumpLine(t),
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
                        {threadLineLabel(t)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[9.5px] text-[var(--rd-graphite)]">
                          {threadCommentAuthorLabel(t.comments[0])} ·{" "}
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
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  // Mirrors the FilterChip in DraftsTab so the secondary chip rhythm
  // is identical across the PR overview popover.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "group/chip relative inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap py-1 transition-colors duration-150",
        active
          ? "text-[var(--rd-cream)]"
          : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      <span className="font-voice text-[12.5px] lowercase tracking-[0.01em]">
        {label}
      </span>
      <span
        className={[
          "font-mono text-[11px] tabular-nums leading-none transition-colors duration-150",
          active
            ? "text-[var(--rd-vermillion-2)]"
            : "text-[var(--rd-graphite)] group-hover/chip:text-[var(--rd-cream-2)]",
        ].join(" ")}
      >
        {count}
      </span>
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -bottom-[7px] left-0 right-0 h-[2px] transition-colors duration-150",
          active ? "bg-[var(--rd-vermillion)]" : "bg-transparent",
        ].join(" ")}
      />
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
