import { useMemo, useState } from "react";
import { compactPath } from "@/lib/format";
import { normalizeThreadReplyMap } from "@/lib/thread-reply-drafts";
import { MarkdownPreview } from "@/components/review/MarkdownView";
import { SlabButton } from "@/components/ui/slab-button";
import type {
  InlineComment,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

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
      draftId: string;
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
  | { fileId: string; threadId: string; draftId?: string };

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
  const publishableCount = counts.inline + counts.reply;

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex items-center gap-4 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2'>
        <FilterChip
          label='all'
          count={entries.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label='inline'
          count={counts.inline}
          active={filter === "inline"}
          onClick={() => setFilter("inline")}
        />
        <FilterChip
          label='replies'
          count={counts.reply}
          active={filter === "replies"}
          onClick={() => setFilter("replies")}
        />
        <FilterChip
          label='private'
          count={counts.private}
          active={filter === "private"}
          onClick={() => setFilter("private")}
        />
        <span className='ml-auto rd-display-italic text-[11px] text-[var(--rd-pencil)]'>
          click row · jump · drop
        </span>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {grouped.length === 0 ? (
          <div className='p-4 rd-display-italic text-[12px] text-[var(--rd-pencil)]'>
            No drafts in flight.
          </div>
        ) : (
          grouped.map((group) => (
            <section
              key={group.filePath}
              className='border-b border-[var(--rd-hair)] px-3 py-2.5'
            >
              <div className='mb-1.5 flex items-baseline justify-between gap-2'>
                <div className='flex min-w-0 items-baseline gap-2'>
                  <span className='truncate font-mono text-[11px] text-[var(--rd-cream-2)]'>
                    {compactPath(group.filePath, 42)}
                  </span>
                  <span className='font-voice text-[10.5px] lowercase tracking-[0.02em] text-[var(--rd-pencil)]'>
                    · {group.entries.length}{" "}
                    {group.entries.length === 1 ? "draft" : "drafts"}
                  </span>
                </div>
              </div>
              <ul className='space-y-1'>
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

      <div className='flex items-center justify-between gap-3 border-t border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3 py-2'>
        <span className='font-voice text-[11px] lowercase tracking-[0.02em] text-[var(--rd-pencil)]'>
          <span className='font-mono tabular-nums text-[var(--rd-cream-2)]'>
            {publishableCount}
          </span>{" "}
          publishable ·{" "}
          <span className='font-mono tabular-nums text-[var(--rd-cream-2)]'>
            {counts.private}
          </span>{" "}
          private stays local
        </span>
        <div className='flex items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]'>
          <SlabButton
            variant='primary'
            size='sm'
            onClick={onOpenPublish}
            disabled={publishableCount === 0}
          >
            open publish sheet
          </SlabButton>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
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
  // Lowercase voice + mono tabular count, matching the Drafts/Threads/
  // Activity tab rhythm above. No pill, no uppercase, no wrap — the
  // active state is carried by a vermillion bottom hairline (the page
  // rule under the chosen word).
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={[
        "group/chip relative inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap py-1 transition-colors duration-150",
        active
          ? "text-[var(--rd-cream)]"
          : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      <span className='font-voice text-[12.5px] lowercase tracking-[0.01em]'>
        {label}
      </span>
      <span
        className={[
          "font-mono text-[11px] tabular-nums leading-none transition-colors duration-150",
          active
            ? "text-[var(--rd-vermillion-2)]"
            : "text-[var(--rd-graphite)] group-hover/chip:text-[var(--rd-cream-2)]",
        ].join(" ")}
      >
        {count}
      </span>
      {/* Active rule — a 2px vermillion line painted under the word,
          like a margin-marker. Inactive shows a transparent rule so the
          baseline never shifts when toggling. */}
      <span
        aria-hidden='true'
        className={[
          "pointer-events-none absolute -bottom-[7px] left-0 right-0 h-[2px] transition-colors duration-150",
          active ? "bg-[var(--rd-vermillion)]" : "bg-transparent",
        ].join(" ")}
      />
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
  // The "kind" used to be a colored uppercase pill ("INLINE", "REPLY",
  // "PRIV"). We carry the same encoding now with a colored 2px left
  // spine + a lowercase voice tag, matching the rest of the popover.
  const kindTone =
    entry.kind === "inline"
      ? "var(--rd-vermillion)"
      : entry.kind === "reply"
        ? "var(--rd-cream-2)"
        : "var(--rd-pencil)";
  const kindLabel =
    entry.kind === "inline"
      ? entry.lineLabel.toLowerCase()
      : entry.kind === "reply"
        ? "reply"
        : "private";
  const kindLabelInk =
    entry.kind === "inline"
      ? "text-[var(--rd-vermillion-2)]"
      : entry.kind === "reply"
        ? "text-[var(--rd-cream-2)]"
        : "text-[var(--rd-pencil)]";
  const fateLabel = isPrivate ? "stays local" : "will publish";

  return (
    <div
      className={[
        "group grid grid-cols-[auto_1fr_auto] items-start gap-2.5 px-1.5 py-1.5",
        "border-l-2 pl-2 transition-colors duration-150",
        "hover:bg-[var(--rd-ink-2)]",
        isPrivate ? "opacity-90" : "",
      ].join(" ")}
      style={{ borderLeftColor: kindTone }}
    >
      <span
        className={`shrink-0 self-baseline font-voice text-[11px] lowercase tracking-[0.02em] ${kindLabelInk}`}
      >
        {kindLabel}
      </span>
      <button type='button' onClick={onJump} className='min-w-0 text-left'>
        <div className='font-voice text-[10.5px] lowercase tracking-[0.02em] text-[var(--rd-pencil)]'>
          {fateLabel}
        </div>
        <MarkdownPreview className='mt-0.5 block line-clamp-2 font-voice text-[12px] leading-[1.45] text-[var(--rd-cream-2)]'>
          {entry.body}
        </MarkdownPreview>
      </button>
      <div className='hidden items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)] group-hover:flex'>
        <button
          type='button'
          onClick={onJump}
          className='px-2 py-0.5 font-voice text-[11px] lowercase tracking-[0.02em] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]'
          aria-label='Jump to draft'
        >
          edit
        </button>
        <button
          type='button'
          onClick={onDrop}
          className='px-2 py-0.5 font-voice text-[11px] lowercase tracking-[0.02em] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-del)]'
          aria-label='Discard draft'
        >
          discard
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
        lineLabel: inlineCommentLineLabel(comment),
        body: comment.body,
      });
    }
    for (const [threadId, drafts] of Object.entries(
      normalizeThreadReplyMap(fs.threadReplies),
    )) {
      for (const draft of drafts) {
        if (!draft.body.trim()) continue;
        out.push({
          kind: "reply",
          key: `${file.id}-reply-${threadId}-${draft.id}`,
          fileId: file.id,
          filePath: file.path,
          threadId,
          draftId: draft.id,
          body: draft.body,
        });
      }
    }
  }
  return out;
}

function inlineCommentLineLabel(comment: InlineComment): string {
  if (comment.startLine && comment.endLine && comment.startLine !== comment.endLine) {
    return `L${comment.startLine}-L${comment.endLine}`;
  }
  if (comment.endLine || comment.startLine) {
    return `L${comment.endLine ?? comment.startLine}`;
  }
  return `pos ${comment.endDiffPosition}`;
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
    return { fileId: entry.fileId, threadId: entry.threadId, draftId: entry.draftId };
  }
  return { fileId: entry.fileId, expandSection: "private" };
}
