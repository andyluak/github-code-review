import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { Bot, Download, MessageSquare, NotebookPen, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { compactPath } from "@/lib/format";
import { saveTextFile } from "@/lib/review-session";
import {
  collectLedger,
  countByKind,
  filterLedger,
  groupLedgerByFile,
  lineRangeLabel as ledgerLineRangeLabel,
  type LedgerEntry,
  type LedgerFilter,
} from "@/lib/ledger";
import { MarkdownPreview } from "@/components/review/MarkdownView";
import {
  InspectorTabs,
  type InspectorTab,
} from "@/components/review/InspectorTabs";
import { ConversationsList } from "@/components/review/ConversationsList";
import { ActivityList } from "@/components/review/ActivityList";
import type { PullRequestContext } from "@/types/github";
import type {
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
    expandSection?: "private" | "draft";
    requestedAt: number;
  } | null;
  onScrollHandled: () => void;
  onJumpToNote: (target: {
    fileId: string;
    diffPosition?: number;
    expandSection?: "private" | "draft";
  }) => void;
  onPatchFileState: (fileId: string, patch: Partial<SessionFileState>) => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onPublishReview?: () => void;
  prContext?: PullRequestContext | null;
  prContextError?: string | null;
  onJumpToThread?: (target: { path: string; line: number }) => void;
};

export function Inspector(props: InspectorProps) {
  const {
    session,
    workspaceState,
    file,
    fileState,
    onPatchFileState,
    onJumpToNote,
    jumpTarget,
    onScrollHandled,
  } = props;
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const supportsReviewComments = session.target.kind === "pullRequest";
  const [tab, setTab] = useState<InspectorTab>("notes");
  const prContext = props.prContext ?? null;

  const ledger = useMemo(
    () => collectLedger(session, workspaceState),
    [session, workspaceState],
  );
  const basket = useMemo(
    () =>
      ledger.filter(
        (entry) =>
          entry.kind === "public-file-draft" || entry.kind === "review-inline",
      ),
    [ledger],
  );

  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [file?.id]);

  useEffect(() => {
    if (!jumpTarget?.expandSection || !file || jumpTarget.fileId !== file.id) {
      return;
    }

    const selector =
      jumpTarget.expandSection === "private"
        ? '[data-section="notes"]'
        : '[data-section="reply"]';
    const target = scrollViewportRef.current?.querySelector<HTMLElement>(selector);
    if (!target) {
      onScrollHandled();
      return;
    }

    target.scrollIntoView({ block: "start", behavior: "auto" });
    onScrollHandled();
  }, [file, jumpTarget, onScrollHandled]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      {supportsReviewComments ? (
        <InspectorTabs
          tab={tab}
          show={{ conversations: true, activity: true }}
          onChange={setTab}
        />
      ) : null}
      {tab === "notes" || !supportsReviewComments ? (
        <ScrollArea className="min-h-0 flex-1" viewportRef={scrollViewportRef}>
          <div className="px-4 pb-6 pt-5">
            {file ? (
              <>
                <NotesSection
                  file={file}
                  fileState={fileState}
                  onPatch={onPatchFileState}
                />
                {supportsReviewComments ? (
                  <>
                    <SectionDivider />
                    <ReplySection
                      file={file}
                      fileState={fileState}
                      onPatch={onPatchFileState}
                    />
                  </>
                ) : null}
                <SectionDivider />
                <ContextSection session={session} file={file} />
                <SectionDivider />
                <LedgerSection
                  session={session}
                  ledger={ledger}
                  currentFileId={file.id}
                  supportsReviewComments={supportsReviewComments}
                  onJumpToNote={onJumpToNote}
                />
                <SessionWarnings session={session} />
              </>
            ) : (
              <EmptyFilePrompt />
            )}
          </div>
        </ScrollArea>
      ) : tab === "conversations" ? (
        <ConversationsList
          prContext={prContext}
          error={props.prContextError}
          onJump={(target) => props.onJumpToThread?.(target)}
        />
      ) : (
        <ActivityList prContext={prContext} error={props.prContextError} />
      )}

      {supportsReviewComments ? (
        <BasketFooter basket={basket} onPublishReview={props.onPublishReview} />
      ) : null}
    </aside>
  );
}

/* ─── Section atoms ──────────────────────────────────────────────── */

function SectionHeader({
  label,
  count,
  headingId,
}: {
  label: string;
  count?: number | string;
  headingId: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2
        id={headingId}
        className="rd-display-italic text-[15px] leading-none text-[var(--rd-cream)]"
      >
        {label}
      </h2>
      {count !== undefined ? (
        <span className="font-mono text-[10px] tabular-nums text-[var(--rd-pencil)]">
          {count}
        </span>
      ) : null}
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

function SectionDivider() {
  return <div className="my-5 h-px bg-[var(--rd-hair)]" aria-hidden />;
}

/* ─── Notes ───────────────────────────────────────────────────────── */

function NotesSection({
  file,
  fileState,
  onPatch,
}: {
  file: ReviewFile;
  fileState: SessionFileState | null;
  onPatch: (fileId: string, patch: Partial<SessionFileState>) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-section="notes">
      <SectionHeader
        label="Notes"
        headingId={headingId}
      />
      <SectionHelper>
        <NotebookPen
          aria-hidden
          className="mr-1 -mt-0.5 inline-block size-3 text-[var(--rd-graphite)]"
        />
        Visible only to you. Never published.
      </SectionHelper>
      <BufferedAutoGrowTextarea
        key={`${file.id}-private`}
        value={fileState?.privateNote ?? ""}
        onCommit={(next) => onPatch(file.id, { privateNote: next })}
        ariaLabel="Private notes"
        placeholder="Start typing…"
      />
    </section>
  );
}

/* ─── Reply ───────────────────────────────────────────────────────── */

function ReplySection({
  file,
  fileState,
  onPatch,
}: {
  file: ReviewFile;
  fileState: SessionFileState | null;
  onPatch: (fileId: string, patch: Partial<SessionFileState>) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-section="reply">
      <SectionHeader label="Reply" headingId={headingId} />
      <SectionHelper>
        <MessageSquare
          aria-hidden
          className="mr-1 -mt-0.5 inline-block size-3 text-[var(--rd-vermillion-2)]"
        />
        Drafted here, sent when you publish the basket.
      </SectionHelper>
      <BufferedAutoGrowTextarea
        key={`${file.id}-draft`}
        value={fileState?.publishableDraft ?? ""}
        onCommit={(next) => onPatch(file.id, { publishableDraft: next })}
        ariaLabel="Public reply draft"
        placeholder="Start typing…"
      />
    </section>
  );
}

/* ─── Context ─────────────────────────────────────────────────────── */

function ContextSection({
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

  return (
    <section aria-labelledby={headingId} data-section="context">
      <SectionHeader label="Context" headingId={headingId} />
      {hasAgentInput ? (
        <AgentContext file={file} />
      ) : (
        <div className="flex items-start gap-2 text-[12px] leading-5 text-[var(--rd-graphite)]">
          <Bot className="mt-0.5 size-3.5 shrink-0 text-[var(--rd-vermillion-2)]" />
          <span>Import an agent manifest to see review rationale here.</span>
        </div>
      )}
    </section>
  );
}

function AgentContext({ file }: { file: ReviewFile }) {
  return (
    <div className="space-y-2.5">
      {file.reviewReason ? (
        <blockquote className="border-l-[3px] border-[var(--rd-vermillion-line)] pl-3 rd-display-italic text-[13px] leading-snug text-[var(--rd-cream-2)]">
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
  );
}

/* ─── Ledger ──────────────────────────────────────────────────────── */

function LedgerSection({
  session,
  ledger,
  currentFileId,
  supportsReviewComments,
  onJumpToNote,
}: {
  session: ReviewSession;
  ledger: LedgerEntry[];
  currentFileId: string;
  supportsReviewComments: boolean;
  onJumpToNote: InspectorProps["onJumpToNote"];
}) {
  const headingId = useId();
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [scope, setScope] = useState<"file" | "all">("file");
  const [exportStatus, setExportStatus] = useState<
    "idle" | "exported" | "empty" | "failed"
  >("idle");

  const counts = useMemo(() => countByKind(ledger), [ledger]);
  const privateEntries = useMemo(() => filterLedger(ledger, "private"), [ledger]);
  const scoped = useMemo(
    () => (scope === "file" ? ledger.filter((entry) => entry.fileId === currentFileId) : ledger),
    [ledger, scope, currentFileId],
  );
  const effectiveFilter = supportsReviewComments || filter !== "review" ? filter : "all";
  const filtered = useMemo(() => filterLedger(scoped, effectiveFilter), [effectiveFilter, scoped]);
  const groups = useMemo(
    () => groupLedgerByFile(session, filtered),
    [filtered, session],
  );

  useEffect(() => {
    if (exportStatus === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setExportStatus("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [exportStatus]);

  async function exportPrivateNotes() {
    const markdown = buildPrivateNotesExport(session, privateEntries);
    if (!markdown) {
      setExportStatus("empty");
      return;
    }

    try {
      const path = await saveFileDialog({
        title: "Export private notes",
        defaultPath: privateNotesFilename(session),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!path) {
        return;
      }
      await saveTextFile({ path, contents: markdown });
      setExportStatus("exported");
    } catch {
      setExportStatus("failed");
    }
  }

  return (
    <section aria-labelledby={headingId} data-section="ledger">
      <SectionHeader
        label="Ledger"
        headingId={headingId}
        count={filtered.length}
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <div
          role="radiogroup"
          aria-label="Ledger scope"
          className="flex items-center gap-1.5"
        >
          <FilterChip
            label="This file"
            active={scope === "file"}
            onClick={() => setScope("file")}
          />
          <FilterChip
            label={`All ${counts.total}`}
            active={scope === "all"}
            onClick={() => setScope("all")}
          />
        </div>
        <span className="mx-1 h-3 w-px bg-[var(--rd-hair-2)]" aria-hidden />
        <div
          role="radiogroup"
          aria-label="Filter ledger by kind"
          className="flex items-center gap-1.5"
        >
          <FilterChip
            label="All"
            active={effectiveFilter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label="Private"
            active={effectiveFilter === "private"}
            onClick={() => setFilter("private")}
          />
          {supportsReviewComments ? (
            <FilterChip
              label="Review"
              active={filter === "review"}
              onClick={() => setFilter("review")}
            />
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto h-6 rounded px-2 font-mono text-[10px] uppercase tracking-wider text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-2)] hover:text-[var(--rd-cream)]"
          disabled={privateEntries.length === 0}
          onClick={exportPrivateNotes}
          aria-label="Export private notes as markdown"
        >
          <Download className="size-3" />
          Private .md
        </Button>
      </div>
      {exportStatus !== "idle" ? (
        <div className="mb-2 font-mono text-[10px] text-[var(--rd-pencil)]" aria-live="polite">
          {exportStatus === "exported"
            ? "Private notes exported."
            : exportStatus === "failed"
              ? "Private notes export failed."
              : "No private notes yet."}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-3 rd-display-italic text-[12px] text-[var(--rd-graphite)]">
          {scope === "file"
            ? "No notes on this file yet."
            : supportsReviewComments
              ? "No notes yet. Comment on a line or draft a review to populate the ledger."
              : "No notes yet. Comment on a line or add a private file note to populate the ledger."}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.file.id}>
              <div className="flex items-baseline justify-between border-b border-[var(--rd-hair)] pb-1">
                <span className="truncate font-mono text-[11px] text-[var(--rd-cream)]">
                  {compactPath(group.file.path, 38)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--rd-pencil)]">
                  {group.entries.length}
                </span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {group.entries.map((entry) => (
                  <LedgerCard
                    key={entry.id}
                    entry={entry}
                    onJump={() => onJumpToNote(jumpTargetForEntry(entry))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function jumpTargetForEntry(entry: LedgerEntry) {
  if (entry.kind === "private-file-note") {
    return { fileId: entry.fileId, expandSection: "private" as const };
  }
  if (entry.kind === "public-file-draft") {
    return { fileId: entry.fileId, expandSection: "draft" as const };
  }
  return { fileId: entry.fileId, diffPosition: entry.diffPosition };
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
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        "h-6 rounded-full px-2.5 font-mono text-[10px] uppercase tracking-wider",
        "focus-visible:outline-2 focus-visible:outline-[var(--rd-vermillion-line)] focus-visible:outline-offset-1",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function LedgerCard({
  entry,
  onJump,
}: {
  entry: LedgerEntry;
  onJump: () => void;
}) {
  const isPrivate =
    entry.kind === "private-file-note" || entry.kind === "private-inline";
  const Icon = isPrivate ? NotebookPen : MessageSquare;
  const iconClass = isPrivate
    ? "text-[var(--rd-graphite)]"
    : "text-[var(--rd-vermillion-2)]";

  return (
    <button
      type="button"
      onClick={onJump}
      className="block w-full rounded-sm px-2.5 py-2 text-left hover:bg-[var(--rd-ink-2)]"
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
        <Icon className={`size-3 ${iconClass}`} />
        {isPrivate ? "Private" : "Review"}
        <span className="normal-case tracking-normal text-[var(--rd-graphite)]">
          · {ledgerLineRangeLabel(entry)}
        </span>
      </div>
      <MarkdownPreview className="mt-1 block line-clamp-2">
        {entry.body}
      </MarkdownPreview>
    </button>
  );
}

/* ─── Shared building blocks ──────────────────────────────────────── */

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
    if (next === committedRef.current) {
      return;
    }
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
    if (!el) {
      return;
    }
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
      className="block w-full min-h-[72px] max-h-[280px] resize-none overflow-auto rounded-md border-0 bg-[var(--rd-ink-2)] px-3 py-2 text-[13px] leading-5 text-[var(--rd-cream)] outline-none placeholder:text-[var(--rd-graphite)] focus-visible:outline-2 focus-visible:outline-[var(--rd-vermillion-line)] focus-visible:outline-offset-[-2px]"
    />
  );
}

function EmptyFilePrompt() {
  return (
    <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-4 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
      Select a file to inspect.
    </div>
  );
}

function SessionWarnings({ session }: { session: ReviewSession }) {
  if (session.order.warnings.length === 0) {
    return null;
  }
  return (
    <div className="mt-5 rounded-md border-l-[3px] border-[var(--rd-del)] bg-[var(--rd-del-bg)] px-3 py-2.5">
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
              <span className="font-mono">
                {compactPath(warning.path, 42)}:{" "}
              </span>
            ) : null}
            {warning.message}
          </div>
        ))}
      </div>
    </div>
  );
}

const BasketFooter = memo(function BasketFooter({
  basket,
  onPublishReview,
}: {
  basket: LedgerEntry[];
  onPublishReview?: () => void;
}) {
  return (
    <div className="border-t border-[var(--rd-hair)]">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">
          Basket
        </div>
        <div className="font-mono text-[11px] tabular-nums text-[var(--rd-pencil)]">
          {basket.length} {basket.length === 1 ? "item" : "items"}
        </div>
      </div>

      <div className="max-h-44 overflow-y-auto px-3 pt-2">
        {basket.length > 0 ? (
          <div className="space-y-1">
            {basket.map((entry) => (
              <div key={entry.id} className="px-2 py-1.5">
                <div className="truncate font-mono text-[10px] text-[var(--rd-cream-2)]">
                  {compactPath(entry.filePath, 38)}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                  {ledgerLineRangeLabel(entry)}
                </div>
                <MarkdownPreview className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-[var(--rd-graphite)]">
                  {entry.body}
                </MarkdownPreview>
              </div>
            ))}
          </div>
        ) : (
          <div className="rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            Publishable comments collect here.
          </div>
        )}
      </div>

      <div className="p-3 pt-2">
        <Button
          type="button"
          className="h-8 w-full rounded-md bg-[var(--rd-cream)] text-[12px] font-medium text-[var(--rd-ink)] hover:bg-white disabled:bg-[var(--rd-ink-3)] disabled:text-[var(--rd-pencil)]"
          disabled={!onPublishReview}
          onClick={onPublishReview}
        >
          <Send className="size-3.5" />
          Publish Review
        </Button>
      </div>
    </div>
  );
});

function buildPrivateNotesExport(
  session: ReviewSession,
  privateEntries: LedgerEntry[],
) {
  const groups = groupLedgerByFile(session, privateEntries);
  if (groups.length === 0) {
    return "";
  }

  const lines = [
    "# Private review notes",
    "",
    `Repository: ${session.repo.root}`,
    `Target: ${session.target.label}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  for (const group of groups) {
    lines.push(`## ${group.file.path}`, "");
    for (const entry of group.entries) {
      lines.push(`### ${ledgerLineRangeLabel(entry)}`, "", entry.body.trim(), "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function privateNotesFilename(session: ReviewSession) {
  const repoName = session.repo.root.split(/[\\/]/).filter(Boolean).pop() ?? "review";
  const safeRepoName = repoName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  return `${safeRepoName}-private-notes.md`;
}
