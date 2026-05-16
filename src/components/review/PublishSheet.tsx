import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fingerprintBody,
  fingerprintInline,
  fingerprintThreadReply,
} from "@/lib/fingerprint";
import { publishPullRequestReview } from "@/lib/github";
import type {
  PublishInlineComment,
  PublishReviewEvent,
  PublishReviewResponse,
  PublishThreadReply,
} from "@/types/github";
import type {
  InlineComment,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

type Props = {
  open: boolean;
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  onClose: () => void;
  onPublished: (response: PublishReviewResponse) => void;
};

const EVENTS: PublishReviewEvent[] = ["COMMENT", "APPROVE", "REQUEST_CHANGES"];

export function PublishSheet(props: Props) {
  const { open, session, workspaceState, onClose, onPublished } = props;
  const [event, setEvent] = useState<PublishReviewEvent>("COMMENT");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = session.target;
  const isPr = target.kind === "pullRequest";
  const prNumber = isPr ? target.number ?? null : null;
  const headSha = isPr ? target.headSha ?? null : null;
  const repoPath = session.repo.requestedPath;

  const reviewInlineDrafts = useMemo<InlineComment[]>(() => {
    const out: InlineComment[] = [];
    for (const fs of Object.values(workspaceState)) {
      if (!fs) continue;
      for (const c of fs.inlineComments ?? []) {
        if (c.visibility === "review") out.push(c);
      }
    }
    return out;
  }, [workspaceState]);

  const threadReplyDrafts = useMemo<{ threadId: string; body: string }[]>(() => {
    const out: { threadId: string; body: string }[] = [];
    for (const fs of Object.values(workspaceState)) {
      const map = fs?.threadReplies;
      if (!map) continue;
      for (const [threadId, replyBody] of Object.entries(map)) {
        if (replyBody.trim()) out.push({ threadId, body: replyBody });
      }
    }
    return out;
  }, [workspaceState]);

  const privateNoteCount = useMemo(() => {
    let n = 0;
    for (const fs of Object.values(workspaceState)) {
      if (!fs) continue;
      if ((fs.privateNote?.trim().length ?? 0) > 0) n++;
      for (const c of fs.inlineComments ?? []) {
        if (c.visibility === "private") n++;
      }
    }
    return n;
  }, [workspaceState]);

  if (!open) return null;

  async function onSubmit() {
    if (!isPr || prNumber === null || !headSha) {
      setError("PR head SHA is missing — refresh and retry.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const inlineComments: PublishInlineComment[] = reviewInlineDrafts.map(
        (c) => ({
          fingerprint: fingerprintInline(
            {
              path: c.path,
              line: c.endLine ?? c.startLine ?? 0,
              side: c.side === "old" ? "LEFT" : "RIGHT",
              body: c.body,
            },
            prNumber,
            headSha,
          ),
          path: c.path,
          line: c.endLine ?? c.startLine ?? 0,
          side: c.side === "old" ? "LEFT" : "RIGHT",
          body: c.body,
        }),
      );
      const threadReplies: PublishThreadReply[] = threadReplyDrafts.map((r) => ({
        fingerprint: fingerprintThreadReply(
          r.threadId,
          r.body,
          prNumber,
          headSha,
        ),
        threadId: r.threadId,
        body: r.body,
      }));
      const bodyFingerprint = body.trim()
        ? fingerprintBody(body, prNumber, headSha, event)
        : null;
      const result = await publishPullRequestReview({
        repoPath,
        number: prNumber,
        expectedHeadSha: headSha,
        event,
        body,
        bodyFingerprint,
        inlineComments,
        threadReplies,
      });
      onPublished(result);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const publishDisabled =
    submitting ||
    !isPr ||
    prNumber === null ||
    !headSha ||
    (reviewInlineDrafts.length === 0 &&
      threadReplyDrafts.length === 0 &&
      !body.trim());

  return (
    <div className="absolute right-0 top-12 bottom-0 z-30 w-[420px] border-l border-[var(--rd-hair)] bg-[var(--rd-ink)] p-4 text-[12px] text-[var(--rd-cream)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="rd-display-italic text-[14px]">Publish review</h2>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
        >
          close
        </button>
      </div>
      <div className="mb-3 flex gap-2 font-mono text-[11px]">
        {EVENTS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEvent(e)}
            className={
              event === e
                ? "rounded bg-[var(--rd-vermillion)] px-2 py-1 text-white"
                : "rounded bg-[var(--rd-ink-2)] px-2 py-1 text-[var(--rd-pencil)]"
            }
          >
            {e}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        rows={6}
        placeholder="Overall review body (optional)"
        className="w-full rounded border-0 bg-[var(--rd-ink-2)] p-2 font-mono text-[12px] text-[var(--rd-cream)]"
      />
      <ul className="mt-3 space-y-1 font-mono text-[11px] text-[var(--rd-pencil)]">
        <li>{reviewInlineDrafts.length} review inline comments</li>
        <li>{threadReplyDrafts.length} thread replies</li>
        {privateNoteCount > 0 ? (
          <li className="text-[var(--rd-cream-2)]">
            {privateNoteCount} private notes will NOT be published
          </li>
        ) : null}
      </ul>
      {!headSha ? (
        <div className="mt-3 font-mono text-[11px] text-[var(--rd-del)]">
          PR head SHA is unknown — refresh the session before publishing.
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 whitespace-pre-wrap font-mono text-[11px] text-[var(--rd-del)]">
          {error}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          onClick={() => {
            void onSubmit();
          }}
          disabled={publishDisabled}
        >
          {submitting ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
