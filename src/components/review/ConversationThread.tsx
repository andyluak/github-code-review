import { useState } from "react";
import { SlabButton } from "@/components/ui/slab-button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/components/review/MarkdownView";
import {
  threadCommentAuthorLabel,
  threadLineLabel,
} from "@/lib/github-labels";
import type { ReviewThread, ThreadComment } from "@/types/github";
import type { ThreadReplyDraft } from "@/types/review";

type Props = {
  thread: ReviewThread;
  localDraftReplies?: ThreadReplyDraft[];
  onCollapse: () => void;
  onReply: (threadId: string, body: string) => void;
  onDeleteDraftReply?: (threadId: string, draftId: string) => void;
};

// Expanded conversation thread. Sits in the same 68px gutter as
// InlineCommentCard, with a vermillion (or graphite, if resolved) left
// hairline running the full height — one continuous "margin spine" from
// the diff line above. Comments read as voices on the page rather than
// cards stacked in cards.
export function ConversationThread({
  thread,
  localDraftReplies,
  onCollapse,
  onReply,
  onDeleteDraftReply,
}: Props) {
  const [reply, setReply] = useState("");
  const drafts = localDraftReplies?.filter((draft) => draft.body.trim()) ?? [];
  const canSave = reply.trim().length > 0;

  const spineColor = thread.isResolved
    ? "var(--rd-graphite)"
    : "var(--rd-vermillion)";

  return (
    <div className="relative px-6 py-4">
      <div
        className="ml-[68px] border-l pl-3.5"
        style={{ borderLeftColor: spineColor }}
      >
        {/* Header — path & line on the left, fold action on the right.
            Matches the cancel/lowercase voice rhythm of the composer. */}
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="font-voice text-[11.5px] lowercase tracking-[0.02em] text-[var(--rd-cream-2)]">
            thread on{" "}
            <span className="font-mono text-[11px] text-[var(--rd-cream)]">
              {thread.path}
            </span>{" "}
            <span className="text-[var(--rd-pencil)]">
              · {threadLineLabel(thread)}
            </span>
            {thread.isResolved ? (
              <span className="ml-2 text-[var(--rd-pencil)]">— resolved</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCollapse}
            className="font-voice text-[10.5px] lowercase tracking-[0.02em] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
            aria-label="Collapse thread"
          >
            fold
          </button>
        </div>

        {/* Voices on the page. Each comment leads with author + timestamp
            on a single line, then prose. No cards, no chrome. The mini
            inset hairline at the left of each entry gives each voice a
            sub-rhythm without nesting a box. */}
        <ul className="space-y-3.5">
          {thread.comments.map((c, idx) => (
            <CommentEntry key={c.id} comment={c} isLast={idx === thread.comments.length - 1} />
          ))}

          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="relative pl-3 border-l border-[var(--rd-vermillion-line)] group/draft"
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-voice text-[12px] text-[var(--rd-cream)]">
                  me
                </span>
                <span className="text-[var(--rd-hair-3)]">—</span>
                {/* The draft state, as inline italic voice with a wavy
                    vermillion underline. No pill, no uppercase, no box. */}
                <span className="font-voice text-[10.5px] italic lowercase text-[var(--rd-vermillion-2)] [text-decoration:underline_wavy_var(--rd-vermillion-line)] [text-underline-offset:3px]">
                  draft
                </span>
                <span className="font-voice text-[10.5px] lowercase text-[var(--rd-pencil)]">
                  · local until publish
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteDraftReply?.(thread.id, draft.id)}
                  className="ml-auto font-voice text-[10.5px] lowercase tracking-[0.02em] text-[var(--rd-pencil)] opacity-0 transition-opacity duration-150 hover:text-[var(--rd-del)] group-hover/draft:opacity-100 focus-visible:opacity-100"
                  aria-label="Discard local draft reply"
                >
                  × discard
                </button>
              </div>
              {/* Draft body in italic voice — the unset, unsaved ink. */}
              <div className="rd-voice text-[13px] italic leading-[1.5] text-[var(--rd-cream)] whitespace-pre-wrap">
                {draft.body}
              </div>
            </li>
          ))}
        </ul>

        {/* Reply composer — same Textarea language as InlineCommentComposer
            so the whole margin reads as one editor's tool. */}
        <div className="mt-4">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (canSave) {
                  onReply(thread.id, reply);
                  setReply("");
                }
              }
            }}
            rows={3}
            placeholder="reply — saved locally until you publish"
            aria-label="Reply body. Markdown supported. Shift Enter saves the draft."
            className="min-h-20 resize-y rounded-none border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-3.5 py-3 font-voice text-[13px] leading-[1.5] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)] placeholder:font-voice focus-visible:border-[var(--rd-vermillion-line)] focus-visible:ring-0 focus-visible:outline-none"
          />
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="font-voice text-[10.5px] lowercase tracking-[0.02em] text-[var(--rd-pencil)]">
              ⇧↩ to save
            </span>
            <div className="flex items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]">
              <SlabButton
                variant="primary"
                size="sm"
                disabled={!canSave}
                onClick={() => {
                  if (!canSave) return;
                  onReply(thread.id, reply);
                  setReply("");
                }}
              >
                {drafts.length > 0 ? "save another" : "save draft"}
              </SlabButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentEntry({
  comment,
  isLast,
}: {
  comment: ThreadComment;
  isLast: boolean;
}) {
  const author = threadCommentAuthorLabel(comment);
  const when = formatThreadTime(comment.createdAt);
  return (
    <li className={isLast ? undefined : "pb-0.5"}>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-voice text-[12px] text-[var(--rd-cream)]">
          {author}
        </span>
        <span className="text-[var(--rd-hair-3)]">—</span>
        <span
          className="font-mono text-[10.5px] lowercase text-[var(--rd-pencil)]"
          title={comment.createdAt}
        >
          {when}
        </span>
      </div>
      <MarkdownView
        className="rd-voice text-[13px] leading-[1.5] text-[var(--rd-cream)] [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-[var(--rd-cream)] [&_code]:bg-transparent [&_code]:px-0"
        compact
      >
        {comment.body}
      </MarkdownView>
    </li>
  );
}

// Compact, human-readable timestamp. Falls back to the original ISO if
// parsing fails so we never lose information from the page.
function formatThreadTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const d = new Date(ts);
  const year = d.getFullYear();
  const now = new Date();
  const sameYear = year === now.getFullYear();
  const month = d.toLocaleString(undefined, { month: "short" }).toLowerCase();
  return sameYear ? `${month} ${d.getDate()}` : `${month} ${d.getDate()}, ${year}`;
}
