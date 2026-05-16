import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GitCommit, GitRef, RepoRefs } from "@/types/review";

type Props = {
  from: string;
  to: string;
  repoRefs: RepoRefs | null;
  disabled: boolean;
  onFromChange: (next: string) => void;
  onToChange: (next: string) => void;
  onConfirm: () => void;
};

type Slot = "from" | "to";

export function RangeControls({
  from,
  to,
  repoRefs,
  disabled,
  onFromChange,
  onToChange,
  onConfirm,
}: Props) {
  const [active, setActive] = useState<Slot>("from");
  const [query, setQuery] = useState("");

  const commits = repoRefs?.commits ?? [];
  const refs = repoRefs?.refs ?? [];
  const filteredCommits = useMemo(() => filterCommits(commits, query).slice(0, 30), [commits, query]);
  const filteredRefs = useMemo(() => filterRefs(refs, query).slice(0, 12), [refs, query]);

  const pick = (value: string) => {
    if (active === "from") onFromChange(value);
    else onToChange(value);
  };

  return (
    <div className="flex max-h-[440px] flex-col">
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] p-3">
        <SlotField
          label="from"
          value={from}
          active={active === "from"}
          disabled={disabled}
          onFocus={() => setActive("from")}
          onChange={onFromChange}
        />
        <SlotField
          label="to"
          value={to}
          active={active === "to"}
          disabled={disabled}
          onFocus={() => setActive("to")}
          onChange={onToChange}
        />
      </div>

      <div className="border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={`Search commits or refs to set "${active}"…`}
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {filteredRefs.length > 0 ? (
          <section className="px-2 pt-1 pb-2">
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
              Refs
            </div>
            <div className="flex flex-wrap gap-1">
              {filteredRefs.map((ref) => (
                <button
                  key={ref.name}
                  type="button"
                  onClick={() => pick(ref.name)}
                  className="rounded bg-[var(--rd-ink-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
                >
                  {ref.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {commits.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">
            {repoRefs ? "No commits found." : "Loading commits…"}
          </div>
        ) : filteredCommits.length === 0 ? null : (
          <section className="px-1 pb-1">
            <div className="mb-1 px-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
              Commits
            </div>
            <ul className="space-y-0.5">
              {filteredCommits.map((commit) => {
                const target = active === "from" ? from : to;
                const isPicked =
                  target.trim() === commit.sha || target.trim() === commit.shortSha;
                return (
                  <li key={commit.sha}>
                    <button
                      type="button"
                      onClick={() => pick(commit.shortSha)}
                      className={[
                        "grid w-full grid-cols-[auto_1fr] items-baseline gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--rd-ink-2)]",
                        isPicked ? "bg-[var(--rd-vermillion-bg)]" : "",
                      ].join(" ")}
                    >
                      <span className="font-mono text-[10.5px] text-[var(--rd-vermillion-2)]">
                        {commit.shortSha}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] text-[var(--rd-cream)]">
                          {commit.title}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-[var(--rd-graphite)]">
                          {commit.author}
                          {commit.date ? ` · ${formatDate(commit.date)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] p-2 font-mono text-[10px] text-[var(--rd-pencil)]">
        <span>
          {from || "—"} … {to || "—"}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={disabled || !from.trim() || !to.trim()}
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
        placeholder="ref or sha"
        className="bg-transparent font-mono text-[11px] text-[var(--rd-cream)] outline-none placeholder:text-[var(--rd-graphite)]"
      />
    </label>
  );
}

function filterCommits(commits: GitCommit[], query: string): GitCommit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commits;
  return commits.filter((c) => {
    if (c.shortSha.toLowerCase().includes(needle)) return true;
    if (c.sha.toLowerCase().includes(needle)) return true;
    if (c.title.toLowerCase().includes(needle)) return true;
    if (c.author.toLowerCase().includes(needle)) return true;
    return false;
  });
}

function filterRefs(refs: GitRef[], query: string): GitRef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return refs;
  return refs.filter((ref) => ref.name.toLowerCase().includes(needle));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}
