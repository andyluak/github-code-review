import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RepoRefs } from "@/types/review";

type Props = {
  commitRef: string;
  repoRefs: RepoRefs | null;
  disabled: boolean;
  onChange: (next: string) => void;
  onConfirm: () => void;
};

export function CommitControls({ commitRef, repoRefs, disabled, onChange, onConfirm }: Props) {
  const recents = (repoRefs?.commits ?? []).slice(0, 6);
  return (
    <div className="flex flex-col gap-2 p-3">
      <Input
        value={commitRef}
        onChange={(e) => onChange(e.currentTarget.value)}
        disabled={disabled}
        placeholder="commit sha or ref (e.g. HEAD, abc1234)"
        className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
      />
      {recents.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {recents.map((commit) => (
            <button
              key={commit.sha}
              type="button"
              onClick={() => onChange(commit.sha)}
              title={commit.title}
              className="rounded bg-[var(--rd-ink-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
            >
              {commit.sha.slice(0, 7)}
            </button>
          ))}
        </div>
      ) : null}
      <Button type="button" size="sm" onClick={onConfirm} disabled={disabled || !commitRef.trim()} className="self-end">
        Open session
      </Button>
    </div>
  );
}
