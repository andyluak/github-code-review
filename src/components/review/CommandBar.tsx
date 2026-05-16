import { memo, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  History,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
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
  GitCommit,
  GitRef,
  GitRefKind,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
  ReviewTargetKind,
  ReviewWorkspaceState,
} from "@/types/review";
import type { PullRequestSummary as GhPullRequestSummary } from "@/types/github";

type CommandPullRequestSummary = Pick<
  GhPullRequestSummary,
  "number" | "title" | "baseRefName" | "headRefName"
>;

type CommandBarProps = {
  repoPath: string;
  baseRef: string;
  headRef: string;
  targetKind: ReviewTargetKind;
  commitRef: string;
  rangeFromRef: string;
  rangeToRef: string;
  pullRequestNumber: number | null;
  pullRequestInput: string;
  repoRefs: RepoRefs | null;
  pullRequests: CommandPullRequestSummary[];
  pullRequestError: string | null;
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
  onTargetKindChange: (value: ReviewTargetKind) => void;
  onCommitRefChange: (value: string) => void;
  onRangeFromRefChange: (value: string) => void;
  onRangeToRefChange: (value: string) => void;
  onPullRequestNumberChange: (value: number | null) => void;
  onPullRequestInputChange: (value: string) => void;
  onPullRequestInputSubmit: () => void;
  onPickRepo: () => void;
  onSelectRecentRepo: (path: string) => void;
  onSelectReviewHistory: (item: ReviewHistoryItem) => void;
  onDeleteReviewHistory: (item: ReviewHistoryItem) => void;
  onClearReviewHistory: () => void;
  onRefreshRefs: () => void;
  onImportAgentSession: () => void;
  onCreateSession: () => void;
};

export function CommandBar({
  repoPath,
  baseRef,
  headRef,
  targetKind,
  commitRef,
  rangeFromRef,
  rangeToRef,
  pullRequestNumber,
  pullRequestInput,
  repoRefs,
  pullRequests,
  pullRequestError,
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
  onTargetKindChange,
  onCommitRefChange,
  onRangeFromRefChange,
  onRangeToRefChange,
  onPullRequestNumberChange,
  onPullRequestInputChange,
  onPullRequestInputSubmit,
  onPickRepo,
  onSelectRecentRepo,
  onSelectReviewHistory,
  onDeleteReviewHistory,
  onClearReviewHistory,
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

        <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
          <TargetModePicker
            value={targetKind}
            disabled={!repoRefs || isRefsLoading}
            onChange={onTargetKindChange}
          />
          <TargetControls
            kind={targetKind}
            baseRef={baseRef}
            headRef={headRef}
            commitRef={commitRef}
            rangeFromRef={rangeFromRef}
            rangeToRef={rangeToRef}
            pullRequestNumber={pullRequestNumber}
            pullRequestInput={pullRequestInput}
            repoRefs={repoRefs}
            pullRequests={pullRequests}
            pullRequestError={pullRequestError}
            disabled={!repoRefs || isRefsLoading}
            onBaseRefChange={onBaseRefChange}
            onHeadRefChange={onHeadRefChange}
            onCommitRefChange={onCommitRefChange}
            onRangeFromRefChange={onRangeFromRefChange}
            onRangeToRefChange={onRangeToRefChange}
            onPullRequestNumberChange={onPullRequestNumberChange}
            onPullRequestInputChange={onPullRequestInputChange}
            onPullRequestInputSubmit={onPullRequestInputSubmit}
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

        <ReviewHistoryMenu
          history={reviewHistory}
          onSelectReview={onSelectReviewHistory}
          onDeleteReview={onDeleteReviewHistory}
          onClearHistory={onClearReviewHistory}
        />

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

const SessionProgressBeacon = memo(function SessionProgressBeacon({
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
  const unseen = Math.max(total - reviewed - viewed - stale, 0);

  return (
    <div className="flex items-center gap-3">
      <span className="rd-display text-[14px] leading-none text-[var(--rd-cream-2)]">
        {reviewed} <span className="text-[var(--rd-pencil)]">/</span> {total}
      </span>
      <div
        className="flex h-1.5 w-[260px] overflow-hidden bg-[var(--rd-ink-4)]"
        aria-label={`${reviewed} of ${total} files reviewed`}
      >
        <ProgressSegment
          count={reviewed}
          total={total}
          className="bg-[var(--rd-vermillion)]"
        />
        <ProgressSegment
          count={viewed}
          total={total}
          className="bg-[var(--rd-cream-2)]"
        />
        <ProgressSegment
          count={stale}
          total={total}
          className="bg-[var(--rd-del)]"
        />
        <ProgressSegment
          count={unseen}
          total={total}
          className="bg-[var(--rd-ink-4)]"
        />
      </div>
      <span className="font-mono text-[11px] text-[var(--rd-pencil)]">
        {viewed} viewed{stale > 0 ? ` · ${stale} stale` : ""}
      </span>
    </div>
  );
});

function ProgressSegment({
  count,
  total,
  className,
}: {
  count: number;
  total: number;
  className: string;
}) {
  if (count <= 0 || total <= 0) {
    return null;
  }
  return (
    <span
      className={className}
      style={{ width: `${(count / total) * 100}%` }}
    />
  );
}

function TargetModePicker({
  value,
  disabled,
  onChange,
}: {
  value: ReviewTargetKind;
  disabled: boolean;
  onChange: (value: ReviewTargetKind) => void;
}) {
  const selected = TARGET_MODES.find((mode) => mode.value === value) ?? TARGET_MODES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-36 justify-between rounded-md bg-[var(--rd-ink-2)] px-2.5 text-[12px] text-[var(--rd-cream)] hover:bg-[var(--rd-ink-3)]"
          disabled={disabled}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {selected.icon}
            <span className="truncate font-mono text-[11px]">{selected.label}</span>
          </span>
          <ChevronDown className="size-3 shrink-0 text-[var(--rd-pencil)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Review target
        </DropdownMenuLabel>
        {TARGET_MODES.map((mode) => (
          <DropdownMenuItem
            key={mode.value}
            className="justify-between px-2 py-1.5"
            onSelect={() => onChange(mode.value)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {mode.icon}
              <span className="text-[12px] text-[var(--rd-cream)]">{mode.label}</span>
            </span>
            <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
              {value === mode.value ? "✓" : ""}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TargetControls({
  kind,
  baseRef,
  headRef,
  commitRef,
  rangeFromRef,
  rangeToRef,
  pullRequestNumber,
  pullRequestInput,
  repoRefs,
  pullRequests,
  pullRequestError,
  disabled,
  onBaseRefChange,
  onHeadRefChange,
  onCommitRefChange,
  onRangeFromRefChange,
  onRangeToRefChange,
  onPullRequestNumberChange,
  onPullRequestInputChange,
  onPullRequestInputSubmit,
}: {
  kind: ReviewTargetKind;
  baseRef: string;
  headRef: string;
  commitRef: string;
  rangeFromRef: string;
  rangeToRef: string;
  pullRequestNumber: number | null;
  pullRequestInput: string;
  repoRefs: RepoRefs | null;
  pullRequests: CommandPullRequestSummary[];
  pullRequestError: string | null;
  disabled: boolean;
  onBaseRefChange: (value: string) => void;
  onHeadRefChange: (value: string) => void;
  onCommitRefChange: (value: string) => void;
  onRangeFromRefChange: (value: string) => void;
  onRangeToRefChange: (value: string) => void;
  onPullRequestNumberChange: (value: number | null) => void;
  onPullRequestInputChange: (value: string) => void;
  onPullRequestInputSubmit: () => void;
}) {
  if (kind === "workingTree") {
    return (
      <div className="h-7 rounded-md bg-[var(--rd-ink-2)] px-2.5 font-mono text-[11px] leading-7 text-[var(--rd-pencil)]">
        uncommitted changes
      </div>
    );
  }

  if (kind === "branch") {
    return (
      <>
        <RefPicker
          label="base"
          value={baseRef}
          refs={repoRefs?.refs ?? []}
          disabled={disabled}
          emptyLabel="Choose base"
          onChange={onBaseRefChange}
        />
        <RefPicker
          label="head"
          value={headRef}
          refs={repoRefs?.refs ?? []}
          disabled={disabled}
          emptyLabel="Choose head"
          onChange={onHeadRefChange}
        />
      </>
    );
  }

  if (kind === "commit") {
    return (
      <CommitPicker
        label="commit"
        value={commitRef}
        commits={repoRefs?.commits ?? []}
        disabled={disabled}
        onChange={onCommitRefChange}
      />
    );
  }

  if (kind === "commitRange") {
    return (
      <>
        <CommitPicker
          label="from"
          value={rangeFromRef}
          commits={repoRefs?.commits ?? []}
          disabled={disabled}
          onChange={onRangeFromRefChange}
        />
        <CommitPicker
          label="to"
          value={rangeToRef}
          commits={repoRefs?.commits ?? []}
          disabled={disabled}
          onChange={onRangeToRefChange}
        />
      </>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <PullRequestPicker
        value={pullRequestNumber}
        pullRequests={pullRequests}
        error={pullRequestError}
        disabled={disabled}
        onChange={(pullRequest) => {
          onPullRequestNumberChange(pullRequest?.number ?? null);
          if (pullRequest) {
            onPullRequestInputChange("");
          }
        }}
      />
      <Input
        value={pullRequestInput}
        onChange={(event) => {
          onPullRequestInputChange(event.currentTarget.value);
          onPullRequestNumberChange(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onPullRequestInputSubmit();
          }
        }}
        onBlur={onPullRequestInputSubmit}
        placeholder="PR URL or #"
        disabled={disabled}
        className="h-7 w-28 rounded-md border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
      />
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
  const [query, setQuery] = useState("");
  const selected = refs.find((gitRef) => gitRef.name === value);
  const localRefs = refs.filter((gitRef) => gitRef.kind === "local");
  const remoteRefs = refs.filter((gitRef) => gitRef.kind === "remote");
  const filteredLocalRefs = filterRefs(localRefs, query);
  const filteredRemoteRefs = filterRefs(remoteRefs, query);

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
        <div className="px-2 py-1.5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search branches"
            className="h-7 border-0 bg-[var(--rd-ink)] font-mono text-[11px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
          />
        </div>
        <RefGroup
          title="Local branches"
          refs={filteredLocalRefs}
          value={value}
          onChange={onChange}
        />
        <RefGroup
          title="Remote branches"
          refs={filteredRemoteRefs}
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

function CommitPicker({
  label,
  value,
  commits,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  commits: GitCommit[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected =
    commits.find((commit) => commit.sha === value || commit.shortSha === value) ?? null;
  const filteredCommits = useMemo(() => filterCommits(commits, query), [commits, query]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-44 justify-between rounded-md bg-[var(--rd-ink-2)] px-2.5 text-[12px] text-[var(--rd-cream)] hover:bg-[var(--rd-ink-3)]"
          disabled={disabled}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)]">
              {label}
            </span>
            <span className="truncate font-mono text-[11px] text-[var(--rd-cream)]">
              {selected?.shortSha ?? value}
            </span>
          </span>
          <ChevronDown className="size-3 shrink-0 text-[var(--rd-pencil)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[460px] w-96 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Latest commits
        </DropdownMenuLabel>
        <div className="px-2 py-1.5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search commits"
            className="h-7 border-0 bg-[var(--rd-ink)] font-mono text-[11px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
          />
        </div>
        <DropdownMenuItem onSelect={() => onChange("HEAD")}>
          <span className="font-mono text-[11px] text-[var(--rd-cream)]">HEAD</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {filteredCommits.map((commit) => (
          <DropdownMenuItem
            key={commit.sha}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-2 py-1.5"
            onSelect={() => onChange(commit.sha)}
          >
            <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
              {commit.shortSha}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-[var(--rd-cream)]">
                {commit.title}
              </span>
              <span className="block truncate text-[10px] text-[var(--rd-graphite)]">
                {commit.author} · {commit.date}
                {commit.refs ? ` · ${commit.refs}` : ""}
              </span>
            </span>
            <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
              {commit.sha === value ? "✓" : ""}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PullRequestPicker({
  value,
  pullRequests,
  error,
  disabled,
  onChange,
}: {
  value: number | null;
  pullRequests: CommandPullRequestSummary[];
  error?: string | null;
  disabled: boolean;
  onChange: (pullRequest: CommandPullRequestSummary | null) => void;
}) {
  const [query, setQuery] = useState("");
  const selected =
    pullRequests.find((pullRequest) => pullRequest.number === value) ?? null;
  const filteredPullRequests = useMemo(
    () => filterPullRequests(pullRequests, query),
    [pullRequests, query],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-44 justify-between rounded-md bg-[var(--rd-ink-2)] px-2.5 text-[12px] text-[var(--rd-cream)] hover:bg-[var(--rd-ink-3)]"
          disabled={disabled}
        >
          <span className="min-w-0 truncate font-mono text-[11px]">
            {selected ? `#${selected.number} ${selected.title}` : "Open PRs"}
          </span>
          <ChevronDown className="size-3 shrink-0 text-[var(--rd-pencil)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[460px] w-96 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Open pull requests
        </DropdownMenuLabel>
        <div className="px-2 py-1.5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search PRs"
            className="h-7 border-0 bg-[var(--rd-ink)] font-mono text-[11px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
          />
        </div>
        {filteredPullRequests.length > 0 ? (
          filteredPullRequests.map((pullRequest) => (
            <DropdownMenuItem
              key={pullRequest.number}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-2 py-1.5"
              onSelect={() => onChange(pullRequest)}
            >
              <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
                #{pullRequest.number}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-[var(--rd-cream)]">
                  {pullRequest.title}
                </span>
                <span className="block truncate text-[10px] text-[var(--rd-graphite)]">
                  {pullRequest.baseRefName} ← {pullRequest.headRefName}
                </span>
              </span>
              <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
                {pullRequest.number === value ? "✓" : ""}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-3 text-[11px] leading-5 text-[var(--rd-pencil)]">
            {error ? `gh: ${error}` : "No open PRs returned. Paste a URL or number."}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReviewHistoryMenu({
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

function refKindLabel(kind: GitRefKind) {
  return kind === "local" ? "local" : "remote";
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

function filterRefs(refs: GitRef[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return refs;
  }
  return refs.filter(
    (gitRef) =>
      gitRef.name.toLowerCase().includes(needle) ||
      gitRef.shortSha.toLowerCase().includes(needle),
  );
}

function filterCommits(commits: GitCommit[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return commits;
  }
  return commits.filter(
    (commit) =>
      commit.sha.toLowerCase().includes(needle) ||
      commit.shortSha.toLowerCase().includes(needle) ||
      commit.title.toLowerCase().includes(needle) ||
      commit.author.toLowerCase().includes(needle) ||
      commit.refs.toLowerCase().includes(needle),
  );
}

function filterPullRequests(pullRequests: CommandPullRequestSummary[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return pullRequests;
  }
  return pullRequests.filter(
    (pullRequest) =>
      pullRequest.title.toLowerCase().includes(needle) ||
      pullRequest.number.toString().includes(needle) ||
      pullRequest.baseRefName.toLowerCase().includes(needle) ||
      pullRequest.headRefName.toLowerCase().includes(needle),
  );
}

const TARGET_MODES: Array<{
  value: ReviewTargetKind;
  label: string;
  icon: ReactNode;
}> = [
  {
    value: "workingTree",
    label: "Working tree",
    icon: <GitCompare className="size-3.5 text-[var(--rd-pencil)]" />,
  },
  {
    value: "branch",
    label: "Branch",
    icon: <GitBranch className="size-3.5 text-[var(--rd-pencil)]" />,
  },
  {
    value: "commit",
    label: "Commit",
    icon: <GitCommitHorizontal className="size-3.5 text-[var(--rd-pencil)]" />,
  },
  {
    value: "commitRange",
    label: "Commit range",
    icon: <GitCompare className="size-3.5 text-[var(--rd-pencil)]" />,
  },
  {
    value: "pullRequest",
    label: "Pull request",
    icon: <GitBranch className="size-3.5 text-[var(--rd-pencil)]" />,
  },
];
