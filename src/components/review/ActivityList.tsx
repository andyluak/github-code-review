import { useMemo } from "react";
import { MarkdownView } from "@/components/review/MarkdownView";
import type { PullRequestContext, TimelineEvent } from "@/types/github";

type Props = {
  prContext: PullRequestContext | null;
  error?: string | null;
};

export function ActivityList({ prContext, error }: Props) {
  const events = useMemo<TimelineEvent[]>(() => {
    if (!prContext) return [];
    return [...prContext.timeline, ...prContext.topLevelComments].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [prContext]);
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
  if (events.length === 0)
    return (
      <div className="p-4 font-mono text-[11px] text-[var(--rd-pencil)]">
        No activity yet.
      </div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[11px]">
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="border-l border-[var(--rd-hair-2)] pl-3">
            <div className="text-[var(--rd-pencil)]">
              <span className="text-[var(--rd-cream)]">{e.actor}</span>{" "}
              <span className="rd-display-italic text-[var(--rd-cream-2)]">
                {verbFor(e)}
              </span>{" "}
              <span>{relative(e.createdAt)}</span>
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
    </div>
  );
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
  return "commented";
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
