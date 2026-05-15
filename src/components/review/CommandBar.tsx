import {
  Bot,
  ChevronDown,
  FolderOpen,
  History,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { compactPath } from "@/lib/format";
import type {
  GitRef,
  GitRefKind,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
  ReviewWorkspaceState,
  ViewedStatus,
} from "@/types/review";

type CommandBarProps = {
  repoPath: string;
  baseRef: string;
  headRef: string;
  repoRefs: RepoRefs | null;
  recentRepos: RecentRepo[];
  reviewHistory: ReviewHistoryItem[];
  isLoading: boolean;
  isRefsLoading: boolean;
  session: ReviewSession | null;
  workspaceState: ReviewWorkspaceState;
  fontZoom: number;
  onResetFontZoom: () => void;
  onRepoPathChange: (value: string) => void;
  onBaseRefChange: (value: string) => void;
  onHeadRefChange: (value: string) => void;
  onPickRepo: () => void;
  onSelectRecentRepo: (path: string) => void;
  onSelectReviewHistory: (item: ReviewHistoryItem) => void;
  onRefreshRefs: () => void;
  onImportAgentSession: () => void;
  onCreateSession: () => void;
};

export function CommandBar({
  repoPath,
  baseRef,
  headRef,
  repoRefs,
  recentRepos,
  reviewHistory,
  isLoading,
  isRefsLoading,
  session,
  workspaceState,
  fontZoom,
  onResetFontZoom,
  onRepoPathChange,
  onBaseRefChange,
  onHeadRefChange,
  onPickRepo,
  onSelectRecentRepo,
  onSelectReviewHistory,
  onRefreshRefs,
  onImportAgentSession,
  onCreateSession,
}: CommandBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className="rd-display text-base leading-none text-[var(--rd-vermillion)]">◆</span>
          <span className="text-[13px] font-semibold tracking-tight text-[var(--rd-cream)]">
            Review Desk
          </span>
        </div>

        <span className="h-4 w-px bg-[var(--rd-hair-2)]" aria-hidden />

        <div className="relative flex min-w-0 items-center">
          <FolderOpen className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--rd-pencil)]" />
          <Input
            value={repoPath}
            onChange={(event) => onRepoPathChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRefreshRefs();
              }
            }}
            placeholder="Choose a local repository"
            className="h-7 w-[280px] rounded-md border-0 bg-[var(--rd-ink-2)] pl-7 font-mono text-[12px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              onClick={onPickRepo}
              aria-label="Open repository"
            >
              <FolderOpen className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open local repository</TooltipContent>
        </Tooltip>

        <RecentReposMenu repos={recentRepos} onSelectRepo={onSelectRecentRepo} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              disabled={!repoPath || isRefsLoading}
              onClick={onRefreshRefs}
              aria-label="Refresh refs"
            >
              <RefreshCw className={`size-3.5 ${isRefsLoading ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh Git refs</TooltipContent>
        </Tooltip>

        <div className="hidden items-center gap-1.5 xl:flex">
          <RefPicker
            label="base"
            value={baseRef}
            refs={repoRefs?.refs ?? []}
            disabled={!repoRefs || isRefsLoading}
            emptyLabel="Working tree"
            onChange={onBaseRefChange}
          />
          <RefPicker
            label="head"
            value={headRef}
            refs={repoRefs?.refs ?? []}
            disabled={!repoRefs || isRefsLoading}
            emptyLabel="Working tree"
            onChange={onHeadRefChange}
          />
        </div>
      </div>

      <div className="mx-2 flex min-w-0 flex-1 justify-center">
        <SessionProgressBeacon session={session} workspaceState={workspaceState} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-md bg-[var(--rd-cream)] px-3 text-[12px] font-medium text-[var(--rd-ink)] hover:bg-white"
          disabled={!repoPath || isLoading}
          onClick={onCreateSession}
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : session ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {session ? "Refresh" : "Create Session"}
        </Button>

        <ReviewHistoryMenu history={reviewHistory} onSelectReview={onSelectReviewHistory} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden h-7 rounded-md px-2 text-[12px] text-[var(--rd-cream-2)] hover:bg-[var(--rd-vermillion-bg)] hover:text-[var(--rd-vermillion-2)] lg:inline-flex"
              disabled={isLoading}
              onClick={onImportAgentSession}
            >
              <Bot className="size-3.5" />
              Agent
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import an agent review manifest</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md px-2 font-mono text-[11px] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              onClick={onResetFontZoom}
            >
              {Math.round(fontZoom * 100)}%
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cmd/Ctrl + plus, minus, or 0</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function effectiveStatus(status: ViewedStatus): ViewedStatus {
  if (status === "changedSinceReviewed" || status === "changedSinceViewed") {
    return "unseen";
  }
  return status;
}

function SessionProgressBeacon({
  session,
  workspaceState,
}: {
  session: ReviewSession | null;
  workspaceState: ReviewWorkspaceState;
}) {
  if (!session) {
    return (
      <div className="rd-display-italic text-[13px] text-[var(--rd-pencil)]">
        No active session
      </div>
    );
  }

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
    if (rawStatus === "reviewed") {
      reviewed += 1;
    } else if (rawStatus === "viewed") {
      viewed += 1;
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rd-display text-[14px] leading-none text-[var(--rd-cream-2)]">
        {reviewed} <span className="text-[var(--rd-pencil)]">/</span> {total}
      </span>
      <div
        className="flex h-1.5 w-[260px] gap-[2px] overflow-hidden"
        aria-label={`${reviewed} of ${total} files reviewed`}
      >
        {session.files.map((file, index) => {
          const status = effectiveStatus(
            workspaceState[file.id]?.status ?? file.viewedStatus,
          );
          const tint =
            status === "reviewed"
              ? "bg-[var(--rd-vermillion)]"
              : status === "viewed"
                ? "bg-[var(--rd-cream-2)]"
                : "bg-[var(--rd-ink-4)]";
          return <span key={`${file.id}-${index}`} className={`flex-1 ${tint}`} />;
        })}
      </div>
      <span className="font-mono text-[11px] text-[var(--rd-pencil)]">
        {viewed} viewed{stale > 0 ? ` · ${stale} stale` : ""}
      </span>
    </div>
  );
}

function RecentReposMenu({
  repos,
  onSelectRepo,
}: {
  repos: RecentRepo[];
  onSelectRepo: (path: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-md px-2 text-[11px] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
          disabled={repos.length === 0}
        >
          <History className="size-3.5" />
          Recent
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Recent repositories
        </DropdownMenuLabel>
        {repos.map((repo) => (
          <DropdownMenuItem
            key={repo.root}
            className="flex-col items-start gap-0.5 px-2 py-1.5"
            onSelect={() => onSelectRepo(repo.root)}
          >
            <span className="text-[12px] font-medium text-[var(--rd-cream)]">
              {repo.name}
            </span>
            <span className="max-w-full truncate font-mono text-[10px] text-[var(--rd-graphite)]">
              {compactPath(repo.root, 58)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RefPicker({
  label,
  value,
  refs,
  disabled,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string;
  refs: GitRef[];
  disabled: boolean;
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  const selected = refs.find((gitRef) => gitRef.name === value);
  const localRefs = refs.filter((gitRef) => gitRef.kind === "local");
  const remoteRefs = refs.filter((gitRef) => gitRef.kind === "remote");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-32 justify-between rounded-md bg-[var(--rd-ink-2)] px-2.5 text-[12px] text-[var(--rd-cream)] hover:bg-[var(--rd-ink-3)]"
          disabled={disabled}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)]">
              {label}
            </span>
            <span className="truncate font-mono text-[11px] text-[var(--rd-cream)]">
              {selected?.name ?? (value || emptyLabel)}
            </span>
          </span>
          <ChevronDown className="size-3 shrink-0 text-[var(--rd-pencil)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[460px] w-72 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuItem onSelect={() => onChange("")}>
          <span className="text-[11px] text-[var(--rd-graphite)]">{emptyLabel}</span>
        </DropdownMenuItem>
        <RefGroup title="Local branches" refs={localRefs} value={value} onChange={onChange} />
        <RefGroup title="Remote branches" refs={remoteRefs} value={value} onChange={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RefGroup({
  title,
  refs,
  value,
  onChange,
}: {
  title: string;
  refs: GitRef[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
        {title}
      </DropdownMenuLabel>
      {refs.map((gitRef) => (
        <RefItem
          key={`${gitRef.kind}-${gitRef.name}`}
          gitRef={gitRef}
          selected={gitRef.name === value}
          onSelect={() => onChange(gitRef.name)}
        />
      ))}
    </>
  );
}

function RefItem({
  gitRef,
  selected,
  onSelect,
}: {
  gitRef: GitRef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-2 py-1.5"
      onSelect={onSelect}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-[11px] text-[var(--rd-cream)]">
          {gitRef.name}
        </span>
        <span className="block truncate text-[10px] text-[var(--rd-graphite)]">
          {refKindLabel(gitRef.kind)}
          {gitRef.isHead ? " · current" : ""}
          {gitRef.upstream ? ` · tracks ${gitRef.upstream}` : ""}
        </span>
      </span>
      <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
        {selected ? "✓" : gitRef.shortSha}
      </span>
    </DropdownMenuItem>
  );
}

function ReviewHistoryMenu({
  history,
  onSelectReview,
}: {
  history: ReviewHistoryItem[];
  onSelectReview: (item: ReviewHistoryItem) => void;
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
            className="flex-col items-start gap-1 px-2 py-1.5"
            onSelect={() => onSelectReview(item)}
          >
            <span className="text-[12px] font-medium text-[var(--rd-cream)]">
              {item.repoName}
            </span>
            <span className="font-mono text-[10px] text-[var(--rd-graphite)]">
              {item.orderSource === "agent" ? "agent" : "git"} · {reviewTargetLabel(item)} ·{" "}
              {item.totalFiles} files · +{item.additions} −{item.deletions}
            </span>
            <span className="text-[10px] text-[var(--rd-pencil)]">
              {formatReviewTime(item.createdAt)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function refKindLabel(kind: GitRefKind) {
  return kind === "local" ? "local" : "remote";
}

function reviewTargetLabel(item: ReviewHistoryItem) {
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
