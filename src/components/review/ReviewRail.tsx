import { CheckCircle2, Circle, Eye, FileCode2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { compactPath } from "@/lib/format";
import { changeTone, statusTone } from "@/lib/status";
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
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--rd-border)] bg-[var(--rd-bg-soft)]">
      <div className="border-b border-[var(--rd-border)] px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--rd-text)]">Review Queue</div>
            <div className="mt-1 text-xs text-[var(--rd-muted)]">
              {isAgentOrder ? agentOrderLabel(session) : "Git diff order for now"}
            </div>
          </div>
          <Badge className="border-[var(--rd-border)] bg-[var(--rd-panel-2)] text-[var(--rd-text-soft)]">
            {files.length} files
          </Badge>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-3">
          {isAgentOrder && session.order.groups.length > 0
            ? session.order.groups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="flex items-center justify-between px-1.5 pb-1 pt-3 first:pt-0">
                    <div className="truncate text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--rd-muted)]">
                      {group.title}
                    </div>
                    <div className="text-[0.66rem] text-[var(--rd-faint)]">
                      {group.fileCount}
                    </div>
                  </div>
                  {files
                    .filter((file) => file.orderGroup === group.title)
                    .map((file) => (
                      <FileButton
                        key={file.id}
                        file={file}
                        status={workspaceState[file.id]?.status ?? file.viewedStatus}
                        isActive={file.id === activeFileId}
                        showReason
                        onSelect={() => onSelectFile(file.id)}
                      />
                    ))}
                </div>
              ))
            : files.map((file) => (
                <FileButton
                  key={file.id}
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

function FileButton({
  file,
  status,
  isActive,
  showReason,
  onSelect,
}: {
  file: ReviewFile;
  status: ViewedStatus;
  isActive: boolean;
  showReason: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={[
        "group h-auto w-full justify-start rounded-lg border px-2.5 py-2 text-left transition-all",
        isActive
          ? "border-[var(--rd-accent-border)] bg-[var(--rd-accent-soft)] shadow-[inset_0_1px_0_rgba(255,236,190,0.045)]"
          : "border-transparent bg-transparent hover:border-[var(--rd-border)] hover:bg-[var(--rd-panel)]",
      ].join(" ")}
      onClick={onSelect}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-3.5 shrink-0 text-[var(--rd-faint)]" />
            <span className="truncate text-xs font-medium text-[var(--rd-text)]">
              {compactPath(file.path, 44)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`text-[11px] ${changeTone(file.changeKind)}`}>
              {file.changeKind}
            </span>
            <span className="text-[11px] text-[var(--rd-sage)]">
              +{file.additions}
            </span>
            <span className="text-[11px] text-[var(--rd-clay)]">
              -{file.deletions}
            </span>
          </div>
          {showReason && file.reviewReason ? (
            <div className="mt-1 line-clamp-2 text-[0.68rem] leading-4 text-[var(--rd-muted)]">
              {file.reviewReason}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start">
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] ${statusTone(
              status,
            )}`}
          >
            {statusLabel(status)}
          </span>
        </div>
      </div>
    </Button>
  );
}

function agentOrderLabel(session: ReviewSession) {
  if (session.order.title) {
    return session.order.title;
  }
  if (session.order.createdBy) {
    return `Agent order by ${session.order.createdBy}`;
  }
  return "Agent review order";
}

function StatusIcon({ status }: { status: ViewedStatus }) {
  if (status === "reviewed") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--rd-accent)]" />;
  }
  if (status === "viewed") {
    return <Eye className="mt-0.5 size-4 shrink-0 text-[var(--rd-sage)]" />;
  }
  return <Circle className="mt-0.5 size-4 shrink-0 text-[var(--rd-faint)]" />;
}

function statusLabel(status: ViewedStatus) {
  switch (status) {
    case "reviewed":
      return "reviewed";
    case "viewed":
      return "viewed";
    case "changedSinceReviewed":
      return "stale";
    case "changedSinceViewed":
      return "changed";
    case "unseen":
      return "new";
  }
}
