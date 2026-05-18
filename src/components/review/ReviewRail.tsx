import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { compactPath, pathParts } from "@/lib/format";
import type {
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  ViewedStatus,
} from "@/types/review";

type ReviewRailProps = {
  session: ReviewSession;
  activeFileId: string | null;
  workspaceState: ReviewWorkspaceState;
  onSelectFile: (fileId: string) => void;
  filterInputRef?: Ref<HTMLInputElement>;
};

export function ReviewRail({
  session,
  activeFileId,
  workspaceState,
  onSelectFile,
  filterInputRef,
}: ReviewRailProps) {
  const files = session.files;
  const isAgentOrder = session.order.source === "agent";
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RailStatusFilter>("all");
  const deferredQuery = useDeferredValue(query);
  const fileRecords = useMemo(
    () => files.map(toQueueFileRecord),
    [files],
  );
  const groupTitles = useMemo(
    () => session.order.groups.map((group) => group.title),
    [session.order.groups],
  );
  const visibleRecords = useMemo(
    () =>
      filterQueueRecords(
        fileRecords,
        workspaceState,
        deferredQuery,
        statusFilter,
      ),
    [deferredQuery, fileRecords, statusFilter, workspaceState],
  );
  const virtualRows = useMemo(
    () =>
      buildVirtualRows(
        visibleRecords,
        isAgentOrder,
        groupTitles,
      ),
    [groupTitles, isAgentOrder, visibleRecords],
  );
  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimateQueueRowSize(virtualRows[index]),
    overscan: 14,
  });
  const activeRowIndex = useMemo(() => {
    if (!activeFileId) {
      return -1;
    }
    return virtualRows.findIndex(
      (row) => row.kind === "file" && row.record.file.id === activeFileId,
    );
  }, [activeFileId, virtualRows]);

  useEffect(() => {
    if (activeRowIndex < 0) {
      return;
    }
    rowVirtualizer.scrollToIndex(activeRowIndex, {
      align: "auto",
      behavior: "auto",
    });
  }, [activeFileId, activeRowIndex, session.id]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <div className="border-b border-[var(--rd-hair)] px-5 py-3">
        <div className="rd-display-italic text-[13px] leading-none text-[var(--rd-cream-2)]">
          Queue
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]">
          {isAgentOrder ? agentOrderLabel(session) : "Git diff order"}
        </div>
        {files.length > 0 ? (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--rd-pencil)]" />
              <Input
                ref={filterInputRef}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Filter files"
                aria-keyshortcuts="/"
                className="h-7 border-0 bg-[var(--rd-ink-2)] pl-7 font-mono text-[11px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {RAIL_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={[
                    "h-6 rounded px-1.5 font-mono text-[10px]",
                    statusFilter === filter.value
                      ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
                      : "bg-[var(--rd-ink-2)] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
                  ].join(" ")}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div ref={scrollParentRef} className="min-h-0 flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <QueueEmptyState session={session} />
        ) : visibleRecords.length === 0 ? (
          <div className="px-5 py-10 text-[12px] leading-5 text-[var(--rd-pencil)]">
            No files match this filter.
          </div>
        ) : (
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize() + 16}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const row = virtualRows[virtualItem.index];
              if (!row) {
                return null;
              }

              return (
                <div
                  key={row.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    transform: `translateY(${virtualItem.start + 8}px)`,
                  }}
                >
                  {row.kind === "group" ? (
                    <QueueGroupHeader title={row.title} count={row.count} />
                  ) : (
                    <FileRow
                      record={row.record}
                      status={
                        workspaceState[row.record.file.id]?.status ??
                        row.record.file.viewedStatus
                      }
                      isActive={row.record.file.id === activeFileId}
                      showReason={row.showReason}
                      onSelectFile={onSelectFile}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

const FileRow = memo(function FileRow({
  record,
  status,
  isActive,
  showReason,
  onSelectFile,
}: {
  record: QueueFileRecord;
  status: ViewedStatus;
  isActive: boolean;
  showReason: boolean;
  onSelectFile: (fileId: string) => void;
}) {
  const { file, index } = record;
  const displayPath = pathParts(file.path);
  const reviewed = status === "reviewed";
  const stale = status === "changedSinceReviewed" || status === "changedSinceViewed";
  const viewed = status === "viewed";

  return (
    <button
      type="button"
      onClick={() => onSelectFile(file.id)}
      className="group block w-full px-5 py-2 text-left"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={[
            "mt-0.5 shrink-0 font-mono text-[10px] tabular-nums",
            isActive ? "text-[var(--rd-vermillion-2)]" : "text-[var(--rd-pencil)]",
          ].join(" ")}
        >
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={[
              "truncate font-mono text-[12px]",
              isActive
                ? "text-[var(--rd-cream)]"
                : stale
                  ? "text-[var(--rd-del)]"
                  : reviewed
                    ? "text-[var(--rd-pencil)]"
                    : viewed
                      ? "text-[var(--rd-cream-2)] group-hover:text-[var(--rd-cream)]"
                      : "text-[var(--rd-cream-2)] group-hover:text-[var(--rd-cream)]",
              reviewed ? "line-through decoration-from-font" : "",
            ].join(" ")}
            title={file.path}
          >
            {displayPath.fileName}
          </div>
          {displayPath.directory ? (
            <div
              className="mt-0.5 truncate font-mono text-[10px] leading-4 text-[var(--rd-pencil)]"
              title={file.path}
            >
              {compactPath(displayPath.directory, 72)}
            </div>
          ) : null}
          {isActive && showReason && file.reviewReason ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--rd-graphite)]">
              {file.reviewReason}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
});

const QueueGroupHeader = memo(function QueueGroupHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="px-5 pb-1 pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)]">
      {title}
      <span className="ml-1.5 text-[var(--rd-pencil)] opacity-60">{count}</span>
    </div>
  );
});

function agentOrderLabel(session: ReviewSession) {
  if (session.order.title) {
    return session.order.title;
  }
  if (session.order.createdBy) {
    return `Agent — ${session.order.createdBy}`;
  }
  return "Agent review";
}

function QueueEmptyState({ session }: { session: ReviewSession }) {
  const isAgentOrder = session.order.source === "agent";
  return (
    <div className="px-5 py-10">
      <div className="rd-display-italic text-[15px] text-[var(--rd-cream-2)]">
        {isAgentOrder ? "No matching changed files" : "No changed files"}
      </div>
      <div className="mt-2 text-[12px] leading-5 text-[var(--rd-pencil)]">
        {isAgentOrder
          ? "The agent manifest did not resolve to files in this diff."
          : "This target does not currently contain reviewable changes."}
      </div>
      {session.order.warnings.length > 0 ? (
        <div className="mt-4 space-y-2">
          {session.order.warnings.slice(0, 3).map((warning, index) => (
            <div
              key={`${warning.path ?? "warning"}-${index}`}
              className="border-l border-[var(--rd-del-line)] pl-3 text-[11px] leading-4 text-[var(--rd-graphite)]"
            >
              {warning.path ? `${warning.path}: ` : ""}
              {warning.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type RailStatusFilter = "all" | "unseen" | "viewed" | "reviewed" | "stale";

type QueueFileRecord = {
  file: ReviewFile;
  index: number;
  searchText: string;
};

type QueueVirtualRow =
  | {
      kind: "group";
      key: string;
      title: string;
      count: number;
    }
  | {
      kind: "file";
      key: string;
      record: QueueFileRecord;
      showReason: boolean;
    };

function toQueueFileRecord(file: ReviewFile, index: number): QueueFileRecord {
  return {
    file,
    index: index + 1,
    searchText: [file.path, file.oldPath, file.reviewReason]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function filterQueueRecords(
  records: QueueFileRecord[],
  workspaceState: ReviewWorkspaceState,
  query: string,
  statusFilter: RailStatusFilter,
) {
  const needle = query.trim().toLowerCase();
  return records.filter((record) => {
    const file = record.file;
    const status = workspaceState[file.id]?.status ?? file.viewedStatus;
    const matchesQuery = !needle || record.searchText.includes(needle);
    return matchesQuery && matchesStatus(status, statusFilter);
  });
}

function buildVirtualRows(
  records: QueueFileRecord[],
  isAgentOrder: boolean,
  groupTitles: string[],
): QueueVirtualRow[] {
  if (!isAgentOrder || groupTitles.length === 0) {
    return records.map((record) => ({
      kind: "file",
      key: record.file.id,
      record,
      showReason: isAgentOrder,
    }));
  }

  const grouped = new Map<string, QueueFileRecord[]>();
  const unknownGroupRecords: QueueFileRecord[] = [];

  for (const record of records) {
    const groupTitle = record.file.orderGroup;
    if (!groupTitle) {
      unknownGroupRecords.push(record);
      continue;
    }
    const bucket = grouped.get(groupTitle) ?? [];
    bucket.push(record);
    grouped.set(groupTitle, bucket);
  }

  const rows: QueueVirtualRow[] = [];
  const seen = new Set<string>();
  for (const title of groupTitles) {
    const groupRecords = grouped.get(title);
    if (!groupRecords?.length) {
      continue;
    }
    seen.add(title);
    rows.push({ kind: "group", key: `group-${title}`, title, count: groupRecords.length });
    rows.push(
      ...groupRecords.map((record) => ({
        kind: "file" as const,
        key: record.file.id,
        record,
        showReason: true,
      })),
    );
  }

  const leftover = [
    ...unknownGroupRecords,
    ...Array.from(grouped.entries())
      .filter(([title]) => !seen.has(title))
      .flatMap(([, groupRecords]) => groupRecords),
  ];
  if (leftover.length > 0) {
    rows.push({
      kind: "group",
      key: "group-not-ordered",
      title: "Not ordered by agent",
      count: leftover.length,
    });
    rows.push(
      ...leftover.map((record) => ({
        kind: "file" as const,
        key: record.file.id,
        record,
        showReason: true,
      })),
    );
  }

  return rows;
}

function estimateQueueRowSize(row: QueueVirtualRow | undefined) {
  if (!row) {
    return 28;
  }
  if (row.kind === "group") {
    return 34;
  }
  return row.showReason && row.record.file.reviewReason ? 68 : 46;
}

function matchesStatus(status: ViewedStatus, filter: RailStatusFilter) {
  const stale = status === "changedSinceReviewed" || status === "changedSinceViewed";
  if (filter === "all") {
    return true;
  }
  if (filter === "stale") {
    return stale;
  }
  if (stale) {
    return false;
  }
  return status === filter;
}

const RAIL_FILTERS: Array<{ value: RailStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unseen", label: "Unseen" },
  { value: "viewed", label: "Viewed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "stale", label: "Stale" },
];
