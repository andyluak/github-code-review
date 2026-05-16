import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { GitCommit, RepoRefs, ReviewTargetRequest } from "@/types/review";

type Props = {
  repoRefs: RepoRefs | null;
  searchQuery: string;
  onPick: (target: ReviewTargetRequest) => void;
};

export function CommitsTab({ repoRefs, searchQuery, onPick }: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const commits = useMemo(() => {
    if (!repoRefs) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return repoRefs.commits;
    return repoRefs.commits.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.shortSha.toLowerCase().includes(q),
    );
  }, [repoRefs, searchQuery]);

  const v = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 18,
  });

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="relative" style={{ height: `${v.getTotalSize()}px` }}>
        {v.getVirtualItems().map((vi) => {
          const c = commits[vi.index];
          return (
            <div
              key={vi.key}
              style={{ transform: `translateY(${vi.start}px)` }}
              className="absolute left-0 right-0"
            >
              <CommitRow commit={c} onPick={onPick} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommitRow({
  commit,
  onPick,
}: {
  commit: GitCommit;
  onPick: (target: ReviewTargetRequest) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick({ kind: "commit", commit: commit.sha })}
      className="flex w-full items-center gap-3 border-b border-[var(--rd-hair)] px-5 py-2 text-left hover:bg-[var(--rd-ink-2)]"
    >
      <span className="shrink-0 font-mono text-[11px] text-[var(--rd-vermillion-2)]">
        {commit.shortSha}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--rd-cream)]">
        {commit.title}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-[var(--rd-pencil)]">
        {commit.author} · {commit.date}
      </span>
    </button>
  );
}
