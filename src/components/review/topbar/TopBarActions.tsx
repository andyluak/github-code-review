import { Bot, RefreshCw, Share2 } from "lucide-react";
import { SlabButton } from "@/components/ui/slab-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReviewHistoryItem } from "@/types/review";
import { ReviewHistoryMenu } from "@/components/review/topbar/ReviewHistoryMenu";

type Props = {
  repoPath: string;
  fontZoom: number;
  isLoading: boolean;
  canOpenHandoff: boolean;
  publishLabelCount: number;
  reviewHistory: ReviewHistoryItem[];
  onRefresh: () => void;
  onImportAgentSession: () => void;
  onOpenHandoff: () => void;
  onResetFontZoom: () => void;
  onOpenPublish: () => void;
  onSelectReviewHistory: (item: ReviewHistoryItem) => void;
  onDeleteReviewHistory: (item: ReviewHistoryItem) => void;
  onClearReviewHistory: () => void;
};

export function TopBarActions(props: Props) {
  return (
    <div className="flex shrink-0 items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]">
      <Tooltip>
        <TooltipTrigger asChild>
          <SlabButton
            size="icon"
            disabled={!props.repoPath || props.isLoading}
            onClick={props.onRefresh}
            aria-label="Refresh session"
          >
            <RefreshCw className="size-4" />
          </SlabButton>
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
          <SlabButton
            size="icon"
            onClick={props.onImportAgentSession}
            aria-label="Import an agent review manifest"
          >
            <Bot className="size-4" />
          </SlabButton>
        </TooltipTrigger>
        <TooltipContent>Import an agent review manifest</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <SlabButton
            size="icon"
            disabled={!props.canOpenHandoff}
            onClick={props.onOpenHandoff}
            aria-label="Agent handoff"
          >
            <Share2 className="size-4" />
          </SlabButton>
        </TooltipTrigger>
        <TooltipContent>Agent handoff</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <SlabButton
            size="compact"
            onClick={props.onResetFontZoom}
            aria-label={`Font zoom ${Math.round(props.fontZoom * 100)}%`}
            className="font-mono normal-case tracking-normal"
          >
            {Math.round(props.fontZoom * 100)}%
          </SlabButton>
        </TooltipTrigger>
        <TooltipContent>Cmd/Ctrl + plus, minus, or 0</TooltipContent>
      </Tooltip>

      <SlabButton
        size="compact"
        variant="primary"
        onClick={props.onOpenPublish}
      >
        publish
        {props.publishLabelCount > 0 ? (
          <span className="ml-1.5 px-1.5 py-0 font-mono text-[10px] text-[var(--rd-vermillion)] bg-[var(--rd-ink)]">
            {props.publishLabelCount}
          </span>
        ) : null}
      </SlabButton>
    </div>
  );
}
