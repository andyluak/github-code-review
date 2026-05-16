import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useChecks } from "@/hooks/use-checks";
import {
  bucketCounts,
  formatDuration,
  formatUpdatedAt,
  presentationFor,
  sortChecks,
  type CheckPresentation,
} from "@/lib/check-presentation";
import type { CheckRun } from "@/types/github";

type Tab = "all" | "failed" | "running" | "required";

type Props = {
  repoPath: string | null;
  prNumber: number | null;
  prUrl: string | null;
  open: boolean;
};

export function ChecksPopover({ repoPath, prNumber, prUrl, open }: Props) {
  const { data, isLoading, error, refresh } = useChecks(repoPath, prNumber, {
    enabled: open,
  });
  const [tab, setTab] = useState<Tab>("all");

  const checks = data?.checks ?? [];
  const counts = useMemo(() => bucketCounts(checks), [checks]);
  const sorted = useMemo(() => sortChecks(checks), [checks]);
  const filtered = useMemo(() => filterChecks(sorted, tab), [sorted, tab]);

  return (
    <div className="flex w-[480px] flex-col overflow-hidden">
      <header className="border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3.5 py-2.5">
        <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">
          Checks · {prNumber !== null ? `#${prNumber}` : ""}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-[var(--rd-pencil)]">
          head {data?.headSha ? data.headSha.slice(0, 8) : "…"} · auto-refresh every 30s
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 text-[10px]">
        <SumPill tone="pass" label={`✓ ${counts.passed} passed`} />
        <SumPill tone="fail" label={`✗ ${counts.failed} failed`} />
        <SumPill tone="run" label={`● ${counts.running} running`} />
        <SumPill tone="queue" label={`◐ ${counts.queued} queued`} />
        <SumPill tone="dim" label={`― ${counts.other} other`} />
        <span className="ml-auto font-mono text-[10px] text-[var(--rd-pencil)]">
          {data ? `updated ${formatUpdatedAt(data.fetchedAt)}` : isLoading ? "loading…" : ""}
        </span>
      </div>

      <nav className="flex shrink-0 gap-2 border-b border-[var(--rd-hair)] px-3 py-1.5 font-mono text-[11px]">
        <TabButton label="All" count={checks.length} active={tab === "all"} onClick={() => setTab("all")} />
        <TabButton label="Failed" count={counts.failed} active={tab === "failed"} onClick={() => setTab("failed")} />
        <TabButton label="Running" count={counts.running} active={tab === "running"} onClick={() => setTab("running")} />
        <TabButton
          label="Required"
          count={checks.filter((c) => c.required).length}
          active={tab === "required"}
          onClick={() => setTab("required")}
        />
      </nav>

      <div className="max-h-[400px] min-h-[200px] flex-1 overflow-y-auto">
        {error ? (
          <div className="p-4 font-mono text-[11px] leading-snug text-[var(--rd-del)]">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            {isLoading ? "Loading…" : "No checks in this view."}
          </div>
        ) : (
          <ul>
            {filtered.map((check) => (
              <li
                key={check.id}
                className="border-b border-[var(--rd-hair)] last:border-b-0"
              >
                <CheckRow check={check} onOpen={() => check.url && openUrl(check.url)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 text-[10px] text-[var(--rd-pencil)]">
        <span>Click a row to open its run on GitHub</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="rounded bg-[var(--rd-ink-2)] px-2 py-1 font-mono text-[10px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
          >
            Refresh
          </button>
          {prUrl ? (
            <button
              type="button"
              onClick={() => openUrl(`${prUrl}/checks`)}
              className="rounded bg-[var(--rd-ink-2)] px-2 py-1 font-mono text-[10px] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
            >
              Open all ↗
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function CheckRow({ check, onOpen }: { check: CheckRun; onOpen: () => void }) {
  const pres = presentationFor(check.state);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!check.url}
      className="grid w-full grid-cols-[24px_1fr_auto_auto] items-center gap-3 px-3.5 py-2 text-left hover:bg-[var(--rd-ink-2)] disabled:cursor-default"
    >
      <span className={`text-center font-mono text-[12px] ${toneClass(pres.tone)}`}>
        {pres.symbol}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] text-[var(--rd-cream)]">
          {check.name}
          {check.required ? (
            <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--rd-pencil)]">
              required
            </span>
          ) : null}
        </span>
        {check.source ? (
          <span className="block truncate font-mono text-[9.5px] text-[var(--rd-graphite)]">
            {check.source}
          </span>
        ) : null}
      </span>
      <span className={`font-mono text-[9.5px] uppercase tracking-[0.08em] ${labelToneClass(pres.tone)}`}>
        {pres.label}
      </span>
      <span className="font-mono text-[9.5px] tabular-nums text-[var(--rd-pencil)]">
        {formatDuration(check.durationMs)}
      </span>
    </button>
  );
}

function SumPill({ tone, label }: { tone: CheckPresentation["tone"]; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold",
        toneBgClass(tone),
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded px-2 py-1",
        active ? "text-[var(--rd-vermillion-2)]" : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="rounded bg-[var(--rd-ink-2)] px-1.5 py-0.5 text-[9.5px] tabular-nums text-[var(--rd-graphite)]">
        {count}
      </span>
    </button>
  );
}

function filterChecks(checks: CheckRun[], tab: Tab): CheckRun[] {
  if (tab === "all") return checks;
  if (tab === "failed")
    return checks.filter(
      (c) => c.state === "failure" || c.state === "timed_out" || c.state === "action_required",
    );
  if (tab === "running") return checks.filter((c) => c.state === "in_progress");
  return checks.filter((c) => c.required);
}

function toneClass(tone: CheckPresentation["tone"]): string {
  switch (tone) {
    case "pass":    return "text-[#76c884]";
    case "fail":    return "text-[var(--rd-del)]";
    case "run":     return "text-[var(--rd-cream-2)]";
    case "queue":   return "text-[var(--rd-cream)]";
    case "neutral": return "text-[var(--rd-graphite)]";
    case "dim":     return "text-[var(--rd-pencil)]";
  }
}

function labelToneClass(tone: CheckPresentation["tone"]): string {
  switch (tone) {
    case "pass":    return "text-[#76c884]";
    case "fail":    return "text-[var(--rd-del)]";
    case "run":     return "text-[var(--rd-cream-2)]";
    case "queue":   return "text-[var(--rd-cream-2)]";
    case "neutral": return "text-[var(--rd-pencil)]";
    case "dim":     return "text-[var(--rd-graphite)]";
  }
}

function toneBgClass(tone: CheckPresentation["tone"]): string {
  switch (tone) {
    case "pass":    return "border-[#234c2b] bg-[#152017] text-[#a4d4a8]";
    case "fail":    return "border-[#5a2f25] bg-[#211210] text-[var(--rd-del)]";
    case "run":     return "border-[#553d18] bg-[#211a10] text-[#f1c98a]";
    case "queue":   return "border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream-2)]";
    case "neutral":
    case "dim":     return "border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-graphite)]";
  }
}
