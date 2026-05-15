import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Bot,
  ChevronDown,
  MessageSquare,
  NotebookPen,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { compactPath } from "@/lib/format";
import {
  collectLedger,
  countByKind,
  filterLedger,
  groupLedgerByFile,
  lineRangeLabel as ledgerLineRangeLabel,
  type LedgerEntry,
  type LedgerFilter,
} from "@/lib/ledger";
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
  mode: "file" | "ledger";
  onModeChange: (mode: "file" | "ledger") => void;
  onJumpToNote: (target: {
    fileId: string;
    diffPosition?: number;
    expandSection?: "private" | "draft";
  }) => void;
  onPatchFileState: (fileId: string, patch: Partial<SessionFileState>) => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  expandSectionHint?: { section: "private" | "draft"; key: number } | null;
};

type SectionKey = "private" | "draft" | "agent";

export function Inspector(props: InspectorProps) {
  const { session, mode, onModeChange, workspaceState } = props;
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

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <InspectorHeader mode={mode} onModeChange={onModeChange} />

      <ScrollArea className="min-h-0 flex-1">
        {mode === "file" ? (
          <FileMode {...props} />
        ) : (
          <LedgerMode session={session} ledger={ledger} onJumpToNote={props.onJumpToNote} />
        )}
      </ScrollArea>

      <BasketFooter basket={basket} />
    </aside>
  );
}

function InspectorHeader({
  mode,
  onModeChange,
}: {
  mode: "file" | "ledger";
  onModeChange: (mode: "file" | "ledger") => void;
}) {
  return (
    <div className="border-b border-[var(--rd-hair)] px-5 py-3">
      <div className="rd-display-italic text-[13px] leading-none text-[var(--rd-cream-2)]">
        Margin
      </div>
      <div className="mt-2 inline-flex rounded-md bg-[var(--rd-ink-2)] p-0.5">
        <button
          type="button"
          onClick={() => onModeChange("file")}
          aria-pressed={mode === "file"}
          className={[
            "h-6 rounded px-2 text-[11px]",
            mode === "file"
              ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
              : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
          ].join(" ")}
        >
          This file
        </button>
        <button
          type="button"
          onClick={() => onModeChange("ledger")}
          aria-pressed={mode === "ledger"}
          className={[
            "h-6 rounded px-2 text-[11px]",
            mode === "ledger"
              ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
              : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
          ].join(" ")}
        >
          Ledger
        </button>
      </div>
    </div>
  );
}

function FileMode({
  session,
  file,
  fileState,
  onPatchFileState,
  expandSectionHint,
}: InspectorProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    private: true,
    draft: false,
    agent: false,
  });

  useEffect(() => {
    if (!expandSectionHint) {
      return;
    }
    setOpenSections((current) => ({ ...current, [expandSectionHint.section]: true }));
  }, [expandSectionHint]);

  function toggle(key: SectionKey) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="px-4 py-4">
      {file ? (
        <>
          <div className="mt-5 space-y-3">
            <AccordionSection
              label="Private notes"
              open={openSections.private}
              onToggle={() => toggle("private")}
              icon={<NotebookPen className="size-3.5 text-[var(--rd-graphite)]" />}
            >
              <BufferedTextarea
                key={`${file.id}-private`}
                value={fileState?.privateNote ?? ""}
                onCommit={(value) => onPatchFileState(file.id, { privateNote: value })}
                placeholder="Notes for me. These never publish."
                className="min-h-32 resize-none border-0 bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
              />
            </AccordionSection>

            <AccordionSection
              label="Public draft"
              open={openSections.draft}
              onToggle={() => toggle("draft")}
              icon={<MessageSquare className="size-3.5 text-[var(--rd-vermillion-2)]" />}
            >
              <BufferedTextarea
                key={`${file.id}-draft`}
                value={fileState?.publishableDraft ?? ""}
                onCommit={(value) =>
                  onPatchFileState(file.id, { publishableDraft: value })
                }
                placeholder="Draft a publishable review comment."
                className="min-h-32 resize-none border-0 bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
              />
            </AccordionSection>

            <AccordionSection
              label="Agent context"
              open={openSections.agent}
              onToggle={() => toggle("agent")}
              icon={<Bot className="size-3.5 text-[var(--rd-vermillion-2)]" />}
            >
              <AgentContext session={session} file={file} />
            </AccordionSection>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-4 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
          Select a file to inspect.
        </div>
      )}

      {session.order.warnings.length > 0 ? (
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
                  <span className="font-mono">{compactPath(warning.path, 42)}: </span>
                ) : null}
                {warning.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LedgerMode({
  session,
  ledger,
  onJumpToNote,
}: {
  session: ReviewSession;
  ledger: LedgerEntry[];
  onJumpToNote: InspectorProps["onJumpToNote"];
}) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const counts = useMemo(() => countByKind(ledger), [ledger]);
  const filtered = useMemo(() => filterLedger(ledger, filter), [filter, ledger]);
  const groups = useMemo(
    () => groupLedgerByFile(session, filtered),
    [filtered, session],
  );

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-1.5">
        <FilterChip label={`All ${counts.total}`} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip label={`Private ${counts.private}`} active={filter === "private"} onClick={() => setFilter("private")} />
        <FilterChip label={`Review ${counts.review}`} active={filter === "review"} onClick={() => setFilter("review")} />
      </div>

      <div className="mt-3 space-y-4">
        {groups.length === 0 ? (
          <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-4 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
            No notes yet. Comment on a line or draft a review to populate the ledger.
          </div>
        ) : (
          groups.map((group) => (
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
          ))
        )}
      </div>
    </div>
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
      onClick={onClick}
      aria-pressed={active}
      className={[
        "h-6 rounded-full px-2.5 text-[10px] font-mono uppercase tracking-wider",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function LedgerCard({ entry, onJump }: { entry: LedgerEntry; onJump: () => void }) {
  const isPrivate = entry.kind === "private-file-note" || entry.kind === "private-inline";
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
      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--rd-cream-2)]">
        {entry.body}
      </p>
    </button>
  );
}

function AccordionSection({
  label,
  open,
  onToggle,
  icon,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="rd-display-italic text-[13px] text-[var(--rd-cream)]">{label}</span>
        </span>
        <ChevronDown
          className={[
            "size-3.5 text-[var(--rd-pencil)] transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function BufferedTextarea({
  value,
  onCommit,
  onBlur,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
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
    const nextValue = valueRef.current;
    if (nextValue === committedRef.current) {
      return;
    }

    committedRef.current = nextValue;
    onCommitRef.current(nextValue);
  }, []);

  useEffect(() => {
    valueRef.current = draft;
    const timer = window.setTimeout(commit, 250);
    return () => window.clearTimeout(timer);
  }, [commit, draft]);

  useEffect(() => () => commit(), [commit]);

  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
    />
  );
}

function AgentContext({ session, file }: { session: ReviewSession; file: ReviewFile }) {
  if (session.order.source !== "agent" && !file.reviewReason && file.agentNotes.length === 0) {
    return (
      <div className="text-[12px] leading-5 text-[var(--rd-graphite)]">
        Import an agent manifest to see review rationale here.
      </div>
    );
  }

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

const BasketFooter = memo(function BasketFooter({ basket }: { basket: LedgerEntry[] }) {
  return (
    <div className="border-t border-[var(--rd-hair)]">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">Basket</div>
        <div className="font-mono text-[11px] tabular-nums text-[var(--rd-pencil)]">
          {basket.length} {basket.length === 1 ? "item" : "items"}
        </div>
      </div>

      <div className="max-h-44 overflow-y-auto px-3 pt-2">
        {basket.length > 0 ? (
          <div className="space-y-1">
            {basket.map((entry) => (
              <div
                key={entry.id}
                className="px-2 py-1.5"
              >
                <div className="truncate font-mono text-[10px] text-[var(--rd-cream-2)]">
                  {compactPath(entry.filePath, 38)}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                  {ledgerLineRangeLabel(entry)}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--rd-graphite)]">
                  {entry.body}
                </p>
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
          disabled={basket.length === 0}
        >
          <Send className="size-3.5" />
          Publish Review
        </Button>
      </div>
    </div>
  );
});
