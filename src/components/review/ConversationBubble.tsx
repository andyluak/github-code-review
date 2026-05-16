import type { ReviewThread } from "@/types/github";

type Props = {
  thread: ReviewThread;
  onExpand: (threadId: string) => void;
};

export function ConversationBubble({ thread, onExpand }: Props) {
  const glyph = thread.isResolved ? "●" : thread.isOutdated ? "○" : "◐";
  const color = thread.isResolved
    ? "text-[var(--rd-pencil)]"
    : thread.isOutdated
      ? "text-[var(--rd-cream-2)]"
      : "text-[var(--rd-vermillion-2)]";
  const firstAuthor = thread.comments[0]?.author ?? "?";
  const replies = Math.max(0, thread.comments.length - 1);
  return (
    <button
      type="button"
      onClick={() => onExpand(thread.id)}
      className="flex w-full items-center gap-2 px-4 py-1 text-left font-mono text-[11px] hover:bg-[var(--rd-ink-2)]"
    >
      <span className={`${color}`}>╰─ {glyph}</span>
      <span className="text-[var(--rd-cream-2)]">{thread.comments.length}</span>
      <span className="text-[var(--rd-cream)]">{firstAuthor}</span>
      <span className="text-[var(--rd-pencil)]">·</span>
      <span className="text-[var(--rd-pencil)]">
        {thread.isResolved
          ? "resolved"
          : thread.isOutdated
            ? "outdated"
            : "unresolved"}
      </span>
      <span className="text-[var(--rd-pencil)]">·</span>
      <span className="text-[var(--rd-pencil)]">{replies} replies</span>
      <span className="ml-auto text-[var(--rd-pencil)]">[expand]</span>
    </button>
  );
}
