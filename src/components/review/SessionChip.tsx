import type { ReviewSession } from "@/types/review";

type Props = {
  session: ReviewSession;
  onClick: () => void;
};

export function SessionChip({ session, onClick }: Props) {
  const t = session.target;
  let body: React.ReactNode = null;
  switch (t.kind) {
    case "pullRequest": {
      const headLabel = t.headSha ?? t.headRefName ?? t.headRef ?? "";
      body = (
        <>
          <span className="font-mono text-[12px] text-[var(--rd-vermillion-2)]">
            #{t.number ?? "?"}
          </span>
          <span className="truncate text-[13px] text-[var(--rd-cream)]">
            {t.label}
          </span>
          <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
            {t.baseRef ?? ""} ← {headLabel.slice(0, 7)}
          </span>
        </>
      );
      break;
    }
    case "branch":
      body = (
        <>
          <span className="font-mono text-[12px] text-[var(--rd-cream)]">
            branch
          </span>
          <span className="font-mono text-[12px] text-[var(--rd-cream)]">
            {t.baseRef} ← {t.headRef}
          </span>
        </>
      );
      break;
    case "commit":
      body = (
        <>
          <span className="font-mono text-[12px] text-[var(--rd-cream)]">
            commit
          </span>
          <span className="font-mono text-[12px] text-[var(--rd-vermillion-2)]">
            {t.commit.slice(0, 7)}
          </span>
          <span className="truncate text-[13px] text-[var(--rd-cream)]">
            {t.label}
          </span>
        </>
      );
      break;
    case "commitRange":
      body = (
        <>
          <span className="font-mono text-[12px] text-[var(--rd-cream)]">
            range
          </span>
          <span className="font-mono text-[12px] text-[var(--rd-cream)]">
            {t.fromRef}…{t.toRef}
          </span>
        </>
      );
      break;
    case "workingTree":
      body = (
        <>
          <span className="font-mono text-[12px] text-[var(--rd-cream)]">
            working tree
          </span>
          <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
            {t.label}
          </span>
        </>
      );
      break;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-full items-center gap-2 truncate rounded border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] px-2.5 py-1 hover:bg-[var(--rd-ink-3)]"
    >
      <span className="text-[var(--rd-pencil)]">⟦</span>
      {body}
      <span className="text-[var(--rd-pencil)]">⟧</span>
    </button>
  );
}
