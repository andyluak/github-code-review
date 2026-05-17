import { useState } from "react";
import { DraftsTab, type DraftJumpTarget } from "./DraftsTab";
import { ThreadsTab } from "./ThreadsTab";
import { ActivityTab } from "./ActivityTab";
import { countThreadReplyDrafts } from "@/lib/thread-reply-drafts";
import type {
  PullRequestContext,
} from "@/types/github";
import type {
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

type Tab = "drafts" | "threads" | "activity";

export type PrOverviewProps = {
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  prContext: PullRequestContext | null;
  prContextError?: string | null;
  initialTab?: Tab;
  onJumpToDraft: (target: DraftJumpTarget) => void;
  onDropDraft: (target: DraftJumpTarget) => void;
  onOpenPublish: () => void;
  onJumpToThread: (target: { path: string; line: number }) => void;
};

export function PrOverviewPopover(props: PrOverviewProps) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? "drafts");

  const draftsCount = countDrafts(props.session, props.workspaceState);
  const threadsOpenCount = props.prContext?.reviewThreads.filter(
    (t) => !t.isResolved && !t.isOutdated,
  ).length ?? 0;
  const threadsTotal = props.prContext?.reviewThreads.length ?? 0;
  const activityTotal =
    (props.prContext?.timeline.length ?? 0) +
    (props.prContext?.topLevelComments.length ?? 0);

  return (
    <div className="flex h-[460px] w-[440px] min-h-0 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2">
        <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">
          PR overview
        </div>
        <div className="font-mono text-[10px] text-[var(--rd-pencil)]">
          {props.session.target.kind === "pullRequest"
            ? `#${props.session.target.number ?? "?"}`
            : ""}
        </div>
      </header>
      <nav className="flex shrink-0 items-end gap-5 border-b border-[var(--rd-hair)] px-3 pt-2 pb-2.5">
        <TabButton
          label="drafts"
          count={draftsCount}
          active={tab === "drafts"}
          onClick={() => setTab("drafts")}
        />
        <TabButton
          label="threads"
          count={`${threadsOpenCount} / ${threadsTotal}`}
          active={tab === "threads"}
          onClick={() => setTab("threads")}
        />
        <TabButton
          label="activity"
          count={activityTotal}
          active={tab === "activity"}
          onClick={() => setTab("activity")}
        />
      </nav>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "drafts" ? (
          <DraftsTab
            session={props.session}
            workspaceState={props.workspaceState}
            onJump={props.onJumpToDraft}
            onDrop={props.onDropDraft}
            onOpenPublish={props.onOpenPublish}
          />
        ) : tab === "threads" ? (
          <ThreadsTab
            prContext={props.prContext}
            error={props.prContextError}
            onJump={props.onJumpToThread}
          />
        ) : (
          <ActivityTab
            prContext={props.prContext}
            error={props.prContextError}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | string;
  active: boolean;
  onClick: () => void;
}) {
  // Voice lowercase label + mono tabular count. Active state is a 2px
  // vermillion rule painted under the word — same "margin marker" idiom
  // as the secondary chip rows. No pill behind the count.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "group/tab relative inline-flex shrink-0 items-baseline gap-2 whitespace-nowrap transition-colors duration-150",
        active
          ? "text-[var(--rd-cream)]"
          : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      <span className="font-voice text-[13.5px] lowercase tracking-[0.01em]">
        {label}
      </span>
      <span
        className={[
          "font-mono text-[11.5px] tabular-nums leading-none transition-colors duration-150",
          active
            ? "text-[var(--rd-vermillion-2)]"
            : "text-[var(--rd-graphite)] group-hover/tab:text-[var(--rd-cream-2)]",
        ].join(" ")}
      >
        {count}
      </span>
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -bottom-[9px] left-0 right-0 h-[2px] transition-colors duration-150",
          active ? "bg-[var(--rd-vermillion)]" : "bg-transparent",
        ].join(" ")}
      />
    </button>
  );
}

function countDrafts(
  session: ReviewSession,
  state: ReviewWorkspaceState,
): number {
  let n = 0;
  for (const file of session.files) {
    const fs = state[file.id];
    if (!fs) continue;
    if (fs.privateNote?.trim()) n += 1;
    for (const c of fs.inlineComments ?? []) {
      if (c.visibility === "review") n += 1;
    }
    n += countThreadReplyDrafts(fs.threadReplies);
  }
  return n;
}
