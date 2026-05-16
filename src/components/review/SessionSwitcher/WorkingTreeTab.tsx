import type { ReviewTargetRequest } from "@/types/review";

type Props = {
  onPick: (target: ReviewTargetRequest) => void;
};

export function WorkingTreeTab({ onPick }: Props) {
  return (
    <div className="p-5">
      <button
        type="button"
        onClick={() => onPick({ kind: "workingTree" })}
        className="flex w-full items-center justify-between rounded border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] px-4 py-3 text-left hover:bg-[var(--rd-ink-3)]"
      >
        <span className="rd-display-italic text-[14px] text-[var(--rd-cream)]">
          Uncommitted changes
        </span>
        <span className="font-mono text-[11px] text-[var(--rd-pencil)]">
          ↵ open
        </span>
      </button>
    </div>
  );
}
