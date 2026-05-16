import { ChevronDown, GitBranch, GitCommitHorizontal, GitCompare, GitPullRequest } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BranchControls,
  CommitControls,
  PullRequestControls,
  RangeControls,
  TargetModeTabs,
  WorkingTreeControls,
} from "./target-controls";
import type { PullRequestSummary } from "@/types/github";
import type {
  RepoRefs,
  ReviewSession,
  ReviewTargetKind,
} from "@/types/review";

type Props = {
  session: ReviewSession | null;
  targetKind: ReviewTargetKind;
  baseRef: string;
  headRef: string;
  commitRef: string;
  rangeFromRef: string;
  rangeToRef: string;
  pullRequestInput: string;
  pullRequestNumber: number | null;
  repoRefs: RepoRefs | null;
  isRefsLoading: boolean;
  isInboxLoading: boolean;
  inboxError: string | null;
  pullRequests: PullRequestSummary[];

  onTargetKindChange: (next: ReviewTargetKind) => void;
  onBaseRefChange: (next: string) => void;
  onHeadRefChange: (next: string) => void;
  onCommitRefChange: (next: string) => void;
  onRangeFromRefChange: (next: string) => void;
  onRangeToRefChange: (next: string) => void;
  onPullRequestInputChange: (next: string) => void;
  onPullRequestInputSubmit: () => void;
  onPickPullRequest: (pr: PullRequestSummary) => void;
  onCreateSession: () => void;
};

export function TargetChip(props: Props) {
  const disabled = !props.repoRefs || props.isRefsLoading;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--rd-vermillion-line)] bg-[var(--rd-vermillion-bg)] px-3 hover:bg-[var(--rd-ink-3)]"
        >
          <ModeIcon kind={props.targetKind} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--rd-pencil)]">
            {modeLabel(props.targetKind)}
          </span>
          <span className="max-w-[260px] truncate text-[12px] font-semibold text-[var(--rd-cream)]">
            {summarize(props)}
          </span>
          <ChevronDown className="size-3 text-[var(--rd-pencil)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] p-0">
        <TargetModeTabs value={props.targetKind} onChange={props.onTargetKindChange} disabled={disabled} />
        {props.targetKind === "workingTree" ? (
          <WorkingTreeControls onConfirm={props.onCreateSession} />
        ) : props.targetKind === "branch" ? (
          <BranchControls
            baseRef={props.baseRef}
            headRef={props.headRef}
            repoRefs={props.repoRefs}
            disabled={disabled}
            onBaseChange={props.onBaseRefChange}
            onHeadChange={props.onHeadRefChange}
            onConfirm={props.onCreateSession}
          />
        ) : props.targetKind === "commit" ? (
          <CommitControls
            commitRef={props.commitRef}
            repoRefs={props.repoRefs}
            disabled={disabled}
            onChange={props.onCommitRefChange}
            onConfirm={props.onCreateSession}
          />
        ) : props.targetKind === "commitRange" ? (
          <RangeControls
            from={props.rangeFromRef}
            to={props.rangeToRef}
            repoRefs={props.repoRefs}
            disabled={disabled}
            onFromChange={props.onRangeFromRefChange}
            onToChange={props.onRangeToRefChange}
            onConfirm={props.onCreateSession}
          />
        ) : (
          <PullRequestControls
            pullRequests={props.pullRequests}
            isInboxLoading={props.isInboxLoading}
            inboxError={props.inboxError}
            pullRequestInput={props.pullRequestInput}
            pullRequestNumber={props.pullRequestNumber}
            onInputChange={props.onPullRequestInputChange}
            onSubmit={props.onPullRequestInputSubmit}
            onPickPr={props.onPickPullRequest}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function ModeIcon({ kind }: { kind: ReviewTargetKind }) {
  const cls = "size-3.5 text-[var(--rd-graphite)]";
  switch (kind) {
    case "branch":      return <GitBranch className={cls} />;
    case "commit":      return <GitCommitHorizontal className={cls} />;
    case "commitRange": return <GitCompare className={cls} />;
    case "pullRequest": return <GitPullRequest className={cls} />;
    case "workingTree": return <GitCompare className={cls} />;
  }
}

function modeLabel(kind: ReviewTargetKind): string {
  switch (kind) {
    case "workingTree": return "WT";
    case "branch":      return "BR";
    case "commit":      return "COMMIT";
    case "commitRange": return "RANGE";
    case "pullRequest": return "PR";
  }
}

function summarize(props: Props): string {
  const target = props.session?.target;
  if (!target) return "set target";
  switch (target.kind) {
    case "workingTree": return "uncommitted changes";
    case "branch":      return `${target.baseRef} ← ${target.headRef}`;
    case "commit":      return `${target.commit.slice(0, 7)} · ${target.label}`;
    case "commitRange": return `${target.fromRef}…${target.toRef}`;
    case "pullRequest": return target.number !== null && target.number !== undefined ? `#${target.number} ${target.label ?? ""}`.trim() : "set PR";
  }
}
