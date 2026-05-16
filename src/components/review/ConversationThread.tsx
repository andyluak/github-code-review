import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewThread } from "@/types/github";

type Props = {
  thread: ReviewThread;
  onCollapse: () => void;
  onReply: (threadId: string, body: string) => void;
};

export function ConversationThread({ thread, onCollapse, onReply }: Props) {
  const [reply, setReply] = useState("");
  return (
    <div className="border-y border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-4 py-3 font-mono text-[12px] text-[var(--rd-cream)]">
      <div className="mb-2 flex items-center justify-between text-[10px] text-[var(--rd-pencil)]">
        <span>
          {thread.path} · L{thread.line ?? thread.originalLine ?? "?"}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="hover:text-[var(--rd-cream)]"
        >
          collapse
        </button>
      </div>
      <ul className="space-y-2">
        {thread.comments.map((c) => (
          <li key={c.id}>
            <div className="text-[11px] text-[var(--rd-cream-2)]">
              <span className="text-[var(--rd-cream)]">{c.author}</span>{" "}
              <span className="text-[var(--rd-pencil)]">{c.createdAt}</span>
            </div>
            <div className="whitespace-pre-wrap text-[12px]">{c.body}</div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.currentTarget.value)}
          rows={3}
          placeholder="Reply (local draft until publish)"
          className="w-full rounded border-0 bg-[var(--rd-ink-3)] p-2 text-[12px] text-[var(--rd-cream)]"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="xs"
            onClick={() => {
              if (!reply.trim()) return;
              onReply(thread.id, reply);
              setReply("");
            }}
          >
            Save draft
          </Button>
        </div>
      </div>
    </div>
  );
}
