import { ChevronDown, Folder, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { compactPath } from "@/lib/format";
import type { RecentRepo } from "@/types/review";

type Props = {
  repoPath: string;
  repoLabel: string;
  recentRepos: RecentRepo[];
  isRefsLoading: boolean;
  onSelectRepo: (path: string) => void;
  onPickFolder: () => void;
  onRefreshRefs: () => void;
  onClearRecent: () => void;
};

export function RepoChip(props: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] px-3 hover:bg-[var(--rd-ink-3)]"
        >
          <Folder className="size-3.5 text-[var(--rd-graphite)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--rd-pencil)]">repo</span>
          <span className="max-w-[180px] truncate text-[12px] font-semibold text-[var(--rd-cream)]">
            {props.repoLabel || "no repo"}
          </span>
          <ChevronDown className="size-3 text-[var(--rd-pencil)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <header className="border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
          Current
        </header>
        <div className="border-b border-[var(--rd-hair)] px-3 py-2">
          <div className="flex items-center gap-2">
            <Folder className="size-3.5 text-[var(--rd-graphite)]" />
            <span className="truncate text-[12px] font-semibold text-[var(--rd-cream)]">
              {props.repoLabel || "—"}
            </span>
            <button
              type="button"
              onClick={props.onRefreshRefs}
              disabled={!props.repoPath || props.isRefsLoading}
              className="ml-auto inline-flex items-center gap-1 rounded bg-[var(--rd-ink-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)] disabled:opacity-50"
              title="Refresh git refs"
            >
              <RefreshCw className={`size-3 ${props.isRefsLoading ? "animate-spin" : ""}`} />
              refs
            </button>
          </div>
          {props.repoPath ? (
            <div className="mt-1 truncate font-mono text-[10px] text-[var(--rd-graphite)]">
              {compactPath(props.repoPath, 56)}
            </div>
          ) : null}
        </div>

        <header className="border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
          Recent
        </header>
        <ul className="max-h-[240px] overflow-y-auto py-1">
          {props.recentRepos.length === 0 ? (
            <li className="px-3 py-3 rd-display-italic text-[11px] text-[var(--rd-pencil)]">No recent repos.</li>
          ) : null}
          {props.recentRepos.map((recent) => (
            <li key={recent.root}>
              <button
                type="button"
                onClick={() => props.onSelectRepo(recent.root)}
                className="flex w-full flex-col items-stretch gap-0.5 px-3 py-1.5 text-left hover:bg-[var(--rd-ink-2)]"
              >
                <span className="text-[12px] text-[var(--rd-cream)]">{recent.name}</span>
                <span className="truncate font-mono text-[10px] text-[var(--rd-graphite)]">
                  {compactPath(recent.root, 56)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] p-2">
          <Button type="button" variant="ghost" size="xs" onClick={props.onPickFolder}>
            Open folder…
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={props.onClearRecent} disabled={props.recentRepos.length === 0}>
            Clear recent
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
