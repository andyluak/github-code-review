import { Bot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReviewHistoryItem } from "@/types/review";
import { ReviewHistoryMenu } from "@/components/review/topbar/ReviewHistoryMenu";

type Props = {
  repoPath: string;
  fontZoom: number;
  isLoading: boolean;
  publishLabelCount: number;
  reviewHistory: ReviewHistoryItem[];
  onRefresh: () => void;
  onImportAgentSession: () => void;
  onResetFontZoom: () => void;
  onOpenPublish: () => void;
  onSelectReviewHistory: (item: ReviewHistoryItem) => void;
  onDeleteReviewHistory: (item: ReviewHistoryItem) => void;
  onClearReviewHistory: () => void;
};

export function TopBarActions(props: Props) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-md border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream-2)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
            disabled={!props.repoPath || props.isLoading}
            onClick={props.onRefresh}
          >
            <RefreshCw className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh session</TooltipContent>
      </Tooltip>

      <ReviewHistoryMenu
        history={props.reviewHistory}
        onSelectReview={props.onSelectReviewHistory}
        onDeleteReview={props.onDeleteReviewHistory}
        onClearHistory={props.onClearReviewHistory}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-md border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream-2)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
            onClick={props.onImportAgentSession}
          >
            <Bot className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Import an agent review manifest</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-md border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] font-mono text-[10px] text-[var(--rd-cream-2)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
            onClick={props.onResetFontZoom}
          >
            {Math.round(props.fontZoom * 100)}%
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cmd/Ctrl + plus, minus, or 0</TooltipContent>
      </Tooltip>

      <Button
        type="button"
        size="sm"
        className="h-8 rounded-md bg-[var(--rd-cream)] px-3 text-[12px] font-medium text-[var(--rd-ink)] hover:bg-white disabled:bg-[var(--rd-ink-3)] disabled:text-[var(--rd-pencil)]"
        onClick={props.onOpenPublish}
      >
        Publish
        {props.publishLabelCount > 0 ? (
          <span className="ml-1.5 rounded bg-[var(--rd-ink)] px-1.5 py-0 text-[10px] text-[var(--rd-cream)]">
            {props.publishLabelCount}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
