import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ChecksSummary,
  PullRequestSummary as GhPullRequestSummary,
} from "@/types/github";
import type {
  ReviewHistoryItem,
  ReviewWorkspaceState,
} from "@/types/review";
import { PRRow } from "./PRRow";

type Props = {
  pullRequests: GhPullRequestSummary[];
  history: ReviewHistoryItem[];
  workspaceByPr: Record<number, ReviewWorkspaceState | undefined>;
  selectedIndex: number;
  onSelect: (pr: GhPullRequestSummary) => void;
  searchQuery: string;
};

type Section = { title: string; rows: GhPullRequestSummary[] };

function emptyChecksSummary(): ChecksSummary {
  return { state: "UNKNOWN", passing: 0, pending: 0, failing: 0, total: 0 };
}

function partition(
  all: GhPullRequestSummary[],
  history: ReviewHistoryItem[],
): Section[] {
  const reviewRequested = all.filter((pr) => pr.isReviewRequestedFromViewer);
  const assignedOnly = all.filter(
    (pr) => pr.isAssignedToViewer && !pr.isReviewRequestedFromViewer,
  );
  const recent: GhPullRequestSummary[] = [];
  const seen = new Set<number>(all.map((pr) => pr.number));
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const item of history) {
    if (item.target.kind !== "pullRequest") continue;
    const number = item.target.number ?? null;
    if (!number || seen.has(number)) continue;
    if (new Date(item.lastRefreshedAt).getTime() < cutoff) continue;
    recent.push(historyToSummary(item, number));
    seen.add(number);
    if (recent.length >= 10) break;
  }
  return [
    { title: "For you · review requested", rows: reviewRequested },
    { title: "Assigned to me", rows: assignedOnly },
    { title: "Recently reviewed", rows: recent },
  ];
}

function historyToSummary(
  item: ReviewHistoryItem,
  number: number,
): GhPullRequestSummary {
  return {
    number,
    nodeId: "",
    title: item.title ?? `PR #${number}`,
    url: "",
    state: "MERGED",
    isDraft: false,
    author: { login: item.createdBy ?? "", avatarUrl: null },
    baseRefName: item.baseRef ?? "",
    headRefName: item.headRef ?? "",
    headRefOid: item.headSha ?? "",
    updatedAt: item.lastRefreshedAt,
    reviewDecision: null,
    mergeable: null,
    isAssignedToViewer: false,
    isReviewRequestedFromViewer: false,
    viewerReviewState: "COMMENTED",
    latestReviewRequestAt: null,
    labels: [],
    checksSummary: emptyChecksSummary(),
    unresolvedThreadCount: 0,
    commentCount: 0,
    inboxReason: "ASSIGNED",
  };
}

export function PullRequestsTab(props: Props) {
  const {
    pullRequests,
    history,
    workspaceByPr,
    onSelect,
    selectedIndex,
    searchQuery,
  } = props;

  const sections = useMemo(() => {
    const base = partition(pullRequests, history);
    if (!searchQuery.trim()) return base;
    const q = searchQuery.trim().toLowerCase();
    return base
      .map((s) => ({
        ...s,
        rows: s.rows.filter(
          (pr) =>
            pr.title.toLowerCase().includes(q) ||
            pr.author.login.toLowerCase().includes(q) ||
            pr.headRefName.toLowerCase().includes(q) ||
            pr.labels.some((l) => l.toLowerCase().includes(q)) ||
            String(pr.number).includes(q),
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [history, pullRequests, searchQuery]);

  const parentRef = useRef<HTMLDivElement | null>(null);

  const flatRows = useMemo(() => {
    const out: (
      | { kind: "header"; title: string }
      | { kind: "row"; pr: GhPullRequestSummary }
    )[] = [];
    for (const s of sections) {
      out.push({ kind: "header", title: s.title });
      for (const pr of s.rows) out.push({ kind: "row", pr });
    }
    return out;
  }, [sections]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (flatRows[index].kind === "header" ? 32 : 56),
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = flatRows[vi.index];
          if (item.kind === "header") {
            return (
              <div
                key={vi.key}
                style={{ transform: `translateY(${vi.start}px)` }}
                className="absolute left-0 right-0 flex items-end px-5 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]"
              >
                {item.title}
              </div>
            );
          }
          const rowsOnly = flatRows.filter(
            (r): r is { kind: "row"; pr: GhPullRequestSummary } =>
              r.kind === "row",
          );
          const rowIndex = rowsOnly.findIndex(
            (r) => r.pr.number === item.pr.number,
          );
          const ws = workspaceByPr[item.pr.number];
          const hasDraft = ws
            ? Object.values(ws).some(
                (fs) =>
                  (fs?.publishableDraft?.trim().length ?? 0) > 0 ||
                  (fs?.inlineComments?.some(
                    (c) => c.visibility === "review",
                  ) ?? false),
              )
            : false;
          return (
            <div
              key={vi.key}
              style={{ transform: `translateY(${vi.start}px)` }}
              className="absolute left-0 right-0"
            >
              <PRRow
                pr={item.pr}
                hasLocalDraft={hasDraft}
                isStale={false}
                selected={selectedIndex === rowIndex}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function flattenRows(
  pullRequests: GhPullRequestSummary[],
  history: ReviewHistoryItem[],
  q: string,
): GhPullRequestSummary[] {
  const sections = partition(pullRequests, history);
  if (!q.trim()) return sections.flatMap((s) => s.rows);
  const lower = q.toLowerCase();
  return sections.flatMap((s) =>
    s.rows.filter(
      (pr) =>
        pr.title.toLowerCase().includes(lower) ||
        pr.author.login.toLowerCase().includes(lower) ||
        pr.headRefName.toLowerCase().includes(lower) ||
        String(pr.number).includes(lower),
    ),
  );
}
