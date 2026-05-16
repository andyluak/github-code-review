import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { PullRequestSummary as GhPullRequestSummary } from "@/types/github";
import type {
  RepoRefs,
  ReviewHistoryItem,
  ReviewTargetRequest,
  ReviewWorkspaceState,
} from "@/types/review";
import { BranchesTab } from "./BranchesTab";
import { CommitsTab } from "./CommitsTab";
import { PullRequestsTab, flattenRows } from "./PullRequestsTab";
import { RangeTab } from "./RangeTab";
import { WorkingTreeTab } from "./WorkingTreeTab";

export type SwitcherTab =
  | "pullRequests"
  | "branches"
  | "commits"
  | "range"
  | "workingTree";

type Props = {
  framing: "home" | "palette";
  pullRequests: GhPullRequestSummary[];
  inboxFetchedAt: string | null;
  isInboxLoading: boolean;
  inboxError: string | null;
  history: ReviewHistoryItem[];
  workspaceByPr: Record<number, ReviewWorkspaceState | undefined>;
  repoRefs: RepoRefs | null;
  defaultTab?: SwitcherTab;
  onRefreshInbox: () => void;
  onPickPullRequest: (pr: GhPullRequestSummary) => void;
  onPickTarget: (target: ReviewTargetRequest) => void;
  onDismiss?: () => void;
};

const ALL_TABS: SwitcherTab[] = [
  "pullRequests",
  "branches",
  "commits",
  "range",
  "workingTree",
];

const TAB_LABELS: Record<SwitcherTab, string> = {
  pullRequests: "Pull requests",
  branches: "Branches",
  commits: "Commits",
  range: "Range",
  workingTree: "Working tree",
};

export function SessionSwitcher(props: Props) {
  const {
    framing,
    pullRequests,
    inboxFetchedAt,
    isInboxLoading,
    inboxError,
    history,
    workspaceByPr,
    repoRefs,
    defaultTab,
    onRefreshInbox,
    onPickPullRequest,
    onPickTarget,
    onDismiss,
  } = props;
  const hasGithubRemote = pullRequests.length > 0 || inboxFetchedAt !== null;
  const tabs = hasGithubRemote
    ? ALL_TABS
    : ALL_TABS.filter((t) => t !== "pullRequests");
  const [tab, setTab] = useState<SwitcherTab>(defaultTab ?? tabs[0]);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const visiblePrs = useMemo(
    () => flattenRows(pullRequests, history, query),
    [pullRequests, history, query],
  );

  useEffect(() => {
    setCursor(0);
  }, [tab, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const editing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      if (e.key === "[" || e.key === "]") {
        if (editing) return;
        e.preventDefault();
        const dir = e.key === "[" ? -1 : 1;
        const i = tabs.indexOf(tab);
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        setTab(next);
        return;
      }
      if (e.key === "Escape" && framing === "palette") {
        e.preventDefault();
        onDismiss?.();
        return;
      }
      if (e.key === "Enter" && tab === "pullRequests" && visiblePrs[cursor]) {
        if (editing) return;
        e.preventDefault();
        onPickPullRequest(visiblePrs[cursor]);
        return;
      }
      if (
        (e.key === "ArrowDown" || e.key === "j") &&
        tab === "pullRequests"
      ) {
        if (editing && e.key === "j") return;
        e.preventDefault();
        setCursor((c) =>
          Math.min(c + 1, Math.max(0, visiblePrs.length - 1)),
        );
        return;
      }
      if ((e.key === "ArrowUp" || e.key === "k") && tab === "pullRequests") {
        if (editing && e.key === "k") return;
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    cursor,
    framing,
    onDismiss,
    onPickPullRequest,
    tab,
    tabs,
    visiblePrs,
  ]);

  return (
    <section
      className={[
        "flex min-h-0 flex-col bg-[var(--rd-ink)] text-[var(--rd-cream)]",
        framing === "palette"
          ? "absolute inset-x-8 top-10 bottom-8 rounded border border-[var(--rd-hair-2)] shadow-2xl"
          : "h-full w-full",
      ].join(" ")}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--rd-hair)] px-5 py-3">
        <div className="rd-display-italic text-[13px] text-[var(--rd-cream-2)]">
          {framing === "home" ? "Review Desk" : "Switch session"}
        </div>
        <div className="font-mono text-[10px] text-[var(--rd-pencil)]">
          {isInboxLoading
            ? "refreshing…"
            : inboxFetchedAt
              ? `refreshed ${relative(inboxFetchedAt)}`
              : "no data"}
        </div>
      </header>
      <nav className="flex shrink-0 gap-3 border-b border-[var(--rd-hair)] px-5 py-2 font-mono text-[11px]">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "text-[var(--rd-vermillion-2)]"
                : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
            }
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[var(--rd-pencil)]">
          [ ] tabs · / filter · ↵ open
        </span>
      </nav>
      <div className="shrink-0 px-5 py-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Filter"
          className="h-7 border-0 bg-[var(--rd-ink-2)] font-mono text-[11px]"
        />
      </div>
      {inboxError ? (
        <div className="px-5 py-2 font-mono text-[10px] text-[var(--rd-del)]">
          {inboxError}
        </div>
      ) : null}
      {tab === "pullRequests" ? (
        <PullRequestsTab
          pullRequests={pullRequests}
          history={history}
          workspaceByPr={workspaceByPr}
          selectedIndex={cursor}
          searchQuery={query}
          onSelect={onPickPullRequest}
        />
      ) : tab === "branches" ? (
        <BranchesTab repoRefs={repoRefs} onPick={onPickTarget} />
      ) : tab === "commits" ? (
        <CommitsTab
          repoRefs={repoRefs}
          searchQuery={query}
          onPick={onPickTarget}
        />
      ) : tab === "range" ? (
        <RangeTab repoRefs={repoRefs} onPick={onPickTarget} />
      ) : (
        <WorkingTreeTab onPick={onPickTarget} />
      )}
      <footer className="shrink-0 border-t border-[var(--rd-hair)] px-5 py-2 font-mono text-[10px] text-[var(--rd-pencil)]">
        <button
          type="button"
          onClick={onRefreshInbox}
          className="hover:text-[var(--rd-cream)]"
        >
          ⟲ refresh
        </button>
      </footer>
    </section>
  );
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
