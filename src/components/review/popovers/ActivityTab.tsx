import { useMemo, useState } from "react";
import { MarkdownView } from "@/components/review/MarkdownView";
import { dayBucket, relativeTime } from "@/lib/format-time";
import type { PullRequestContext, TimelineEvent } from "@/types/github";

type ActivityFilter = "all" | "reviews" | "comments" | "pushes";

type Props = {
  prContext: PullRequestContext | null;
  error?: string | null;
};

export function ActivityTab({ prContext, error }: Props) {
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const events = useMemo<TimelineEvent[]>(() => {
    if (!prContext) return [];
    return [...prContext.timeline, ...prContext.topLevelComments].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [prContext]);

  const filtered = useMemo(() => filterEvents(events, filter), [events, filter]);
  const buckets = useMemo(() => groupByBucket(filtered), [filtered]);
  const counts = useMemo(() => countActivity(events), [events]);

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
        Loading activity…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2">
        <Chip label="all" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
        <Chip label="reviews" count={counts.reviews} active={filter === "reviews"} onClick={() => setFilter("reviews")} />
        <Chip label="comments" count={counts.comments} active={filter === "comments"} onClick={() => setFilter("comments")} />
        <Chip label="pushes" count={counts.pushes} active={filter === "pushes"} onClick={() => setFilter("pushes")} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {buckets.length === 0 ? (
          <div className="p-4 rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            No activity yet.
          </div>
        ) : (
          buckets.map((bucket) => (
            <section key={bucket.label}>
              <div className="flex items-baseline gap-2 border-y border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-1.5">
                <span className="font-voice text-[11.5px] lowercase tracking-[0.02em] text-[var(--rd-cream-2)]">
                  {bucket.label.toLowerCase()}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--rd-pencil)]">
                  {bucket.events.length}
                </span>
              </div>
              <ul>
                {bucket.events.map((e) => (
                  <li
                    key={e.id}
                    className="border-b border-[var(--rd-hair)] px-3 py-2.5"
                  >
                    <div className="font-mono text-[10.5px] text-[var(--rd-pencil)]">
                      <span className="text-[var(--rd-cream)]">{e.actor}</span>{" "}
                      <span className="rd-display-italic text-[var(--rd-cream-2)]">
                        {verbFor(e)}
                      </span>{" "}
                      <span>{relativeTime(e.createdAt)}</span>
                    </div>
                    {e.body ? (
                      <MarkdownView
                        className="mt-2 rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-3 py-2 font-sans"
                        compact
                      >
                        {e.body}
                      </MarkdownView>
                    ) : null}
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
  // Mirrors the FilterChip in DraftsTab/ThreadsTab so the secondary
  // chip rhythm is identical across the PR overview popover.
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

function countActivity(events: TimelineEvent[]) {
  let reviews = 0;
  let comments = 0;
  let pushes = 0;
  for (const e of events) {
    if (e.kind === "review") reviews += 1;
    else if (e.kind === "push" || e.kind === "force_push") pushes += 1;
    else if (e.body) comments += 1;
  }
  return { all: events.length, reviews, comments, pushes };
}

function filterEvents(events: TimelineEvent[], filter: ActivityFilter) {
  if (filter === "all") return events;
  return events.filter((e) => {
    if (filter === "reviews") return e.kind === "review";
    if (filter === "comments") return e.kind !== "review" && e.body;
    if (filter === "pushes") return e.kind === "push" || e.kind === "force_push";
    return true;
  });
}

function groupByBucket(events: TimelineEvent[]) {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const label = dayBucket(e.createdAt);
    const arr = map.get(label) ?? [];
    arr.push(e);
    map.set(label, arr);
  }
  return Array.from(map.entries()).map(([label, eventsInBucket]) => ({
    label,
    events: eventsInBucket,
  }));
}

function verbFor(e: TimelineEvent): string {
  if (e.kind === "review") {
    switch (e.state) {
      case "APPROVED":
        return "approved";
      case "CHANGES_REQUESTED":
        return "requested changes";
      case "COMMENTED":
        return "commented";
      default:
        return "reviewed";
    }
  }
  if (e.kind === "push") return "pushed";
  if (e.kind === "force_push") return "force-pushed";
  return "commented";
}
