import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GitCommit, RepoRefs } from "@/types/review";

type Props = {
  commitRef: string;
  repoRefs: RepoRefs | null;
  disabled: boolean;
  onChange: (next: string) => void;
  onPickCommit: (sha: string) => void;
  onConfirm: () => void;
};

export function CommitControls({
  commitRef,
  repoRefs,
  disabled,
  onChange,
  onPickCommit,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState("");
  const commits = repoRefs?.commits ?? [];
  const filtered = useMemo(() => filterCommits(commits, query), [commits, query]);

  return (
    <div className="flex max-h-[420px] flex-col">
      <div className="flex flex-col gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] p-3">
        <Input
          value={commitRef}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          placeholder="commit sha or ref (e.g. HEAD, abc1234)"
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search recent commits…"
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {commits.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">
            {repoRefs ? "No commits found." : "Loading commits…"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">No commits match.</div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.slice(0, 50).map((commit) => {
              const isPicked = commitRef.trim() === commit.sha || commitRef.trim() === commit.shortSha;
              return (
                <li key={commit.sha}>
                  <button
                    type="button"
                    onClick={() => onPickCommit(commit.shortSha)}
                    className={[
                      "grid w-full grid-cols-[auto_1fr] items-baseline gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--rd-ink-2)]",
                      isPicked ? "bg-[var(--rd-vermillion-bg)]" : "",
                    ].join(" ")}
                  >
                    <span className="font-mono text-[10.5px] text-[var(--rd-vermillion-2)]">
                      {commit.shortSha}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] text-[var(--rd-cream)]">{commit.title}</span>
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
        )}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] p-2 font-mono text-[10px] text-[var(--rd-pencil)]">
        <span>
          {filtered.length} of {commits.length}
        </span>
        <Button type="button" size="sm" onClick={onConfirm} disabled={disabled || !commitRef.trim()}>
          Open session
        </Button>
      </footer>
    </div>
  );
}

function filterCommits(commits: GitCommit[], query: string): GitCommit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commits;
  return commits.filter((commit) => {
    if (commit.shortSha.toLowerCase().includes(needle)) return true;
    if (commit.sha.toLowerCase().includes(needle)) return true;
    if (commit.title.toLowerCase().includes(needle)) return true;
    if (commit.author.toLowerCase().includes(needle)) return true;
    return false;
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}
