import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { RepoRefs, ReviewTargetRequest } from "@/types/review";

type Props = {
  repoRefs: RepoRefs | null;
  onPick: (target: ReviewTargetRequest) => void;
};

export function RangeTab({ repoRefs, onPick }: Props) {
  const [fromRef, setFromRef] = useState(repoRefs?.defaultBranch ?? "main");
  const [toRef, setToRef] = useState("HEAD");
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--rd-cream)]">
        <span className="text-[var(--rd-pencil)]">from</span>
        <Input
          value={fromRef}
          onChange={(e) => setFromRef(e.currentTarget.value)}
          className="h-7 w-56 border-0 bg-[var(--rd-ink-2)] font-mono text-[11px]"
        />
        <span className="text-[var(--rd-pencil)]">to</span>
        <Input
          value={toRef}
          onChange={(e) => setToRef(e.currentTarget.value)}
          className="h-7 w-56 border-0 bg-[var(--rd-ink-2)] font-mono text-[11px]"
        />
        <Button
          type="button"
          size="xs"
          onClick={() =>
            onPick({
              kind: "commitRange",
              fromRef: fromRef.trim(),
              toRef: toRef.trim(),
            })
          }
        >
          Open
        </Button>
      </div>
      <p className="font-mono text-[10px] text-[var(--rd-pencil)]">
        Autocomplete from local refs is incremental; tab cycles suggestions.
      </p>
    </div>
  );
}
