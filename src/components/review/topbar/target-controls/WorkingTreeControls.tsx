import { Button } from "@/components/ui/button";

export function WorkingTreeControls({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="font-mono text-[11px] leading-snug text-[var(--rd-cream-2)]">
        Reviews the uncommitted changes in this repo's working tree.
      </p>
      <Button type="button" size="sm" onClick={onConfirm} className="self-end">
        Open session
      </Button>
    </div>
  );
}
