import { memo } from "react";
import type { PullRequestSummary } from "@/types/github";
import { RowCheckDots } from "./RowCheckDots";

type PRRowProps = {
  pr: PullRequestSummary;
  hasLocalDraft: boolean;
  isStale: boolean;
  selected: boolean;
  onSelect: (pr: PullRequestSummary) => void;
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function reviewStatePill(
  state: string | null,
): { label: string; cls: string } | null {
  if (!state) return null;
  switch (state) {
    case "APPROVED":
      return { label: "✓ approved", cls: "text-[var(--rd-add)]" };
    case "CHANGES_REQUESTED":
      return { label: "× changes", cls: "text-[var(--rd-del)]" };
    case "COMMENTED":
      return { label: "· commented", cls: "text-[var(--rd-pencil)]" };
    default:
      return null;
  }
}

export const PRRow = memo(function PRRow({
  pr,
  hasLocalDraft,
  isStale,
  selected,
  onSelect,
}: PRRowProps) {
  const numberColor = pr.isReviewRequestedFromViewer
    ? "text-[var(--rd-vermillion-2)]"
    : "text-[var(--rd-cream)]";
  const pill = reviewStatePill(pr.viewerReviewState);

  return (
    <button
      type="button"
      onClick={() => onSelect(pr)}
      className={[
        "flex w-full items-start gap-3 px-5 py-2 text-left",
        "border-b border-[var(--rd-hair)]",
        selected
          ? "bg-[var(--rd-vermillion-bg)]"
          : "hover:bg-[var(--rd-ink-2)]",
      ].join(" ")}
    >
      <span className={`shrink-0 font-mono text-[12px] ${numberColor}`}>
        #{pr.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] leading-5 text-[var(--rd-cream)]">
          {pr.title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--rd-pencil)]">
          {pr.author.login} · {relativeTime(pr.updatedAt)} · {pr.baseRefName} ←{" "}
          {pr.headRefName}
        </span>
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-2 font-mono text-[10px]">
        <RowCheckDots summary={pr.checksSummary} />
        {hasLocalDraft ? (
          <span className="text-[var(--rd-vermillion-2)]">✎ draft</span>
        ) : null}
        {isStale ? (
          <span className="text-[var(--rd-vermillion-2)]">⚠ stale</span>
        ) : null}
        {pill ? <span className={pill.cls}>{pill.label}</span> : null}
      </span>
    </button>
  );
});
