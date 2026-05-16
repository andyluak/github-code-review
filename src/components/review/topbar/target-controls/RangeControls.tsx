import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RepoRefs } from "@/types/review";

type Props = {
  from: string;
  to: string;
  repoRefs: RepoRefs | null;
  disabled: boolean;
  onFromChange: (next: string) => void;
  onToChange: (next: string) => void;
  onConfirm: () => void;
};

export function RangeControls({ from, to, disabled, onFromChange, onToChange, onConfirm }: Props) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <Field label="from" value={from} disabled={disabled} onChange={onFromChange} />
      <Field label="to"   value={to}   disabled={disabled} onChange={onToChange} />
      <Button type="button" size="sm" onClick={onConfirm} disabled={disabled || !from.trim() || !to.trim()} className="self-end">
        Open session
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-[48px_1fr] gap-2">
      <span className="self-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--rd-pencil)]">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        disabled={disabled}
        placeholder="ref or sha"
        className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
      />
    </div>
  );
}
