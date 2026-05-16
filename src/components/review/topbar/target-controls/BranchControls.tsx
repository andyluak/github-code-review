import { useMemo, useState } from "react";
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

type Slot = "base" | "head";

export function BranchControls({
  baseRef,
  headRef,
  repoRefs,
  disabled,
  onBaseChange,
  onHeadChange,
  onConfirm,
}: Props) {
  const [active, setActive] = useState<Slot>("base");
  const [query, setQuery] = useState("");

  const refs = repoRefs?.refs ?? [];
  const filteredRefs = useMemo(() => filterRefs(refs, query).slice(0, 50), [refs, query]);

  const pick = (value: string) => {
    if (active === "base") onBaseChange(value);
    else onHeadChange(value);
  };

  return (
    <div className="flex max-h-[440px] flex-col">
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] p-3">
        <SlotField
          label="base"
          value={baseRef}
          active={active === "base"}
          disabled={disabled}
          onFocus={() => setActive("base")}
          onChange={onBaseChange}
        />
        <SlotField
          label="head"
          value={headRef}
          active={active === "head"}
          disabled={disabled}
          onFocus={() => setActive("head")}
          onChange={onHeadChange}
        />
      </div>

      <div className="border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={`Search refs to set "${active}"…`}
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {refs.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">
            {repoRefs ? "No refs found." : "Loading refs…"}
          </div>
        ) : filteredRefs.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">No refs match.</div>
        ) : (
          <ul className="space-y-0.5">
            {filteredRefs.map((ref) => {
              const target = active === "base" ? baseRef : headRef;
              const isPicked = target.trim() === ref.name;
              return (
                <li key={`${ref.kind}-${ref.name}`}>
                  <button
                    type="button"
                    onClick={() => pick(ref.name)}
                    className={[
                      "grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--rd-ink-2)]",
                      isPicked ? "bg-[var(--rd-vermillion-bg)]" : "",
                    ].join(" ")}
                  >
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                      {ref.kind === "remote" ? "remote" : "local"}
                    </span>
                    <span className="min-w-0 truncate font-mono text-[11px] text-[var(--rd-cream)]">
                      {ref.name}
                      {ref.isHead ? (
                        <span className="ml-2 rounded bg-[var(--rd-ink-3)] px-1 text-[9px] text-[var(--rd-cream-2)]">HEAD</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--rd-graphite)]">{ref.shortSha}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] p-2 font-mono text-[10px] text-[var(--rd-pencil)]">
        <span>
          {baseRef || "—"} ← {headRef || "—"}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={disabled || !baseRef.trim() || !headRef.trim()}
        >
          Open session
        </Button>
      </footer>
    </div>
  );
}

function SlotField({
  label,
  value,
  active,
  disabled,
  onFocus,
  onChange,
}: {
  label: string;
  value: string;
  active: boolean;
  disabled: boolean;
  onFocus: () => void;
  onChange: (next: string) => void;
}) {
  return (
    <label
      onClick={onFocus}
      className={[
        "flex flex-col gap-1 rounded border px-2 py-1.5",
        active
          ? "border-[var(--rd-vermillion-line)] bg-[var(--rd-vermillion-bg)]"
          : "border-[var(--rd-hair)] bg-[var(--rd-ink-2)]",
      ].join(" ")}
    >
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
        {label}
      </span>
      <input
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.currentTarget.value)}
        disabled={disabled}
        placeholder="ref…"
        className="bg-transparent font-mono text-[11px] text-[var(--rd-cream)] outline-none placeholder:text-[var(--rd-graphite)]"
      />
    </label>
  );
}

function filterRefs(refs: GitRef[], query: string): GitRef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return refs;
  return refs.filter((ref) => ref.name.toLowerCase().includes(needle));
}
