import {
  Bot,
  ChevronDown,
  Command,
  FolderOpen,
  GitBranch,
  History,
  Loader2,
  Play,
  RefreshCw,
  Search,
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
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { compactPath } from "@/lib/format";
import type {
  GitRef,
  GitRefKind,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
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
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--rd-border)] bg-[rgba(23,20,15,0.94)] px-3 shadow-[inset_0_1px_0_rgba(255,236,190,0.045)] backdrop-blur-xl">
      <div className="flex min-w-[150px] items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg border border-[var(--rd-accent-border)] bg-[var(--rd-accent)] text-[var(--rd-ink)] shadow-[inset_0_1px_0_rgba(255,236,190,0.32)]">
          <Command className="size-3.5" />
        </div>
        <div>
          <div className="text-[0.82rem] font-semibold tracking-tight text-[var(--rd-text)]">
            Review Desk
          </div>
          <div className="text-[0.66rem] leading-none text-[var(--rd-muted)]">
            Local sessions
          </div>
        </div>
      </div>

      <Separator orientation="vertical" className="h-6 bg-[var(--rd-border)]" />

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <FolderOpen className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--rd-faint)]" />
          <Input
            value={repoPath}
            onChange={(event) => onRepoPathChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRefreshRefs();
              }
            }}
            placeholder="Choose a local repository"
            className="h-7 rounded-lg border-[var(--rd-border)] bg-[var(--rd-bg-soft)] pl-8 text-[0.76rem] text-[var(--rd-text)] shadow-[inset_0_1px_0_rgba(255,236,190,0.035)] placeholder:text-[var(--rd-faint)]"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="border-[var(--rd-border)] bg-[var(--rd-panel-2)] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)] active:translate-y-px"
              onClick={onPickRepo}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open local repository</TooltipContent>
        </Tooltip>

        <RecentReposMenu
          repos={recentRepos}
          onSelectRepo={onSelectRecentRepo}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="border-[var(--rd-border)] bg-[var(--rd-panel-2)] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)] active:translate-y-px"
              disabled={!repoPath || isRefsLoading}
              onClick={onRefreshRefs}
            >
              <RefreshCw className={`size-3.5 ${isRefsLoading ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh Git refs</TooltipContent>
        </Tooltip>
      </div>

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

      <Button
        type="button"
        size="sm"
        className="h-7 rounded-lg bg-[var(--rd-accent)] px-2.5 text-[0.76rem] text-[var(--rd-ink)] shadow-[inset_0_1px_0_rgba(255,236,190,0.34)] hover:bg-[var(--rd-accent-strong)] active:translate-y-px"
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

      <ReviewHistoryMenu
        history={reviewHistory}
        onSelectReview={onSelectReviewHistory}
      />

      <Separator orientation="vertical" className="h-6 bg-[var(--rd-border)]" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg border-[var(--rd-border)] bg-[var(--rd-panel-2)] px-2 text-[0.72rem] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)] active:translate-y-px"
            onClick={onResetFontZoom}
          >
            {Math.round(fontZoom * 100)}%
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cmd/Ctrl + plus, minus, or 0</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden h-7 rounded-lg border-[var(--rd-accent-border)] bg-[var(--rd-accent-soft)] px-2.5 text-[0.76rem] text-[var(--rd-accent-strong)] hover:bg-[rgba(200,165,92,0.16)] lg:inline-flex"
            disabled={isLoading}
            onClick={onImportAgentSession}
          >
            <Bot className="size-3.5" />
            Import Agent
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open a .review-session.json manifest</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="border-[var(--rd-border)] bg-[var(--rd-panel-2)] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)]"
        disabled
      >
        <Search className="size-3.5" />
      </Button>
    </header>
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
          variant="outline"
          size="sm"
          className="h-7 rounded-lg border-[var(--rd-border)] bg-[var(--rd-panel-2)] px-2 text-[0.72rem] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)] active:translate-y-px"
          disabled={repos.length === 0}
        >
          <History className="size-3.5" />
          Repos
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 border border-[var(--rd-border)] bg-[var(--rd-panel)] text-[var(--rd-text)]"
      >
        <DropdownMenuLabel>Recent repositories</DropdownMenuLabel>
        {repos.map((repo) => (
          <DropdownMenuItem
            key={repo.root}
            className="flex-col items-start gap-0.5 px-2 py-1.5"
            onSelect={() => onSelectRepo(repo.root)}
          >
            <span className="text-xs font-medium text-[var(--rd-text)]">
              {repo.name}
            </span>
            <span className="max-w-full truncate text-[0.68rem] text-[var(--rd-muted)]">
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
          variant="outline"
          size="sm"
          className="h-7 w-40 justify-between rounded-lg border-[var(--rd-border)] bg-[var(--rd-bg-soft)] px-2 text-[0.76rem] text-[var(--rd-text)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)]"
          disabled={disabled}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <GitBranch className="size-3.5 shrink-0 text-[var(--rd-faint)]" />
            <span className="shrink-0 text-[var(--rd-faint)]">{label}</span>
            <span className="truncate">{selected?.name ?? (value || emptyLabel)}</span>
          </span>
          <ChevronDown className="size-3 shrink-0 text-[var(--rd-faint)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[460px] w-72 border border-[var(--rd-border)] bg-[var(--rd-panel)] text-[var(--rd-text)]"
      >
        <DropdownMenuItem onSelect={() => onChange("")}>
          <span className="text-xs text-[var(--rd-muted)]">{emptyLabel}</span>
        </DropdownMenuItem>
        <RefGroup
          title="Local branches"
          refs={localRefs}
          value={value}
          onChange={onChange}
        />
        <RefGroup
          title="Remote branches"
          refs={remoteRefs}
          value={value}
          onChange={onChange}
        />
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
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
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
        <span className="block truncate text-xs text-[var(--rd-text)]">
          {gitRef.name}
        </span>
        <span className="block truncate text-[0.66rem] text-[var(--rd-muted)]">
          {refKindLabel(gitRef.kind)}
          {gitRef.isHead ? " current" : ""}
          {gitRef.upstream ? ` tracks ${gitRef.upstream}` : ""}
        </span>
      </span>
      <span className="text-[0.66rem] text-[var(--rd-faint)]">
        {selected ? "selected" : gitRef.shortSha}
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
          variant="outline"
          size="sm"
          className="hidden h-7 rounded-lg border-[var(--rd-border)] bg-[var(--rd-panel-2)] px-2 text-[0.72rem] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)] active:translate-y-px lg:inline-flex"
          disabled={history.length === 0}
        >
          <History className="size-3.5" />
          Reviews
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[21.5rem] border border-[var(--rd-border)] bg-[var(--rd-panel)] text-[var(--rd-text)]"
      >
        <DropdownMenuLabel>Review history</DropdownMenuLabel>
        {history.map((item) => (
          <DropdownMenuItem
            key={`${item.id}-${item.createdAt}`}
            className="flex-col items-start gap-1 px-2 py-1.5"
            onSelect={() => onSelectReview(item)}
          >
            <span className="text-xs font-medium text-[var(--rd-text)]">
              {item.repoName}
            </span>
            <span className="text-[0.68rem] text-[var(--rd-muted)]">
              {item.orderSource === "agent" ? "agent" : "git"} ·{" "}
              {reviewTargetLabel(item)} · {item.totalFiles} files · +{item.additions} -
              {item.deletions}
            </span>
            <span className="text-[0.66rem] text-[var(--rd-faint)]">
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
