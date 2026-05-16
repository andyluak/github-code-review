import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PullRequestSummary } from "@/types/github";

type Props = {
  pullRequests: PullRequestSummary[];
  isInboxLoading: boolean;
  inboxError: string | null;
  pullRequestInput: string;
  pullRequestNumber: number | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onPickPr: (pr: PullRequestSummary) => void;
};

export function PullRequestControls({
  pullRequests,
  isInboxLoading,
  inboxError,
  pullRequestInput,
  pullRequestNumber,
  onInputChange,
  onSubmit,
  onPickPr,
}: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => filterPRs(pullRequests, search), [pullRequests, search]);

  return (
    <div className="flex max-h-[420px] flex-col">
      <div className="flex flex-col gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search PRs by # or title…"
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
        <Input
          value={pullRequestInput}
          onChange={(e) => onInputChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="Or paste a PR URL"
          className="h-7 rounded border-0 bg-[var(--rd-ink-2)] px-2 font-mono text-[11px] text-[var(--rd-cream)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {inboxError ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-del)]">{inboxError}</div>
        ) : isInboxLoading && pullRequests.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">Loading PRs…</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 font-mono text-[11px] text-[var(--rd-pencil)]">No PRs match.</div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((pr) => (
              <li key={pr.number}>
                <button
                  type="button"
                  onClick={() => onPickPr(pr)}
                  className={[
                    "grid w-full grid-cols-[auto_1fr] items-baseline gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--rd-ink-2)]",
                    pullRequestNumber === pr.number ? "bg-[var(--rd-vermillion-bg)]" : "",
                  ].join(" ")}
                >
                  <span className="font-mono text-[11px] text-[var(--rd-vermillion-2)]">#{pr.number}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] text-[var(--rd-cream)]">{pr.title}</span>
                    <span className="block truncate font-mono text-[10px] text-[var(--rd-graphite)]">
                      {pr.baseRefName} ← {pr.headRefName}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] p-2 font-mono text-[10px] text-[var(--rd-pencil)]">
        <span>{filtered.length} of {pullRequests.length}</span>
        <Button type="button" size="sm" onClick={onSubmit} disabled={!pullRequestInput.trim() && pullRequestNumber === null}>
          {pullRequestNumber !== null ? `Open #${pullRequestNumber}` : "Open"}
        </Button>
      </footer>
    </div>
  );
}

function filterPRs(prs: PullRequestSummary[], q: string): PullRequestSummary[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return prs;
  return prs.filter((pr) => {
    if (needle.startsWith("#")) return String(pr.number).startsWith(needle.slice(1));
    if (/^\d+$/.test(needle)) return String(pr.number).startsWith(needle);
    return pr.title.toLowerCase().includes(needle);
  });
}
