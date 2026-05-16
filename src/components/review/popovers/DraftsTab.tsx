import { useMemo, useState } from "react";
import { compactPath } from "@/lib/format";
import { MarkdownPreview } from "@/components/review/MarkdownView";
import type { ReviewSession, ReviewWorkspaceState } from "@/types/review";

type DraftKind = "all" | "inline" | "replies" | "private";

type DraftEntry =
  | {
      kind: "inline";
      key: string;
      fileId: string;
      filePath: string;
      diffPosition: number;
      lineLabel: string;
      body: string;
    }
  | {
      kind: "reply";
      key: string;
      fileId: string;
      filePath: string;
      threadId: string;
      body: string;
    }
  | {
      kind: "private";
      key: string;
      fileId: string;
      filePath: string;
      body: string;
    };

export type DraftJumpTarget =
  | { fileId: string; diffPosition: number }
  | { fileId: string; expandSection: "private" }
  | { fileId: string; threadId: string };

type Props = {
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  onJump: (target: DraftJumpTarget) => void;
  onDrop: (target: DraftJumpTarget) => void;
  onOpenPublish: () => void;
};

export function DraftsTab({
  session,
  workspaceState,
  onJump,
  onDrop,
  onOpenPublish,
}: Props) {
  const [filter, setFilter] = useState<DraftKind>("all");
  const entries = useMemo(
    () => collectDrafts(session, workspaceState),
    [session, workspaceState],
  );
  const filtered = useMemo(
    () =>
      filter === "all"
        ? entries
        : entries.filter((e) => e.kind === singularize(filter)),
    [entries, filter],
  );
  const counts = useMemo(() => countByKind(entries), [entries]);
  const grouped = useMemo(() => groupByFile(filtered), [filtered]);
  const publishableCount =
    counts.inline + counts.reply;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 text-[10px]">
        <FilterChip
          label={`All · ${entries.length}`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label={`Inline · ${counts.inline}`}
          active={filter === "inline"}
          onClick={() => setFilter("inline")}
        />
        <FilterChip
          label={`Replies · ${counts.reply}`}
          active={filter === "replies"}
          onClick={() => setFilter("replies")}
        />
        <FilterChip
          label={`Private · ${counts.private}`}
          active={filter === "private"}
          onClick={() => setFilter("private")}
        />
        <span className="ml-auto rd-display-italic text-[10px] text-[var(--rd-pencil)]">
          click row · jump · drop
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="p-4 rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            No drafts in flight.
          </div>
        ) : (
          grouped.map((group) => (
            <section
              key={group.filePath}
              className="border-b border-[var(--rd-hair)] px-3 py-2.5"
            >
              <div className="mb-1 flex items-baseline justify-between">
                <span className="truncate font-mono text-[11px] text-[var(--rd-cream)]">
                  {compactPath(group.filePath, 42)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--rd-pencil)]">
                  {group.entries.length}
                </span>
              </div>
              <ul className="space-y-1">
                {group.entries.map((entry) => (
                  <li key={entry.key}>
                    <DraftRow
                      entry={entry}
                      onJump={() => onJump(entryToJumpTarget(entry))}
                      onDrop={() => onDrop(entryToJumpTarget(entry))}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2 text-[10px] text-[var(--rd-pencil)]">
        <span>
          {publishableCount} publishable · {counts.private} private stays local
        </span>
        <button
          type="button"
          onClick={onOpenPublish}
          disabled={publishableCount === 0}
          className="rounded bg-[var(--rd-cream)] px-3 py-1 text-[11px] font-medium text-[var(--rd-ink)] hover:bg-white disabled:bg-[var(--rd-ink-3)] disabled:text-[var(--rd-pencil)]"
        >
          Open Publish sheet
        </button>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-6 rounded-full px-2.5 font-mono text-[10px] uppercase tracking-wider",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function DraftRow({
  entry,
  onJump,
  onDrop,
}: {
  entry: DraftEntry;
  onJump: () => void;
  onDrop: () => void;
}) {
  const isPrivate = entry.kind === "private";
  const kindLabel = entry.kind === "inline"
    ? entry.lineLabel
    : entry.kind === "reply"
      ? "REPLY"
      : "PRIV";
  const kindClass = entry.kind === "inline"
    ? "text-[var(--rd-vermillion-2)] bg-[var(--rd-vermillion-bg)]"
    : entry.kind === "reply"
      ? "text-[var(--rd-cream-2)] bg-[var(--rd-ink-3)]"
      : "text-[var(--rd-pencil)] bg-[var(--rd-ink-3)]";
  return (
    <div
      className={[
        "group grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-sm px-2 py-1.5 text-[11px]",
        "hover:bg-[var(--rd-ink-2)]",
        isPrivate ? "opacity-80" : "",
      ].join(" ")}
    >
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${kindClass}`}
      >
        {kindLabel}
      </span>
      <button
        type="button"
        onClick={onJump}
        className="min-w-0 text-left"
      >
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
          {isPrivate ? "stays local" : "will publish"}
        </div>
        <MarkdownPreview className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-[var(--rd-cream-2)]">
          {entry.body}
        </MarkdownPreview>
      </button>
      <div className="hidden gap-1 group-hover:flex">
        <button
          type="button"
          onClick={onJump}
          className="rounded bg-[var(--rd-ink-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]"
        >
          edit
        </button>
        <button
          type="button"
          onClick={onDrop}
          className="rounded bg-[var(--rd-ink-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--rd-graphite)] hover:text-[var(--rd-del)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function collectDrafts(
  session: ReviewSession,
  state: ReviewWorkspaceState,
): DraftEntry[] {
  const out: DraftEntry[] = [];
  for (const file of session.files) {
    const fs = state[file.id];
    if (!fs) continue;

    if (fs.privateNote?.trim()) {
      out.push({
        kind: "private",
        key: `${file.id}-private`,
        fileId: file.id,
        filePath: file.path,
        body: fs.privateNote,
      });
    }
    for (const comment of fs.inlineComments ?? []) {
      if (comment.visibility !== "review") continue;
      out.push({
        kind: "inline",
        key: comment.id,
        fileId: file.id,
        filePath: file.path,
        diffPosition: comment.endDiffPosition,
        lineLabel: comment.endLine
          ? `L${comment.endLine}`
          : `pos ${comment.endDiffPosition}`,
        body: comment.body,
      });
    }
    for (const [threadId, body] of Object.entries(fs.threadReplies ?? {})) {
      if (!body.trim()) continue;
      out.push({
        kind: "reply",
        key: `${file.id}-reply-${threadId}`,
        fileId: file.id,
        filePath: file.path,
        threadId,
        body,
      });
    }
  }
  return out;
}

function countByKind(entries: DraftEntry[]) {
  let inline = 0;
  let reply = 0;
  let priv = 0;
  for (const e of entries) {
    if (e.kind === "inline") inline += 1;
    else if (e.kind === "reply") reply += 1;
    else priv += 1;
  }
  return { inline, reply, private: priv };
}

function singularize(filter: DraftKind): DraftEntry["kind"] {
  switch (filter) {
    case "inline":
      return "inline";
    case "replies":
      return "reply";
    case "private":
      return "private";
    case "all":
      return "private";
  }
}

function groupByFile(entries: DraftEntry[]) {
  const map = new Map<string, { filePath: string; entries: DraftEntry[] }>();
  for (const entry of entries) {
    const bucket = map.get(entry.filePath) ?? {
      filePath: entry.filePath,
      entries: [],
    };
    bucket.entries.push(entry);
    map.set(entry.filePath, bucket);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.filePath.localeCompare(b.filePath),
  );
}

function entryToJumpTarget(entry: DraftEntry): DraftJumpTarget {
  if (entry.kind === "inline") {
    return { fileId: entry.fileId, diffPosition: entry.diffPosition };
  }
  if (entry.kind === "reply") {
    return { fileId: entry.fileId, threadId: entry.threadId };
  }
  return { fileId: entry.fileId, expandSection: "private" };
}
