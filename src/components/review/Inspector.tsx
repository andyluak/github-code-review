import { useEffect, useId, useMemo, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SlabButton } from "@/components/ui/slab-button";
import { compactPath } from "@/lib/format";
import { threadJumpLine, threadLineLabel } from "@/lib/github-labels";
import type {
  PullRequestContext,
  ReviewThread,
} from "@/types/github";
import type {
  InlineComment,
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  SessionFileState,
} from "@/types/review";

type InspectorProps = {
  session: ReviewSession;
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  workspaceState: ReviewWorkspaceState;
  jumpTarget: {
    fileId: string;
    diffPosition?: number;
    expandSection?: "private";
    requestedAt: number;
  } | null;
  onScrollHandled: () => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onSelectFile?: (fileId: string) => void;
  onJumpToInline?: (fileId: string, diffPosition: number) => void;
  onDeleteInline?: (fileId: string, commentId: string) => void;
  prContext?: PullRequestContext | null;
  onJumpToThread?: (target: { path: string; line: number }) => void;
};

export function Inspector(props: InspectorProps) {
  const {
    session,
    file,
    fileState,
    workspaceState,
    onMarkViewed,
    onMarkReviewed,
    onSelectFile,
    onJumpToInline,
    onDeleteInline,
    jumpTarget,
    onScrollHandled,
    prContext,
    onJumpToThread,
  } = props;
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const [showAllThreads, setShowAllThreads] = useState(false);
  const supportsReviewComments = session.target.kind === "pullRequest";

  const fileThreads = useMemo<ReviewThread[]>(() => {
    if (!file || !prContext) return [];
    return prContext.reviewThreads.filter((t) => t.path === file.path);
  }, [prContext, file]);
  const allThreads = prContext?.reviewThreads ?? [];

  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [file?.id]);

  useEffect(() => {
    setShowAllThreads(false);
  }, [file?.id]);

  useEffect(() => {
    if (jumpTarget?.expandSection !== "private" || !file || jumpTarget.fileId !== file.id) {
      return;
    }
    const target = scrollViewportRef.current?.querySelector<HTMLElement>('[data-section="notes"]');
    if (!target) {
      onScrollHandled();
      return;
    }
    target.scrollIntoView({ block: "start", behavior: "auto" });
    onScrollHandled();
  }, [file, jumpTarget, onScrollHandled]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <ScrollArea className="min-h-0 flex-1" viewportRef={scrollViewportRef}>
        <div className="flex flex-col">
          {file ? (
            <>
              {supportsReviewComments ? (
                <ThreadsOnThisFile
                  threads={fileThreads}
                  allThreads={allThreads}
                  showAll={showAllThreads}
                  filePath={file.path}
                  onShowAllChange={setShowAllThreads}
                  onJump={onJumpToThread}
                />
              ) : null}
              <AgentContextSection file={file} session={session} />
              <PrivateNotesPanel
                session={session}
                workspaceState={workspaceState}
                currentFile={file}
                currentFileState={fileState}
                onMarkViewed={onMarkViewed}
                onMarkReviewed={onMarkReviewed}
                onSelectFile={onSelectFile}
                onJumpToInline={onJumpToInline}
                onDeleteInline={onDeleteInline}
              />
              <SessionWarnings session={session} />
            </>
          ) : (
            <EmptyFilePrompt />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function SectionHeader({
  label,
  count,
  headingId,
  trailing,
}: {
  label: string;
  count?: number | string;
  headingId: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2
        id={headingId}
        className="rd-display-italic text-[14px] leading-none text-[var(--rd-cream)]"
      >
        {label}
      </h2>
      <div className="flex items-baseline gap-2">
        {count !== undefined ? (
          <span className="font-mono text-[10px] tabular-nums text-[var(--rd-pencil)]">
            {count}
          </span>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}

function ThreadsOnThisFile({
  threads,
  allThreads,
  showAll,
  filePath,
  onJump,
  onShowAllChange,
}: {
  threads: ReviewThread[];
  allThreads: ReviewThread[];
  showAll: boolean;
  filePath: string;
  onJump?: (target: { path: string; line: number }) => void;
  onShowAllChange: (showAll: boolean) => void;
}) {
  const headingId = useId();
  const visibleFileThreads = threads.filter((t) => !t.isOutdated);
  const visiblePrThreads = allThreads.filter((t) => !t.isOutdated);
  const visible = showAll ? visiblePrThreads : visibleFileThreads;
  if (visibleFileThreads.length === 0 && visiblePrThreads.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby={headingId}
      data-section="threads"
      className="border-b border-[var(--rd-hair)] px-4 py-4"
    >
      <SectionHeader
        label={
          showAll
            ? `All PR threads · ${visiblePrThreads.length}`
            : `Threads on this file · ${visibleFileThreads.length}`
        }
        headingId={headingId}
        trailing={
          visiblePrThreads.length > 0 ? (
            <button
              type="button"
              onClick={() => onShowAllChange(!showAll)}
              className="font-mono text-[10px] text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]"
            >
              {showAll ? "this file →" : "all PR threads →"}
            </button>
          ) : null
        }
      />
      {visible.length > 0 ? (
        <ul className="space-y-1">
          {visible.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() =>
                  onJump?.({
                    path: t.path || filePath,
                    line: threadJumpLine(t),
                  })
                }
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--rd-ink-2)]"
              >
                <span
                  className={
                    t.isResolved
                      ? "mt-1 size-1.5 rounded-full bg-[var(--rd-pencil)]"
                      : "mt-1 size-1.5 rounded-full bg-[var(--rd-vermillion-2)]"
                  }
                />
                <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
                  {threadLineLabel(t)}
                </span>
                {showAll ? (
                  <span className="min-w-0 max-w-24 truncate font-mono text-[10px] text-[var(--rd-graphite)]">
                    {t.path}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 line-clamp-2 text-[11.5px] text-[var(--rd-cream)]">
                  {t.comments[0]?.body ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded bg-[var(--rd-ink-2)] px-3 py-2 text-[11px] text-[var(--rd-pencil)]">
          No threads on this file.
        </div>
      )}
    </section>
  );
}

function AgentContextSection({
  session,
  file,
}: {
  session: ReviewSession;
  file: ReviewFile;
}) {
  const headingId = useId();
  const hasAgentInput =
    session.order.source === "agent" ||
    Boolean(file.reviewReason) ||
    file.agentNotes.length > 0;
  if (!hasAgentInput) return null;
  return (
    <section
      aria-labelledby={headingId}
      data-section="context"
      className="border-b border-[var(--rd-hair)] px-4 py-4"
    >
      <SectionHeader label="Agent context" headingId={headingId} />
      <div className="space-y-2.5">
        {file.reviewReason ? (
          <blockquote className="border-l-[3px] border-[var(--rd-vermillion-line)] pl-3 rd-display-italic text-[12.5px] leading-snug text-[var(--rd-cream-2)]">
            {file.reviewReason}
          </blockquote>
        ) : null}
        {file.agentNotes.length > 0 ? (
          <div className="space-y-1.5">
            {file.agentNotes.map((note, index) => (
              <div
                key={`${file.id}-agent-note-${index}`}
                className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-2.5"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                  {note.source ?? "agent note"}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[var(--rd-cream-2)]">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function privateInlineComments(state: SessionFileState | null | undefined): InlineComment[] {
  return (state?.inlineComments ?? []).filter((c) => c.visibility === "private");
}

function fileHasAnyPrivate(state: SessionFileState | null | undefined): boolean {
  return privateInlineComments(state).length > 0;
}

function PrivateNotesPanel({
  session,
  workspaceState,
  currentFile,
  currentFileState,
  onMarkViewed,
  onMarkReviewed,
  onSelectFile,
  onJumpToInline,
  onDeleteInline,
}: {
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  currentFile: ReviewFile;
  currentFileState: SessionFileState | null;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onSelectFile?: (fileId: string) => void;
  onJumpToInline?: (fileId: string, diffPosition: number) => void;
  onDeleteInline?: (fileId: string, commentId: string) => void;
}) {
  const headingId = useId();
  const currentRef = useRef<HTMLDivElement | null>(null);

  const otherFiles = useMemo(() => {
    const result: ReviewFile[] = [];
    for (const file of session.files) {
      if (file.id === currentFile.id) continue;
      if (fileHasAnyPrivate(workspaceState[file.id])) result.push(file);
    }
    return result;
  }, [session.files, workspaceState, currentFile.id]);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [currentFile.id]);

  const currentHasAny = fileHasAnyPrivate(currentFileState);
  const totalCount = otherFiles.length + (currentHasAny ? 1 : 0);

  return (
    <section aria-labelledby={headingId} data-section="notes" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <h2 id={headingId} className="rd-display-italic text-[14px] leading-none text-[var(--rd-cream)]">
          Private notes
        </h2>
        <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
          {totalCount === 0 ? "never published" : `${totalCount} ${totalCount === 1 ? "file" : "files"} · never published`}
        </span>
      </div>
      <p className="mb-3 px-4 text-[11px] leading-snug text-[var(--rd-graphite)]">
        <NotebookPen aria-hidden className="mr-1 -mt-0.5 inline-block size-3 text-[var(--rd-graphite)]" />
        Private inline notes you've left while reading. Stays local to your machine.
      </p>

      <div ref={currentRef}>
        <FileNoteCard
          file={currentFile}
          fileState={currentFileState}
          isCurrent
          onMarkViewed={onMarkViewed}
          onMarkReviewed={onMarkReviewed}
          onJumpToInline={onJumpToInline}
          onDeleteInline={onDeleteInline}
        />
      </div>

      {otherFiles.length > 0 ? (
        <>
          <div className="mt-2 border-t border-[var(--rd-hair)] px-4 pt-3 pb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
            Notes on other files · {otherFiles.length}
          </div>
          <ul>
            {otherFiles.map((file) => (
              <li key={file.id}>
                <FileNoteCard
                  file={file}
                  fileState={workspaceState[file.id] ?? null}
                  isCurrent={false}
                  onSelect={onSelectFile ? () => onSelectFile(file.id) : undefined}
                  onJumpToInline={onJumpToInline}
                  onDeleteInline={onDeleteInline}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function FileNoteCard({
  file,
  fileState,
  isCurrent,
  onMarkViewed,
  onMarkReviewed,
  onSelect,
  onJumpToInline,
  onDeleteInline,
}: {
  file: ReviewFile;
  fileState: SessionFileState | null;
  isCurrent: boolean;
  onMarkViewed?: () => void;
  onMarkReviewed?: () => void;
  onSelect?: () => void;
  onJumpToInline?: (fileId: string, diffPosition: number) => void;
  onDeleteInline?: (fileId: string, commentId: string) => void;
}) {
  const status = fileState?.status ?? "unseen";
  const inlineNotes = privateInlineComments(fileState);
  return (
    <article
      className={[
        "flex flex-col gap-2 px-4 py-3",
        isCurrent
          ? "border-l-[3px] border-[var(--rd-vermillion)] bg-[var(--rd-ink-2)]"
          : "border-l-[3px] border-transparent",
      ].join(" ")}
    >
      <header className="flex items-baseline justify-between gap-2">
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className="min-w-0 truncate text-left font-mono text-[11px] text-[var(--rd-cream)] hover:text-[var(--rd-vermillion-2)]"
            title={file.path}
          >
            {compactPath(file.path, 38)}
          </button>
        ) : (
          <span className="min-w-0 truncate font-mono text-[11px] text-[var(--rd-cream)]" title={file.path}>
            {compactPath(file.path, 38)}
          </span>
        )}
        {isCurrent ? (
          <span className="shrink-0 rounded-full bg-[var(--rd-vermillion-bg)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--rd-vermillion-2)]">
            current
          </span>
        ) : null}
      </header>

      {inlineNotes.length > 0 ? (
        <ul className="space-y-1">
          {inlineNotes.map((comment) => (
            <li key={comment.id}>
              <InlinePrivateRow
                comment={comment}
                onJump={onJumpToInline ? () => onJumpToInline(file.id, comment.endDiffPosition) : undefined}
                onDelete={onDeleteInline ? () => onDeleteInline(file.id, comment.id) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : isCurrent ? (
        <div className="rounded-sm bg-[var(--rd-ink-3)] px-2 py-2 rd-display-italic text-[11px] text-[var(--rd-pencil)]">
          No private notes on this file yet. Click a line in the diff to add one.
        </div>
      ) : null}

      {isCurrent && onMarkViewed && onMarkReviewed ? (
        <div className="flex items-stretch justify-between gap-0 pt-1 border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]">
          <SlabButton
            size="compact"
            variant={status === "viewed" || status === "reviewed" ? "active" : "default"}
            onClick={onMarkViewed}
            aria-label={status === "viewed" || status === "reviewed" ? "Mark unviewed" : "Mark viewed"}
          >
            mark viewed
          </SlabButton>
          <SlabButton
            size="compact"
            variant={status === "reviewed" ? "active" : "primary"}
            onClick={onMarkReviewed}
            aria-label={status === "reviewed" ? "Reviewed" : "Mark reviewed"}
          >
            {status === "reviewed" ? "reviewed ✓" : "mark reviewed"}
          </SlabButton>
        </div>
      ) : null}
    </article>
  );
}

function InlinePrivateRow({
  comment,
  onJump,
  onDelete,
}: {
  comment: InlineComment;
  onJump?: () => void;
  onDelete?: () => void;
}) {
  const lineLabel =
    comment.endLine !== null && comment.endLine !== undefined
      ? `L${comment.endLine}`
      : `pos ${comment.endDiffPosition}`;
  return (
    <div className="group grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-sm bg-[var(--rd-ink-3)] px-2 py-1.5 text-[11px]">
      <span className="shrink-0 rounded bg-[var(--rd-ink-2)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--rd-pencil)]">
        {lineLabel}
      </span>
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          className="min-w-0 text-left text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]"
        >
          <span className="line-clamp-2 leading-snug">{comment.body || "(empty)"}</span>
        </button>
      ) : (
        <span className="min-w-0 line-clamp-2 leading-snug text-[var(--rd-cream-2)]">
          {comment.body || "(empty)"}
        </span>
      )}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 rounded bg-[var(--rd-ink-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--rd-graphite)] hover:text-[var(--rd-del)]"
          title="Delete inline note"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

function EmptyFilePrompt() {
  return (
    <div className="m-4 rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-4 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
      Select a file from the rail to inspect.
    </div>
  );
}

function SessionWarnings({ session }: { session: ReviewSession }) {
  if (session.order.warnings.length === 0) return null;
  return (
    <div className="mx-4 my-4 rounded-md border-l-[3px] border-[var(--rd-del)] bg-[var(--rd-del-bg)] px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-del)]">
        Import warnings
      </div>
      <div className="mt-1.5 space-y-1">
        {session.order.warnings.slice(0, 5).map((warning, index) => (
          <div
            key={`${warning.path ?? "session"}-${index}`}
            className="text-[11px] leading-5 text-[var(--rd-cream-2)]"
          >
            {warning.path ? (
              <span className="font-mono">{compactPath(warning.path, 42)}: </span>
            ) : null}
            {warning.message}
          </div>
        ))}
      </div>
    </div>
  );
}
