import type { ReviewSession } from "@/types/review";
import type { PullRequestSummary as GhPullRequestSummary } from "@/types/github";
import { SessionChip } from "./SessionChip";

type Props = {
  session: ReviewSession;
  prSummary: GhPullRequestSummary | null;
  isStaleHead: boolean;
  draftsCount: number;
  onOpenSwitcher: () => void;
  onRefresh: () => void;
  onOpenPublish: () => void;
};

export function SessionHeader(props: Props) {
  const {
    session,
    prSummary,
    isStaleHead,
    draftsCount,
    onOpenSwitcher,
    onRefresh,
    onOpenPublish,
  } = props;
  const isPr = session.target.kind === "pullRequest";

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3">
      <SessionChip session={session} onClick={onOpenSwitcher} />
      <span className="flex min-w-0 flex-1 items-center gap-3 font-mono text-[10px] text-[var(--rd-pencil)]">
        {isPr && prSummary ? (
          <>
            <span>● checks {prSummary.checksSummary.state.toLowerCase()}</span>
            <span>
              {prSummary.mergeable === "MERGEABLE"
                ? "✓ mergeable"
                : `⚠ ${prSummary.mergeable?.toLowerCase() ?? "unknown"}`}
            </span>
            <span>
              {session.summary.includedFiles} files · +
              {session.summary.additions} −{session.summary.deletions}
            </span>
            {draftsCount > 0 ? (
              <button
                type="button"
                onClick={onOpenPublish}
                className="text-[var(--rd-vermillion-2)] hover:underline"
              >
                ✎ {draftsCount} drafts
              </button>
            ) : null}
          </>
        ) : (
          <span>
            {session.summary.includedFiles} files · +
            {session.summary.additions} −{session.summary.deletions} ·{" "}
            {session.target.kind}
          </span>
        )}
        {isStaleHead ? (
          <span className="text-[var(--rd-vermillion-2)]">
            ⚠ head moved — refresh
          </span>
        ) : null}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded px-2 py-1 font-mono text-[10px] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
        >
          ⌘K · ⟲
        </button>
        {isPr && draftsCount > 0 ? (
          <button
            type="button"
            onClick={onOpenPublish}
            className="rounded bg-[var(--rd-vermillion)] px-2 py-1 font-mono text-[11px] text-white"
          >
            Publish {draftsCount}
          </button>
        ) : null}
      </div>
    </div>
  );
}
