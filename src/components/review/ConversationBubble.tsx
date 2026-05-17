import type { ReviewThread } from "@/types/github";
import { threadCommentAuthorLabel } from "@/lib/github-labels";

type Props = {
  thread: ReviewThread;
  hasDraftReply?: boolean;
  onExpand: (threadId: string) => void;
};

// Collapsed conversation thread, rendered between diff rows.
// Anchored to the same 68px gutter rhythm as InlineCommentCard so the
// "margin spine" runs continuously from the open card down through closed
// threads. The spine ink encodes status (vermillion = open, graphite =
// resolved, pencil = outdated) and a draft reply adds a vermillion dot on
// the right shoulder — no pills, no bracketed [expand].
export function ConversationBubble({ thread, hasDraftReply, onExpand }: Props) {
  const status = thread.isResolved
    ? "resolved"
    : thread.isOutdated
      ? "outdated"
      : "unresolved";

  const spineColor = thread.isResolved
    ? "var(--rd-graphite)"
    : thread.isOutdated
      ? "var(--rd-pencil)"
      : "var(--rd-vermillion)";

  const statusInk = thread.isResolved
    ? "text-[var(--rd-graphite)]"
    : thread.isOutdated
      ? "text-[var(--rd-pencil)]"
      : "text-[var(--rd-cream)]";

  const firstAuthor = threadCommentAuthorLabel(thread.comments[0], "?");
  const total = thread.comments.length;
  const replies = Math.max(0, total - 1);

  return (
    <button
      type="button"
      onClick={() => onExpand(thread.id)}
      aria-label={`Open conversation on this line, ${status}, ${replies} ${replies === 1 ? "reply" : "replies"}${hasDraftReply ? ", you have a draft" : ""}`}
      className="group/bubble relative flex w-full items-center px-6 py-1.5 text-left"
    >
      {/* Margin spine — matches InlineCommentCard's 68px gutter so the ink
          runs continuously down the page. Thickens on hover. */}
      <div
        className="relative ml-[68px] flex min-w-0 flex-1 items-center gap-2.5 border-l pl-3.5 transition-[border-color] duration-150"
        style={{ borderLeftColor: spineColor }}
      >
        {/* Status mark — a 6px square stamped into the spine. Filled for
            open, hollow for resolved, half-tone for outdated. */}
        <span
          aria-hidden="true"
          className="relative -ml-[7px] inline-block h-1.5 w-1.5 shrink-0"
          style={{
            background: thread.isResolved
              ? "transparent"
              : thread.isOutdated
                ? "var(--rd-ink)"
                : spineColor,
            boxShadow: `inset 0 0 0 1px ${spineColor}`,
          }}
        />

        {/* Status as the headline — small caps voice, not a noisy glyph trail */}
        <span
          className={`font-voice text-[11.5px] lowercase tracking-[0.04em] ${statusInk}`}
        >
          {status}
        </span>

        {/* Em-rule then metadata in mono, lowercase, pencil */}
        <span aria-hidden="true" className="text-[var(--rd-hair-3)]">
          —
        </span>
        <span className="font-mono text-[10.5px] lowercase text-[var(--rd-pencil)]">
          {firstAuthor}
          {total > 1 ? (
            <>
              <span className="px-1.5 text-[var(--rd-hair-3)]">·</span>
              <span>
                {replies} {replies === 1 ? "reply" : "replies"}
              </span>
            </>
          ) : null}
        </span>

        {/* Draft marker — italic voice with a vermillion ink underline,
            not a hollow uppercase pill. This is the "red pen mark." */}
        {hasDraftReply ? (
          <span className="ml-2 inline-flex items-baseline gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1 w-1 rounded-full bg-[var(--rd-vermillion)]"
            />
            <span
              className="font-voice text-[11px] italic text-[var(--rd-vermillion-2)] [text-decoration:underline_wavy_var(--rd-vermillion-line)] [text-underline-offset:3px]"
            >
              your draft
            </span>
          </span>
        ) : null}

        {/* Open affordance — lowercase voice link with a real arrow.
            Gains a vermillion underline when the whole row is hovered. */}
        <span className="ml-auto inline-flex items-center gap-1 font-voice text-[11px] lowercase text-[var(--rd-pencil)] transition-colors duration-150 group-hover/bubble:text-[var(--rd-vermillion-2)]">
          <span className="[text-decoration:underline_solid_transparent] [text-underline-offset:3px] group-hover/bubble:[text-decoration-color:var(--rd-vermillion-line)]">
            open thread
          </span>
          <span
            aria-hidden="true"
            className="transition-transform duration-150 group-hover/bubble:translate-x-0.5"
          >
            →
          </span>
        </span>
      </div>
    </button>
  );
}
