import {
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  GitPullRequest,
  History,
  Trash2,
} from "lucide-react";
import { SlabButton } from "@/components/ui/slab-button";
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
        <SlabButton
          size='compact'
          disabled={history.length === 0}
          className='hidden lg:inline-flex'
          aria-label='Review history'
        >
          <History className='size-3.5' />
          history
          <ChevronDown className='size-3' />
        </SlabButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-[28rem] border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] p-1.5 text-[var(--rd-cream)]'
      >
        <DropdownMenuLabel className='rd-display-italic text-[12px] text-[var(--rd-cream-2)]'>
          Review history
        </DropdownMenuLabel>
        {history.map((item) => {
          const target = reviewTargetDisplay(item);

          return (
            <DropdownMenuItem
              key={`${item.id}-${item.createdAt}`}
              className='group items-start gap-2 rounded-md px-2.5 py-2 focus:bg-[var(--rd-ink-3)] focus:text-[var(--rd-cream)] data-[highlighted]:bg-[var(--rd-ink-3)] data-[highlighted]:text-[var(--rd-cream)]'
              onSelect={() => onSelectReview(item)}
            >
              <span
                className='mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--rd-hair-2)] bg-transparent'
                style={{ color: "var(--rd-cream)" }}
              >
                <TargetIcon kind={item.target.kind} />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='flex min-w-0 items-center gap-2'>
                  <span className='min-w-0 flex-1 truncate text-[12px] font-semibold !text-[var(--rd-cream)]'>
                    {item.repoName}
                  </span>
                  <span className='shrink-0 rounded-sm border border-[var(--rd-vermillion-line)] bg-[var(--rd-vermillion-bg)] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold !text-[var(--rd-vermillion-2)] shadow-[inset_0_0_0_1px_rgba(230,106,79,0.08)]'>
                    {target.badge}
                  </span>
                </span>
                <span
                  className='mt-1 block truncate text-[11.5px] font-medium !text-[var(--rd-cream-2)]'
                  title={reviewTargetLabel(item)}
                >
                  {target.label}
                </span>
                <span className='mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 font-mono text-[10px] !text-[var(--rd-pencil)]'>
                  <span className='min-w-0 truncate !text-[var(--rd-pencil)]'>
                    <span className='!text-[var(--rd-graphite)]'>
                      {item.orderSource === "agent" ? "agent" : "git"}
                    </span>{" "}
                    {formatReviewTime(item.createdAt)} {item.totalFiles} files
                  </span>
                  <span className='shrink-0 whitespace-nowrap'>
                    <span className='!text-[var(--rd-add)]'>
                      +{item.additions}
                    </span>{" "}
                    <span className='!text-[var(--rd-del)]'>
                      -{item.deletions}
                    </span>
                  </span>
                </span>
              </span>
              <button
                type='button'
                className='mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent !bg-transparent opacity-100 transition hover:border-transparent hover:!bg-transparent focus-visible:border-[var(--rd-hair-2)] focus-visible:!bg-transparent focus-visible:outline-none'
                style={{ color: "var(--rd-cream)" }}
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
                <Trash2 className="size-3.5" color="var(--rd-cream)" stroke="var(--rd-cream)" />
              </button>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-[var(--rd-hair)]" />
        <div className="px-1 py-1">
          <SlabButton
            variant="danger"
            size="sm"
            className="w-full justify-center !text-[var(--rd-del)] hover:!pl-2.5 hover:!text-[var(--rd-del)] focus-visible:ring-[var(--rd-del)]"
            onClick={onClearHistory}
          >
            Clear history
          </SlabButton>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TargetIcon({ kind }: { kind: ReviewHistoryItem["target"]["kind"] }) {
  const props = {
    className: "size-3.5",
    color: "var(--rd-cream)",
    stroke: "var(--rd-cream)",
  };

  switch (kind) {
    case "pullRequest":
      return <GitPullRequest {...props} />;
    case "branch":
      return <GitBranch {...props} />;
    case "commit":
      return <GitCommitHorizontal {...props} />;
    case "commitRange":
    case "workingTree":
      return <GitCompare {...props} />;
  }
}

function reviewTargetDisplay(item: ReviewHistoryItem) {
  const target = item.target;

  switch (target.kind) {
    case "workingTree":
      return {
        badge: "worktree",
        label: item.branch
          ? `working tree on ${shortRef(item.branch)}`
          : "working tree",
      };
    case "branch":
      return {
        badge: "branch",
        label: `${shortRef(target.baseRef)} -> ${shortRef(target.headRef)}`,
      };
    case "commit":
      return {
        badge: "commit",
        label: shortSha(target.commit) ?? shortRef(target.commit),
      };
    case "commitRange":
      return {
        badge: "range",
        label: `${shortRef(target.fromRef)} -> ${shortRef(target.toRef)}`,
      };
    case "pullRequest": {
      const base = shortRef(target.baseRefName ?? target.baseRef);
      const head = shortRef(target.headRefName ?? target.headRef);
      const number = target.number ? `#${target.number}` : "PR";
      return {
        badge: "PR",
        label: base && head ? `${number} · ${base} -> ${head}` : number,
      };
    }
  }
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

function shortRef(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const sha = shortSha(trimmed);
  if (sha) {
    return sha;
  }

  const stripped = trimmed.replace(/^refs\/(heads|remotes|tags)\//, "");
  const segments = stripped.split("/").filter(Boolean);

  if (segments.length > 2) {
    return segments.slice(-2).join("/");
  }

  return stripped;
}

function shortSha(value: string) {
  return /^[0-9a-f]{12,40}$/i.test(value) ? value.slice(0, 10) : null;
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
