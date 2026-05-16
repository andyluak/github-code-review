import { ChevronDown, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReviewHistoryItem } from "@/types/review";

export function ReviewHistoryMenu({
  history,
  onSelectReview,
  onDeleteReview,
  onClearHistory,
}: {
  history: ReviewHistoryItem[];
  onSelectReview: (item: ReviewHistoryItem) => void;
  onDeleteReview: (item: ReviewHistoryItem) => void;
  onClearHistory: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-7 rounded-md px-2 text-[11px] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)] lg:inline-flex"
          disabled={history.length === 0}
        >
          <History className="size-3.5" />
          History
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[21.5rem] border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Review history
        </DropdownMenuLabel>
        {history.map((item) => (
          <DropdownMenuItem
            key={`${item.id}-${item.createdAt}`}
            className="items-start gap-2 px-2 py-1.5"
            onSelect={() => onSelectReview(item)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-[var(--rd-cream)]">
                {item.repoName}
              </span>
              <span className="block truncate font-mono text-[10px] text-[var(--rd-graphite)]">
                {item.orderSource === "agent" ? "agent" : "git"} · {reviewTargetLabel(item)} ·{" "}
                {item.totalFiles} files · +{item.additions} −{item.deletions}
              </span>
              <span className="block text-[10px] text-[var(--rd-pencil)]">
                {formatReviewTime(item.createdAt)}
              </span>
            </span>
            <button
              type="button"
              className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--rd-pencil)] hover:bg-[var(--rd-del-bg)] hover:text-[var(--rd-del)] focus-visible:bg-[var(--rd-del-bg)] focus-visible:text-[var(--rd-del)] focus-visible:outline-none"
              aria-label={`Delete ${item.repoName} from review history`}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDeleteReview(item);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-[var(--rd-hair)]" />
        <DropdownMenuItem
          variant="destructive"
          className="justify-center px-2 py-1.5 text-[11px] text-[var(--rd-del)] focus:bg-[var(--rd-del-bg)] focus:text-[var(--rd-del)]"
          onSelect={onClearHistory}
        >
          Clear history
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function reviewTargetLabel(item: ReviewHistoryItem) {
  if (item.target?.label) {
    return item.target.label;
  }
  if (item.baseRef && item.headRef) {
    return `${item.baseRef}...${item.headRef}`;
  }
  if (item.baseRef) {
    return `${item.baseRef} -> working tree`;
  }
  return "working tree";
}

function formatReviewTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
