import type { GitRef, RepoRefs, ReviewTargetRequest } from "@/types/review";

type Props = {
  repoRefs: RepoRefs | null;
  onPick: (target: ReviewTargetRequest) => void;
};

export function BranchesTab({ repoRefs, onPick }: Props) {
  if (!repoRefs) return <EmptyHint />;
  const branches = repoRefs.refs.filter((r) => r.kind === "local");
  const fallbackBase = repoRefs.defaultBranch ?? "main";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {branches.map((branch) => (
        <BranchRow
          key={branch.name}
          branch={branch}
          fallbackBase={fallbackBase}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function BranchRow({
  branch,
  fallbackBase,
  onPick,
}: {
  branch: GitRef;
  fallbackBase: string;
  onPick: (target: ReviewTargetRequest) => void;
}) {
  const base = branch.upstream ?? fallbackBase;
  return (
    <button
      type="button"
      onClick={() =>
        onPick({ kind: "branch", baseRef: base, headRef: branch.name })
      }
      className="flex w-full items-center gap-3 border-b border-[var(--rd-hair)] px-5 py-2 text-left hover:bg-[var(--rd-ink-2)]"
    >
      <span className="font-mono text-[12px] text-[var(--rd-cream)]">
        {branch.name}
      </span>
      <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
        base {base} · {branch.shortSha}
      </span>
    </button>
  );
}

function EmptyHint() {
  return (
    <div className="px-5 py-10 text-center font-mono text-[11px] text-[var(--rd-pencil)]">
      Open a repository to see its branches.
    </div>
  );
}
