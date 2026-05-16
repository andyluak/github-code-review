import { RepoChip } from "./RepoChip";
import { TargetChip } from "./TargetChip";
import { PrMetaPills } from "./PrMetaPills";
import { TopBarActions } from "./TopBarActions";
import { ProgressStrip } from "./ProgressStrip";
import type { DraftJumpTarget } from "@/components/review/popovers/DraftsTab";
import type {
  PullRequestContext,
  PullRequestSummary,
} from "@/types/github";
import type {
  RecentRepo,
  RepoRefs,
  ReviewFile,
  ReviewHistoryItem,
  ReviewSession,
  ReviewTargetKind,
  ReviewWorkspaceState,
} from "@/types/review";

export type TopBarProps = {
  // session + target state
  session: ReviewSession | null;
  targetKind: ReviewTargetKind;
  baseRef: string;
  headRef: string;
  commitRef: string;
  rangeFromRef: string;
  rangeToRef: string;
  pullRequestInput: string;
  pullRequestNumber: number | null;

  // repo
  repoPath: string;
  repoRefs: RepoRefs | null;
  recentRepos: RecentRepo[];
  pullRequests: PullRequestSummary[];
  isInboxLoading: boolean;
  inboxError: string | null;
  isRefsLoading: boolean;
  isLoading: boolean;

  // pr context + workspace
  prSummary: PullRequestSummary | null;
  prContext: PullRequestContext | null;
  prContextError?: string | null;
  workspaceState: ReviewWorkspaceState;
  activeFile: ReviewFile | null;
  reviewHistory: ReviewHistoryItem[];
  publishLabelCount: number;

  fontZoom: number;
  onResetFontZoom: () => void;
  onPickFolder: () => void;
  onSelectRepo: (path: string) => void;
  onRefreshRefs: () => void;
  onClearRecentRepos: () => void;
  onTargetKindChange: (next: ReviewTargetKind) => void;
  onBaseRefChange: (next: string) => void;
  onHeadRefChange: (next: string) => void;
  onCommitRefChange: (next: string) => void;
  onRangeFromRefChange: (next: string) => void;
  onRangeToRefChange: (next: string) => void;
  onPullRequestInputChange: (next: string) => void;
  onPullRequestInputSubmit: () => void;
  onPickPullRequest: (pr: PullRequestSummary) => void;
  onCreateSession: () => void;
  onRefreshSession: () => void;
  onPickCommit: (sha: string) => void;
  onImportAgentSession: () => void;
  onOpenHandoff: () => void;
  onOpenPublish: () => void;
  onSelectReviewHistory: (item: ReviewHistoryItem) => void;
  onDeleteReviewHistory: (item: ReviewHistoryItem) => void;
  onClearReviewHistory: () => void;
  onJumpToDraft: (target: DraftJumpTarget) => void;
  onDropDraft: (target: DraftJumpTarget) => void;
  onJumpToThread: (target: { path: string; line: number }) => void;
};

export function TopBar(props: TopBarProps) {
  const repoLabel = guessRepoLabel(props.repoRefs?.root ?? props.repoPath);
  return (
    <div className="shrink-0">
      <header className="flex h-11 items-center gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3">
        <div className="flex items-center gap-1.5">
          <span className="rd-display text-base leading-none text-[var(--rd-vermillion)]">◆</span>
          <span className="text-[13px] font-semibold tracking-tight text-[var(--rd-cream)]">Review Desk</span>
        </div>
        <span className="mx-1 h-5 w-px bg-[var(--rd-hair-2)]" aria-hidden />

        <RepoChip
          repoPath={props.repoPath}
          repoLabel={repoLabel}
          recentRepos={props.recentRepos}
          isRefsLoading={props.isRefsLoading}
          onSelectRepo={props.onSelectRepo}
          onPickFolder={props.onPickFolder}
          onRefreshRefs={props.onRefreshRefs}
          onClearRecent={props.onClearRecentRepos}
        />

        <TargetChip
          session={props.session}
          targetKind={props.targetKind}
          baseRef={props.baseRef}
          headRef={props.headRef}
          commitRef={props.commitRef}
          rangeFromRef={props.rangeFromRef}
          rangeToRef={props.rangeToRef}
          pullRequestInput={props.pullRequestInput}
          pullRequestNumber={props.pullRequestNumber}
          repoRefs={props.repoRefs}
          isRefsLoading={props.isRefsLoading}
          isInboxLoading={props.isInboxLoading}
          inboxError={props.inboxError}
          pullRequests={props.pullRequests}
          onTargetKindChange={props.onTargetKindChange}
          onBaseRefChange={props.onBaseRefChange}
          onHeadRefChange={props.onHeadRefChange}
          onCommitRefChange={props.onCommitRefChange}
          onRangeFromRefChange={props.onRangeFromRefChange}
          onRangeToRefChange={props.onRangeToRefChange}
          onPullRequestInputChange={props.onPullRequestInputChange}
          onPullRequestInputSubmit={props.onPullRequestInputSubmit}
          onPickPullRequest={props.onPickPullRequest}
          onPickCommit={props.onPickCommit}
          onCreateSession={props.onCreateSession}
        />

        <div className="ml-2 flex min-w-0 flex-1 items-center justify-center">
          {props.session && props.session.target.kind === "pullRequest" ? (
            <PrMetaPills
              session={props.session}
              workspaceState={props.workspaceState}
              prSummary={props.prSummary}
              prContext={props.prContext}
              prContextError={props.prContextError}
              repoPath={props.repoPath}
              onOpenPublish={props.onOpenPublish}
              onJumpToDraft={props.onJumpToDraft}
              onDropDraft={props.onDropDraft}
              onJumpToThread={props.onJumpToThread}
            />
          ) : null}
        </div>

        <TopBarActions
          repoPath={props.repoPath}
          fontZoom={props.fontZoom}
          isLoading={props.isLoading}
          canOpenHandoff={Boolean(props.session)}
          publishLabelCount={props.publishLabelCount}
          reviewHistory={props.reviewHistory}
          onRefresh={props.onRefreshSession}
          onImportAgentSession={props.onImportAgentSession}
          onOpenHandoff={props.onOpenHandoff}
          onResetFontZoom={props.onResetFontZoom}
          onOpenPublish={props.onOpenPublish}
          onSelectReviewHistory={props.onSelectReviewHistory}
          onDeleteReviewHistory={props.onDeleteReviewHistory}
          onClearReviewHistory={props.onClearReviewHistory}
        />
      </header>
      {props.session ? (
        <ProgressStrip
          session={props.session}
          workspaceState={props.workspaceState}
          activeFile={props.activeFile}
        />
      ) : null}
    </div>
  );
}

function guessRepoLabel(path: string): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts.filter(Boolean).pop() ?? path;
}
