import { ScrollArea } from "@/components/ui/scroll-area";
import { compactPath } from "@/lib/format";
import type {
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  ViewedStatus,
} from "@/types/review";

type ReviewRailProps = {
  session: ReviewSession;
  activeFileId: string | null;
  workspaceState: ReviewWorkspaceState;
  onSelectFile: (fileId: string) => void;
};

export function ReviewRail({
  session,
  activeFileId,
  workspaceState,
  onSelectFile,
}: ReviewRailProps) {
  const files = session.files;
  const isAgentOrder = session.order.source === "agent";

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <div className="border-b border-[var(--rd-hair)] px-5 py-3">
        <div className="rd-display-italic text-[13px] leading-none text-[var(--rd-cream-2)]">
          Queue
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]">
          {isAgentOrder ? agentOrderLabel(session) : "Git diff order"}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="py-2">
          {isAgentOrder && session.order.groups.length > 0
            ? session.order.groups.map((group) => {
                const groupFiles = files.filter((file) => file.orderGroup === group.title);
                return (
                  <div key={group.title} className="mb-2">
                    <div className="px-5 pb-1 pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)] first:pt-2">
                      {group.title}
                      <span className="ml-1.5 text-[var(--rd-pencil)] opacity-60">{group.fileCount}</span>
                    </div>
                    {groupFiles.map((file, idx) => (
                      <FileRow
                        key={file.id}
                        index={idx + 1}
                        file={file}
                        status={workspaceState[file.id]?.status ?? file.viewedStatus}
                        isActive={file.id === activeFileId}
                        showReason
                        onSelect={() => onSelectFile(file.id)}
                      />
                    ))}
                  </div>
                );
              })
            : files.map((file, idx) => (
                <FileRow
                  key={file.id}
                  index={idx + 1}
                  file={file}
                  status={workspaceState[file.id]?.status ?? file.viewedStatus}
                  isActive={file.id === activeFileId}
                  showReason={false}
                  onSelect={() => onSelectFile(file.id)}
                />
              ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function FileRow({
  index,
  file,
  status,
  isActive,
  showReason,
  onSelect,
}: {
  index: number;
  file: ReviewFile;
  status: ViewedStatus;
  isActive: boolean;
  showReason: boolean;
  onSelect: () => void;
}) {
  const reviewed = status === "reviewed";
  const stale = status === "changedSinceReviewed" || status === "changedSinceViewed";
  const viewed = status === "viewed";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group block w-full px-5 py-[3px] text-left"
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <span
          className={[
            "shrink-0 font-mono text-[10px] tabular-nums",
            isActive ? "text-[var(--rd-vermillion-2)]" : "text-[var(--rd-pencil)]",
          ].join(" ")}
        >
          {String(index).padStart(2, "0")}
        </span>
        <span
          className={[
            "min-w-0 flex-1 truncate font-mono text-[12px]",
            isActive
              ? "text-[var(--rd-cream)]"
              : stale
                ? "text-[var(--rd-del)]"
                : reviewed
                  ? "text-[var(--rd-pencil)] line-through decoration-from-font"
                  : viewed
                    ? "text-[var(--rd-cream)]"
                    : "text-[var(--rd-cream-2)] group-hover:text-[var(--rd-cream)]",
          ].join(" ")}
          title={file.path}
        >
          {compactPath(file.path, 48)}
        </span>
      </div>

      {isActive && showReason && file.reviewReason ? (
        <div className="ml-7 mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--rd-graphite)]">
          {file.reviewReason}
        </div>
      ) : null}
    </button>
  );
}

function agentOrderLabel(session: ReviewSession) {
  if (session.order.title) {
    return session.order.title;
  }
  if (session.order.createdBy) {
    return `Agent — ${session.order.createdBy}`;
  }
  return "Agent review";
}
