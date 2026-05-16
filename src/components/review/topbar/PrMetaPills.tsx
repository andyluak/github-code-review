import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChecksPopover } from "@/components/review/popovers/ChecksPopover";
import { PrOverviewPopover } from "@/components/review/popovers/PrOverviewPopover";
import type { DraftJumpTarget } from "@/components/review/popovers/DraftsTab";
import type {
  PullRequestContext,
  PullRequestSummary,
} from "@/types/github";
import type {
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

type Props = {
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  prSummary: PullRequestSummary | null;
  prContext: PullRequestContext | null;
  prContextError?: string | null;
  repoPath: string;
  onOpenPublish: () => void;
  onJumpToDraft: (target: DraftJumpTarget) => void;
  onDropDraft: (target: DraftJumpTarget) => void;
  onJumpToThread: (target: { path: string; line: number }) => void;
};

export function PrMetaPills(props: Props) {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);

  if (!props.prSummary) return null;
  const prSummary = props.prSummary;
  const prNumber =
    props.session.target.kind === "pullRequest" ? props.session.target.number ?? null : null;

  const checks = prSummary.checksSummary;
  const threadsOpen = props.prContext?.reviewThreads.filter(
    (t) => !t.isResolved && !t.isOutdated,
  ).length ?? 0;
  const threadsTotal = props.prContext?.reviewThreads.length ?? 0;
  const approval = approvalLabel(prSummary.reviewDecision);
  const mergeable = mergeableLabel(prSummary.mergeable);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void openUrl(`https://github.com/${prSummary.author.login}`)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] px-2 py-0.5 text-[11px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
      >
        <span
          className="size-4 rounded-full bg-[var(--rd-ink-3)] bg-cover bg-center"
          style={
            prSummary.author.avatarUrl
              ? { backgroundImage: `url(${prSummary.author.avatarUrl})` }
              : undefined
          }
        />
        {prSummary.author.login}
      </button>

      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          approval.tone,
        ].join(" ")}
      >
        <span className="size-1.5 rounded-full bg-current" />
        {approval.label}
      </span>

      <Popover open={checksOpen} onOpenChange={setChecksOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              checksTone(checks.state),
            ].join(" ")}
          >
            <span className="size-1.5 rounded-full bg-current" />
            checks {checks.passing}/{checks.total}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="p-0">
          <ChecksPopover
            repoPath={props.repoPath}
            prNumber={prNumber}
            prUrl={prSummary.url}
            open={checksOpen}
          />
        </PopoverContent>
      </Popover>

      <Popover open={overviewOpen} onOpenChange={setOverviewOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
          >
            <span className="size-1.5 rounded-full bg-current" />
            {threadsOpen}/{threadsTotal} threads
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="p-0">
          <PrOverviewPopover
            session={props.session}
            workspaceState={props.workspaceState}
            prContext={props.prContext}
            prContextError={props.prContextError}
            initialTab="drafts"
            onJumpToDraft={props.onJumpToDraft}
            onDropDraft={props.onDropDraft}
            onOpenPublish={props.onOpenPublish}
            onJumpToThread={props.onJumpToThread}
          />
        </PopoverContent>
      </Popover>

      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          mergeable.tone,
        ].join(" ")}
      >
        <span className="size-1.5 rounded-full bg-current" />
        {mergeable.label}
      </span>
    </div>
  );
}

function approvalLabel(decision: string | null): { label: string; tone: string } {
  if (decision === "APPROVED")
    return { label: "approved", tone: "border-[#234c2b] bg-[#152017] text-[#a4d4a8]" };
  if (decision === "CHANGES_REQUESTED")
    return { label: "changes requested", tone: "border-[#5a2f25] bg-[#211210] text-[var(--rd-del)]" };
  if (decision === "REVIEW_REQUIRED")
    return { label: "review required", tone: "border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream-2)]" };
  return { label: "no review yet", tone: "border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-pencil)]" };
}

function mergeableLabel(value: string | null): { label: string; tone: string } {
  if (value === "MERGEABLE")
    return { label: "mergeable", tone: "border-[#234c2b] bg-[#152017] text-[#a4d4a8]" };
  if (value === "CONFLICTING")
    return { label: "conflicts", tone: "border-[#5a2f25] bg-[#211210] text-[var(--rd-del)]" };
  return { label: (value ?? "unknown").toLowerCase(), tone: "border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-pencil)]" };
}

function checksTone(state: string): string {
  if (state === "PASSING") return "border-[#234c2b] bg-[#152017] text-[#a4d4a8]";
  if (state === "FAILING") return "border-[#5a2f25] bg-[#211210] text-[var(--rd-del)]";
  if (state === "PENDING") return "border-[#553d18] bg-[#211a10] text-[#f1c98a]";
  return "border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-pencil)]";
}
