import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { compactPath } from "@/lib/format";
import type {
  PullRequestContext,
  ReviewThread,
} from "@/types/github";
import type {
  ReviewFile,
  ReviewSession,
  SessionFileState,
} from "@/types/review";

type InspectorProps = {
  session: ReviewSession;
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  jumpTarget: {
    fileId: string;
    diffPosition?: number;
    expandSection?: "private";
    requestedAt: number;
  } | null;
  onScrollHandled: () => void;
  onPatchFileState: (fileId: string, patch: Partial<SessionFileState>) => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  prContext?: PullRequestContext | null;
  onJumpToThread?: (target: { path: string; line: number }) => void;
  onOpenAllThreads?: () => void;
};

export function Inspector(props: InspectorProps) {
  const {
    session,
    file,
    fileState,
    onPatchFileState,
    onMarkViewed,
    onMarkReviewed,
    jumpTarget,
    onScrollHandled,
    prContext,
    onJumpToThread,
    onOpenAllThreads,
  } = props;
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const supportsReviewComments = session.target.kind === "pullRequest";

  const fileThreads = useMemo<ReviewThread[]>(() => {
    if (!file || !prContext) return [];
    return prContext.reviewThreads.filter((t) => t.path === file.path);
  }, [prContext, file]);

  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
                  filePath={file.path}
                  onJump={onJumpToThread}
                  onOpenAll={onOpenAllThreads}
                />
              ) : null}
              <AgentContextSection file={file} session={session} />
              <PrivateNoteSection
                file={file}
                fileState={fileState}
                onPatch={onPatchFileState}
                onMarkViewed={onMarkViewed}
                onMarkReviewed={onMarkReviewed}
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

function SectionHelper({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] leading-snug text-[var(--rd-graphite)]">
      {children}
    </p>
  );
}

function ThreadsOnThisFile({
  threads,
  filePath,
  onJump,
  onOpenAll,
}: {
  threads: ReviewThread[];
  filePath: string;
  onJump?: (target: { path: string; line: number }) => void;
  onOpenAll?: () => void;
}) {
  const headingId = useId();
  const visible = threads.filter((t) => !t.isOutdated);
  if (visible.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby={headingId}
      data-section="threads"
      className="border-b border-[var(--rd-hair)] px-4 py-4"
    >
      <SectionHeader
        label={`Threads on this file · ${visible.length}`}
        headingId={headingId}
        trailing={
          onOpenAll ? (
            <button
              type="button"
              onClick={onOpenAll}
              className="font-mono text-[10px] text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]"
            >
              all PR threads →
            </button>
          ) : null
        }
      />
      <ul className="space-y-1">
        {visible.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() =>
                onJump?.({
                  path: filePath,
                  line: t.line ?? t.originalLine ?? 0,
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
                L{t.line ?? t.originalLine ?? "?"}
              </span>
              <span className="min-w-0 flex-1 line-clamp-2 text-[11.5px] text-[var(--rd-cream)]">
                {t.comments[0]?.body ?? ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
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

function PrivateNoteSection({
  file,
  fileState,
  onPatch,
  onMarkViewed,
  onMarkReviewed,
}: {
  file: ReviewFile;
  fileState: SessionFileState | null;
  onPatch: (fileId: string, patch: Partial<SessionFileState>) => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
}) {
  const headingId = useId();
  const status = fileState?.status ?? "unseen";
  return (
    <section aria-labelledby={headingId} data-section="notes" className="flex flex-col gap-3 px-4 py-4">
      <SectionHeader
        label="Private note · this file"
        headingId={headingId}
        trailing={
          <span className="font-mono text-[10px] text-[var(--rd-pencil)]">never published</span>
        }
      />
      <SectionHelper>
        <NotebookPen aria-hidden className="mr-1 -mt-0.5 inline-block size-3 text-[var(--rd-graphite)]" />
        Keep notes for yourself while you read. Stays local.
      </SectionHelper>
      <BufferedAutoGrowTextarea
        key={`${file.id}-private`}
        value={fileState?.privateNote ?? ""}
        onCommit={(next) => onPatch(file.id, { privateNote: next })}
        ariaLabel="Private notes"
        placeholder="Start typing…"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onMarkViewed}
          className={[
            "rounded px-3 py-1 font-mono text-[11px]",
            status === "viewed" || status === "reviewed"
              ? "bg-[var(--rd-ink-3)] text-[var(--rd-cream-2)]"
              : "bg-[var(--rd-ink-2)] text-[var(--rd-cream-2)] hover:text-[var(--rd-cream)]",
          ].join(" ")}
        >
          Mark viewed
        </button>
        <Button
          type="button"
          size="xs"
          onClick={onMarkReviewed}
          className={
            status === "reviewed"
              ? "bg-[var(--rd-vermillion)] text-white hover:bg-[var(--rd-vermillion)]"
              : ""
          }
        >
          {status === "reviewed" ? "Reviewed ✓" : "Mark reviewed"}
        </Button>
      </div>
    </section>
  );
}

function BufferedAutoGrowTextarea({
  value,
  onCommit,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const valueRef = useRef(draft);
  const committedRef = useRef(value);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    setDraft(value);
    valueRef.current = value;
    committedRef.current = value;
  }, [value]);

  const commit = useCallback(() => {
    const next = valueRef.current;
    if (next === committedRef.current) return;
    committedRef.current = next;
    onCommitRef.current(next);
  }, []);

  useEffect(() => {
    valueRef.current = draft;
    const timer = window.setTimeout(commit, 250);
    return () => window.clearTimeout(timer);
  }, [commit, draft]);

  useEffect(() => () => commit(), [commit]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={3}
      className="block w-full min-h-[80px] max-h-[320px] resize-none overflow-auto rounded-md border-0 bg-[var(--rd-ink-2)] px-3 py-2 text-[13px] leading-5 text-[var(--rd-cream)] outline-none placeholder:text-[var(--rd-graphite)] focus-visible:outline-2 focus-visible:outline-[var(--rd-vermillion-line)] focus-visible:outline-offset-[-2px]"
    />
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
