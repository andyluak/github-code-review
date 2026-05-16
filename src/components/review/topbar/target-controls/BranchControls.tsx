import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GitRef, RepoRefs } from "@/types/review";

type Props = {
  baseRef: string;
  headRef: string;
  repoRefs: RepoRefs | null;
  disabled: boolean;
  onBaseChange: (value: string) => void;
  onHeadChange: (value: string) => void;
  onConfirm: () => void;
};

export function BranchControls({
  baseRef,
  headRef,
  repoRefs,
  disabled,
  onBaseChange,
  onHeadChange,
  onConfirm,
}: Props) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <RefRow label="base" value={baseRef} repoRefs={repoRefs} disabled={disabled} onChange={onBaseChange} />
      <RefRow label="head" value={headRef} repoRefs={repoRefs} disabled={disabled} onChange={onHeadChange} />
      <Button type="button" size="sm" onClick={onConfirm} disabled={disabled || !baseRef || !headRef} className="self-end">
        Open session
      </Button>
    </div>
  );
}

function RefRow({
  label,
  value,
  repoRefs,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  repoRefs: RepoRefs | null;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const suggestions = useMemo(() => {
    if (!repoRefs) return [] as GitRef[];
    return repoRefs.refs.slice(0, 8);
  }, [repoRefs]);
  return (
    <div className="grid grid-cols-[48px_1fr] gap-2">
      <span className="self-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--rd-pencil)]">
        {label}
      </span>
      <div>
        <Input
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          placeholder="ref…"
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
        {suggestions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestions.map((ref) => (
              <button
                key={ref.name}
                type="button"
                onClick={() => onChange(ref.name)}
                className="rounded bg-[var(--rd-ink-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
              >
                {ref.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
