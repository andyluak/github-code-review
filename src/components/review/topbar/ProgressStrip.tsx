import { memo } from "react";
import { compactPath } from "@/lib/format";
import type {
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

type Props = {
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  activeFile: ReviewFile | null;
};

export const ProgressStrip = memo(function ProgressStrip({
  session,
  workspaceState,
  activeFile,
}: Props) {
  const total = session.files.length;
  let reviewed = 0;
  let viewed = 0;
  let stale = 0;
  for (const file of session.files) {
    const rawStatus = workspaceState[file.id]?.status ?? file.viewedStatus;
    if (rawStatus === "changedSinceReviewed" || rawStatus === "changedSinceViewed") {
      stale += 1;
      continue;
    }
    if (rawStatus === "reviewed") reviewed += 1;
    else if (rawStatus === "viewed") viewed += 1;
  }
  const unseen = Math.max(total - reviewed - viewed - stale, 0);

  const activeIndex = activeFile
    ? session.files.findIndex((f) => f.id === activeFile.id) + 1
    : 0;

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 font-mono text-[10px] text-[var(--rd-pencil)]">
      <span className="truncate text-[var(--rd-cream-2)]">
        {activeFile ? compactPath(activeFile.path, 48) : "no file selected"}
      </span>
      {total > 0 ? (
        <span className="shrink-0">file {activeIndex} of {total}</span>
      ) : null}

      <div className="flex h-1.5 w-[200px] overflow-hidden bg-[var(--rd-ink-3)]">
        <Segment count={reviewed} total={total} className="bg-[var(--rd-vermillion)]" />
        <Segment count={viewed}   total={total} className="bg-[var(--rd-cream-2)]" />
        <Segment count={stale}    total={total} className="bg-[var(--rd-del)]" />
        <Segment count={unseen}   total={total} className="bg-[var(--rd-ink-3)]" />
      </div>

      <span><Badge>{reviewed} ✓</Badge> reviewed</span>
      <span><Badge>{viewed} 👁</Badge> viewed</span>
      {stale > 0 ? (
        <span className="text-[var(--rd-del)]"><Badge tone="bad">{stale} ↻</Badge> stale</span>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        <span>
          +{session.summary.additions} −{session.summary.deletions} · {session.summary.includedFiles} files
        </span>
        <span className="text-[var(--rd-graphite)]">⌘K · ⌘0</span>
      </div>
    </div>
  );
});

function Segment({ count, total, className }: { count: number; total: number; className: string }) {
  if (count <= 0 || total <= 0) return null;
  return <span className={className} style={{ width: `${(count / total) * 100}%` }} />;
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return (
    <span
      className={[
        "rounded bg-[var(--rd-ink-2)] px-1.5 py-0 text-[10px] tabular-nums",
        tone === "bad" ? "text-[var(--rd-del)]" : "text-[var(--rd-cream-2)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}
