import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fingerprintBody,
  fingerprintInline,
  fingerprintThreadReply,
} from "@/lib/fingerprint";
import {
  publishPullRequestReview,
  mergePullRequest,
  loadPullRequestContext,
  getRepoPrefs,
  setRepoPrefs,
} from "@/lib/github";
import { compactPath } from "@/lib/format";
import { MarkdownTextarea } from "@/lib/markdown-textarea";
import { MarkdownPreview } from "@/components/review/MarkdownView";
import type {
  PublishInlineComment,
  PublishReviewResponse,
  PublishThreadReply,
  PullRequestContext,
  PullRequestMergeReadiness,
} from "@/types/github";
import type {
  InlineComment,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

type Stage = "compose" | "in-flight" | "post-approval";

type Intent = "comment" | "approve";

type DropKey = string;

type Props = {
  open: boolean;
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  prContext: PullRequestContext | null;
  onClose: () => void;
  onPublished: (response: PublishReviewResponse) => void;
  onMerged?: () => void;
};

const FALLBACK_METHODS: Array<"MERGE" | "SQUASH" | "REBASE"> = ["SQUASH", "MERGE", "REBASE"];

export function PublishMergeSheet(props: Props) {
  const { open, session, workspaceState, prContext, onClose, onPublished, onMerged } = props;

  const isPr = session.target.kind === "pullRequest";
  const prNumber =
    session.target.kind === "pullRequest" ? session.target.number ?? null : null;
  const repoPath = session.repo.requestedPath;

  const [stage, setStage] = useState<Stage>("compose");
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState<Intent>("comment");
  const [dropped, setDropped] = useState<Set<DropKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<PullRequestMergeReadiness | null>(null);
  const [chosenMethod, setChosenMethod] = useState<"MERGE" | "SQUASH" | "REBASE" | null>(null);

  useEffect(() => {
    if (!open) return;
    setStage("compose");
    setBody("");
    setIntent("comment");
    setDropped(new Set());
    setError(null);
    setReadiness(null);
    setChosenMethod(null);
  }, [open]);

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
      for (const [threadId, replyBody] of Object.entries(fs?.threadReplies ?? {})) {
        if (replyBody.trim()) out.push({ threadId, body: replyBody });
      }
    }
    return out;
  }, [workspaceState]);

  const draftRows = useMemo(() => {
    const rows: DraftRow[] = [];
    for (const c of reviewInlineDrafts) {
      rows.push({
        kind: "inline",
        key: c.id,
        path: c.path,
        line: c.endLine ?? c.startLine ?? null,
        body: c.body,
      });
    }
    for (const r of threadReplyDrafts) {
      rows.push({
        kind: "reply",
        key: `reply-${r.threadId}`,
        path: descriptorForThread(prContext, r.threadId),
        line: null,
        body: r.body,
      });
    }
    return rows;
  }, [reviewInlineDrafts, threadReplyDrafts, prContext]);

  const privateNoteCount = useMemo(() => {
    let n = 0;
    for (const fs of Object.values(workspaceState)) {
      if (!fs) continue;
      if ((fs.privateNote?.trim().length ?? 0) > 0) n += 1;
    }
    return n;
  }, [workspaceState]);

  const activeDrafts = draftRows.filter((r) => !dropped.has(r.key));
  const droppedCount = draftRows.length - activeDrafts.length;

  if (!open || !isPr || prNumber === null) return null;

  const headSha = firstPresent(
    prContext?.merge.expectedHeadSha,
    prContext?.summary.headRefOid,
    session.target.kind === "pullRequest" ? session.target.headSha : null,
  );

  const canSubmit =
    stage === "compose" &&
    headSha !== null &&
    (intent === "approve" || activeDrafts.length > 0 || body.trim().length > 0);

  async function submit() {
    if (!headSha || prNumber === null) {
      setError("PR head SHA is missing — refresh and retry.");
      return;
    }
    setError(null);
    setStage("in-flight");

    const inlineComments: PublishInlineComment[] = reviewInlineDrafts
      .filter((c) => !dropped.has(c.id))
      .map((c) => ({
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
      }));

    const threadReplies: PublishThreadReply[] = threadReplyDrafts
      .filter((r) => !dropped.has(`reply-${r.threadId}`))
      .map((r) => ({
        fingerprint: fingerprintThreadReply(r.threadId, r.body, prNumber, headSha),
        threadId: r.threadId,
        body: r.body,
      }));

    const event = intent === "approve" ? "APPROVE" : "COMMENT";
    const bodyFingerprint = body.trim()
      ? fingerprintBody(body, prNumber, headSha, event)
      : null;

    try {
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

      if (intent !== "approve") {
        onClose();
        return;
      }

      const refreshed = await loadPullRequestContext({
        repoPath,
        number: prNumber,
        force: true,
      });
      setReadiness(refreshed.context.merge);
      setChosenMethod(pickInitialMethod(refreshed.context.merge, await tryLoadPreferredMethod(repoPath)));
      setStage("post-approval");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStage("compose");
    }
  }

  async function doMerge() {
    if (!readiness || prNumber === null || !chosenMethod) return;
    setError(null);
    setStage("in-flight");
    try {
      const prefs = await getRepoPrefs({ repoPath }).catch(() => null);
      const deleteBranch =
        (prefs?.prefs.deleteBranchDefault ?? false) && readiness.safeToDeleteBranch;
      await mergePullRequest({
        repoPath,
        number: prNumber,
        expectedHeadSha: readiness.expectedHeadSha,
        method: chosenMethod,
        deleteBranch,
      });
      await setRepoPrefs({ repoPath, preferredMergeMethod: chosenMethod }).catch(() => {});
      onMerged?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStage("post-approval");
    }
  }

  function toggleDrop(key: DropKey) {
    setDropped((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (stage === "post-approval" && readiness) {
    const blocked = readiness.mergeBlockers.length > 0 || !readiness.viewerCanMerge;
    return (
      <SheetShell title={`#${prNumber} · post-approval`} subtitle={`head ${headSha?.slice(0, 8)} re-validated`} onClose={onClose}>
        <Banner tone="approved">Approved · review posted</Banner>
        <Section label="Merge readiness · live">
          {blocked ? (
            <>
              <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--rd-del)]">
                <span className="size-1.5 rounded-full bg-[var(--rd-del)]" />
                Still blocked
              </h3>
              <ul className="rounded-md border border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] p-3 text-[11px] leading-5 text-[var(--rd-del)]">
                {readiness.mergeBlockers.length === 0 ? (
                  <li>You don't have merge permission on this repo.</li>
                ) : null}
                {readiness.mergeBlockers.map((b) => (
                  <li key={b}>⚠ {b}</li>
                ))}
              </ul>
              <MethodPills allowed={readiness.allowedMergeMethods} value={chosenMethod} onChange={setChosenMethod} disabled />
            </>
          ) : (
            <>
              <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#a4d4a8]">
                <span className="size-1.5 rounded-full bg-[#76c884]" />
                Ready to merge
              </h3>
              <MethodPills allowed={readiness.allowedMergeMethods} value={chosenMethod} onChange={setChosenMethod} />
              <div className="mt-3 font-mono text-[10px] text-[var(--rd-pencil)]">
                head <code className="text-[var(--rd-cream-2)]">{headSha?.slice(0, 8)}</code> · backend validates again on submit
              </div>
            </>
          )}
        </Section>
        {error ? <ErrorRow message={error} /> : null}
        <Footer
          left={blocked ? "Merge gated; approval is in" : "Closes PR · runs your repo's default post-merge hooks"}
          actions={
            <>
              <Button type="button" variant="ghost" size="xs" onClick={onClose}>
                Close
              </Button>
              {!blocked ? (
                <Button
                  type="button"
                  size="xs"
                  onClick={() => {
                    void doMerge();
                  }}
                  disabled={!chosenMethod}
                  className="bg-[#a4d4a8] text-[#0f1a11] hover:bg-[#b8e0bc]"
                >
                  {chosenMethod ? `${prettyMethod(chosenMethod)}-merge` : "Merge"}
                </Button>
              ) : null}
            </>
          }
        />
      </SheetShell>
    );
  }

  if (stage === "in-flight") {
    return (
      <SheetShell title={`Publish review · #${prNumber}`} subtitle="" onClose={() => {}}>
        <Banner tone="busy">
          {intent === "approve" ? "Posting approval · re-fetching readiness…" : "Posting review…"}
        </Banner>
        <Section label="Merge readiness">
          <div className="px-2 py-10 text-center font-mono text-[11px] text-[var(--rd-pencil)]">
            waiting for GitHub…
          </div>
        </Section>
        {error ? <ErrorRow message={error} /> : null}
        <Footer
          left="sheet stays open · ~1–3s on most PRs"
          actions={
            <Button type="button" variant="ghost" size="xs" disabled>
              Cancel (will not unpost)
            </Button>
          }
        />
      </SheetShell>
    );
  }

  return (
    <SheetShell title={`Publish review · #${prNumber}`} subtitle={`head ${headSha?.slice(0, 8) ?? "?"}`} onClose={onClose}>
      <Section label="Summary · markdown">
        <MarkdownTextarea value={body} onChange={setBody} placeholder="Add a summary…" rows={6} ariaLabel="Review body" />
      </Section>

      <Section label={`Drafts to publish · ${activeDrafts.length}${droppedCount > 0 ? ` (${droppedCount} dropped)` : ""}`}>
        {draftRows.length === 0 ? (
          <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-3 rd-display-italic text-[11px] text-[var(--rd-pencil)]">
            No inline drafts. You can still publish a body-only review.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)]">
            {draftRows.map((row) => {
              const isDropped = dropped.has(row.key);
              return (
                <div
                  key={row.key}
                  className={[
                    "grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-[var(--rd-hair)] px-3 py-2 last:border-b-0",
                    isDropped ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <span className="rounded bg-[var(--rd-ink-3)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--rd-cream-2)]">
                    {row.kind === "inline" && row.line !== null ? `L${row.line}` : row.kind.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[10px] text-[var(--rd-pencil)]">
                      {compactPath(row.path, 48)}
                    </div>
                    <MarkdownPreview className={isDropped ? "block line-clamp-2 text-[11px] text-[var(--rd-graphite)] line-through" : "block line-clamp-2 text-[11px] text-[var(--rd-cream)]"}>
                      {row.body}
                    </MarkdownPreview>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDrop(row.key)}
                    className="rounded bg-[var(--rd-ink-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]"
                    title={isDropped ? "Restore" : "Drop from this publish"}
                  >
                    {isDropped ? "↺" : "✕"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section label="Intent">
        <div className="grid grid-cols-2 gap-2">
          <IntentCard
            title="Comment"
            description="Leave thoughts. No approval signal. Sheet closes after posting."
            active={intent === "comment"}
            tone="neutral"
            onClick={() => setIntent("comment")}
          />
          <IntentCard
            title="Approve"
            description="Sign off. After posting, merge zone reveals below."
            active={intent === "approve"}
            tone="approve"
            onClick={() => setIntent("approve")}
          />
        </div>
      </Section>

      {error ? <ErrorRow message={error} /> : null}

      <Footer
        left={
          intent === "approve"
            ? "merge options appear after approval posts"
            : `${privateNoteCount} private notes stay local · not published`
        }
        actions={
          <>
            <Button type="button" variant="ghost" size="xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              onClick={() => {
                void submit();
              }}
              disabled={!canSubmit}
              className={
                intent === "approve"
                  ? "bg-[#a4d4a8] text-[#0f1a11] hover:bg-[#b8e0bc]"
                  : ""
              }
            >
              {intent === "approve" ? "Approve" : "Publish review"}
            </Button>
          </>
        }
      />
    </SheetShell>
  );
}

function SheetShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute right-0 top-12 bottom-0 z-30 flex w-[520px] flex-col border-l border-[var(--rd-hair)] bg-[var(--rd-ink)] text-[12px] text-[var(--rd-cream)]">
      <header className="flex items-center justify-between border-b border-[var(--rd-hair)] px-4 py-3">
        <div>
          <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 font-mono text-[10px] text-[var(--rd-pencil)]">{subtitle}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 font-mono text-[11px] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
        >
          ✕
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--rd-hair)] px-4 py-3">
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
        {label}
      </div>
      {children}
    </section>
  );
}

function Footer({
  left,
  actions,
}: {
  left: string;
  actions: React.ReactNode;
}) {
  return (
    <footer className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-4 py-3 font-mono text-[10px] text-[var(--rd-pencil)]">
      <span>{left}</span>
      <div className="flex gap-2">{actions}</div>
    </footer>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "approved" | "busy";
  children: React.ReactNode;
}) {
  const cls =
    tone === "approved"
      ? "border-[#234c2b] bg-[#152017] text-[#a4d4a8]"
      : "border-[#553d18] bg-[#211a10] text-[#f1c98a]";
  return (
    <div
      className={`flex items-center gap-2 border-b px-4 py-2 font-mono text-[11px] ${cls}`}
    >
      <span
        className={`size-2 rounded-full ${tone === "approved" ? "bg-[#76c884]" : "bg-[#f1c98a] animate-pulse"}`}
      />
      {children}
    </div>
  );
}

function IntentCard({
  title,
  description,
  active,
  tone,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  tone: "neutral" | "approve";
  onClick: () => void;
}) {
  const activeCls =
    tone === "approve"
      ? "border-[#76c884] bg-[#152017] shadow-[inset_0_0_0_1px_#76c884]"
      : "border-[var(--rd-cream-2)] bg-[var(--rd-ink-3)] shadow-[inset_0_0_0_1px_var(--rd-cream-2)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md border bg-[var(--rd-ink-2)] p-2.5 text-left",
        active ? activeCls : "border-[var(--rd-hair)] hover:bg-[var(--rd-ink-3)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--rd-cream)]">
        {active ? <span className={tone === "approve" ? "text-[#76c884]" : "text-[var(--rd-cream-2)]"}>✓</span> : null}
        <span>{title}</span>
      </div>
      <div className="mt-1 text-[10.5px] leading-snug text-[var(--rd-pencil)]">{description}</div>
    </button>
  );
}

function MethodPills({
  allowed,
  value,
  onChange,
  disabled,
}: {
  allowed: string[];
  value: "MERGE" | "SQUASH" | "REBASE" | null;
  onChange: (next: "MERGE" | "SQUASH" | "REBASE") => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {allowed.map((m) => (
        <button
          key={m}
          type="button"
          disabled={disabled}
          onClick={() => onChange(m as "MERGE" | "SQUASH" | "REBASE")}
          className={[
            "rounded px-3 py-1 font-mono text-[11px]",
            value === m
              ? "bg-[var(--rd-vermillion)] text-white"
              : "bg-[var(--rd-ink-2)] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]",
            disabled ? "opacity-40" : "",
          ].join(" ")}
        >
          {prettyMethod(m as "MERGE" | "SQUASH" | "REBASE")}
        </button>
      ))}
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="border-b border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] px-4 py-2 font-mono text-[11px] text-[var(--rd-del)]">
      {message}
    </div>
  );
}

type DraftRow = {
  kind: "inline" | "reply";
  key: string;
  path: string;
  line: number | null;
  body: string;
};

function firstPresent(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function descriptorForThread(prContext: PullRequestContext | null, threadId: string): string {
  if (!prContext) return `thread ${threadId.slice(0, 8)}`;
  const thread = prContext.reviewThreads.find((t) => t.id === threadId);
  if (!thread) return `thread ${threadId.slice(0, 8)}`;
  const author = thread.comments[0]?.author ?? "thread";
  return `thread on ${thread.path} · replies to ${author}`;
}

function pickInitialMethod(
  readiness: PullRequestMergeReadiness,
  preferred: "MERGE" | "SQUASH" | "REBASE" | null,
): "MERGE" | "SQUASH" | "REBASE" {
  const allowed = readiness.allowedMergeMethods as Array<"MERGE" | "SQUASH" | "REBASE">;
  if (preferred && allowed.includes(preferred)) return preferred;
  if (readiness.defaultMergeMethod && allowed.includes(readiness.defaultMergeMethod)) {
    return readiness.defaultMergeMethod;
  }
  for (const candidate of FALLBACK_METHODS) {
    if (allowed.includes(candidate)) return candidate;
  }
  return allowed[0] as "MERGE" | "SQUASH" | "REBASE" ?? "SQUASH";
}

async function tryLoadPreferredMethod(repoPath: string): Promise<"MERGE" | "SQUASH" | "REBASE" | null> {
  try {
    const result = await getRepoPrefs({ repoPath });
    const value = result.prefs.preferredMergeMethod;
    if (value === "MERGE" || value === "SQUASH" || value === "REBASE") return value;
    return null;
  } catch {
    return null;
  }
}

function prettyMethod(m: "MERGE" | "SQUASH" | "REBASE"): string {
  if (m === "MERGE") return "Merge";
  if (m === "SQUASH") return "Squash";
  return "Rebase";
}
