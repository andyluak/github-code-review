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
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 text-[10px]">
        <Chip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        <Chip label="Reviews" active={filter === "reviews"} onClick={() => setFilter("reviews")} />
        <Chip label="Comments" active={filter === "comments"} onClick={() => setFilter("comments")} />
        <Chip label="Pushes" active={filter === "pushes"} onClick={() => setFilter("pushes")} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {buckets.length === 0 ? (
          <div className="p-4 rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            No activity yet.
          </div>
        ) : (
          buckets.map((bucket) => (
            <section key={bucket.label}>
              <div className="border-y border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                {bucket.label}
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
