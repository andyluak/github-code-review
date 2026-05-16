import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Check,
  CheckCircle2,
  Columns2,
  Copy,
  Eye,
  ExternalLink,
  FileDiff,
  MessageSquare,
  NotebookPen,
  Rows3,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDiffViewMode, type DiffViewMode } from "@/hooks/use-diff-view-mode";
import { compactPath, pathParts } from "@/lib/format";
import { highlightCodeLine } from "@/lib/syntax-highlight";
import { MarkdownView } from "@/components/review/MarkdownView";
import { ConversationBubble } from "@/components/review/ConversationBubble";
import { ConversationThread } from "@/components/review/ConversationThread";
import type { ReviewThread } from "@/types/github";
import type {
  DiffLine,
  InlineComment,
  InlineCommentSide,
  InlineCommentVisibility,
  ReviewFile,
  SessionFileState,
} from "@/types/review";

type JumpTarget = {
  fileId: string;
  diffPosition?: number;
  expandSection?: "private" | "draft";
  requestedAt: number;
};

type DiffCanvasProps = {
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  jumpTarget: JumpTarget | null;
  supportsReviewComments: boolean;
  onScrollHandled: () => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onOpenFile: () => void;
  onSaveInlineComment: (fileId: string, comment: InlineComment) => void;
  onDeleteInlineComment: (fileId: string, commentId: string) => void;
  threads?: ReviewThread[];
  expandedThreadId?: string | null;
  onExpandThread?: (id: string | null) => void;
  onReplyThread?: (fileId: string, threadId: string, body: string) => void;
};

type LineAnchor = {
  diffPosition: number;
  side: InlineCommentSide;
  lineNumber?: number | null;
};

type CommentTarget = {
  side: InlineCommentSide;
  startDiffPosition: number;
  endDiffPosition: number;
  startLine?: number | null;
  endLine?: number | null;
};

type AnchoredDiffLine = {
  line: DiffLine;
  anchor: LineAnchor;
};

type SplitDisplayRow = {
  key: string;
  old?: AnchoredDiffLine;
  new?: AnchoredDiffLine;
};

const EMPTY_INLINE_COMMENTS: InlineComment[] = [];

export const DiffCanvas = memo(function DiffCanvas({
  file,
  fileState,
  jumpTarget,
  supportsReviewComments,
  onScrollHandled,
  onMarkViewed,
  onMarkReviewed,
  onOpenFile,
  onSaveInlineComment,
  onDeleteInlineComment,
  threads,
  expandedThreadId,
  onExpandThread,
  onReplyThread,
}: DiffCanvasProps) {
  const [viewMode, setViewMode] = useDiffViewMode();
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null);
  const [isLineSelectionDragging, setIsLineSelectionDragging] = useState(false);
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const lineSelectionDragRef = useRef(false);

  useEffect(() => {
    setDraftTarget(null);
    setIsLineSelectionDragging(false);
    lineSelectionDragRef.current = false;
    scrollViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [file?.id]);

  useEffect(() => {
    function stopDragSelection() {
      lineSelectionDragRef.current = false;
      setIsLineSelectionDragging(false);
    }

    window.addEventListener("pointerup", stopDragSelection);
    window.addEventListener("pointercancel", stopDragSelection);
    return () => {
      window.removeEventListener("pointerup", stopDragSelection);
      window.removeEventListener("pointercancel", stopDragSelection);
    };
  }, []);

  useEffect(() => {
    if (!jumpTarget || !file || jumpTarget.fileId !== file.id) {
      return;
    }
    if (jumpTarget.diffPosition === undefined) {
      return;
    }
    const container = diffContainerRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector<HTMLElement>(
      `[data-anchor="${jumpTarget.diffPosition}"]`,
    );
    if (!target) {
      onScrollHandled();
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "auto" });
    // Force animation restart in case the class is still attached from a prior jump.
    target.classList.remove("rd-jump-flash");
    void target.offsetWidth;
    target.classList.add("rd-jump-flash");
    const flashTimer = window.setTimeout(() => {
      target.classList.remove("rd-jump-flash");
    }, 900);
    onScrollHandled();
    return () => {
      window.clearTimeout(flashTimer);
      target.classList.remove("rd-jump-flash");
    };
  }, [jumpTarget, file, onScrollHandled]);

  const isOneSided = file
    ? file.changeKind === "added" || file.changeKind === "deleted"
    : false;
  const effectiveMode: DiffViewMode = isOneSided ? "unified" : viewMode;
  const inlineComments = fileState?.inlineComments ?? EMPTY_INLINE_COMMENTS;
  const visibleInlineComments = useMemo(
    () =>
      supportsReviewComments
        ? inlineComments
        : inlineComments.filter((comment) => comment.visibility === "private"),
    [inlineComments, supportsReviewComments],
  );
  const commentsByPosition = useMemo(
    () => groupCommentsByPosition(visibleInlineComments),
    [visibleInlineComments],
  );
  const splitRowsByHunk = useMemo(() => {
    if (!file || effectiveMode !== "split" || isOneSided) {
      return [];
    }

    return file.hunks.map((hunk, hunkIndex) =>
      buildSplitRows(hunk.lines, file.changeKind, hunkIndex),
    );
  }, [effectiveMode, file, isOneSided]);

  function openInlineComposer(anchor: LineAnchor, extendSelection: boolean) {
    setDraftTarget((current) => {
      if (extendSelection && current?.side === anchor.side) {
        return extendTarget(current, anchor);
      }
      return targetFromAnchor(anchor);
    });
  }

  function beginInlineSelection(anchor: LineAnchor, extendSelection: boolean) {
    if (extendSelection) {
      openInlineComposer(anchor, true);
      return;
    }
    lineSelectionDragRef.current = true;
    setIsLineSelectionDragging(true);
    setDraftTarget(targetFromAnchor(anchor));
  }

  function extendInlineSelection(anchor: LineAnchor) {
    if (!lineSelectionDragRef.current) {
      return;
    }
    setDraftTarget((current) => {
      if (!current) {
        return targetFromAnchor(anchor);
      }
      if (current.side !== anchor.side) {
        return current;
      }
      return extendTarget(current, anchor);
    });
  }

  const saveDraftComment = useCallback((draftBody: string, draftVisibility: InlineCommentVisibility) => {
    const body = draftBody.trim();
    if (!file || !draftTarget || !body) {
      return;
    }
    const visibility = supportsReviewComments ? draftVisibility : "private";
    const now = new Date().toISOString();
    onSaveInlineComment(file.id, {
      id: createCommentId(),
      fileId: file.id,
      path: file.path,
      side: draftTarget.side,
      startDiffPosition: draftTarget.startDiffPosition,
      endDiffPosition: draftTarget.endDiffPosition,
      startLine: draftTarget.startLine,
      endLine: draftTarget.endLine,
      body,
      visibility,
      createdAt: now,
      updatedAt: now,
    });
    setDraftTarget(null);
  }, [draftTarget, file, onSaveInlineComment, supportsReviewComments]);

  if (!file) {
    return (
      <section className="grid h-full place-items-center bg-[var(--rd-ink)]">
        <div className="text-center">
          <FileDiff className="mx-auto size-10 text-[var(--rd-pencil)]" />
          <div className="mt-4 rd-display-italic text-[16px] text-[var(--rd-cream-2)]">
            No file selected
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--rd-pencil)]">
            Pick a file from the review queue.
          </div>
        </div>
      </section>
    );
  }

  const status = fileState?.status ?? file.viewedStatus;
  const isReviewed = status === "reviewed";
  const viewedLabel = status === "viewed" ? "Unview" : "Mark Viewed";
  const reviewedLabel = isReviewed ? "Undo Review" : "Mark Reviewed";
  const displayPath = pathParts(file.path);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-mono text-[12px] font-medium text-[var(--rd-cream)]">
              {displayPath.fileName}
            </h2>
            <span className="rd-display-italic text-[11px] text-[var(--rd-pencil)]">
              {file.changeKind}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] text-[var(--rd-pencil)]">
            {displayPath.directory ? (
              <span className="min-w-0 truncate" title={file.path}>
                {compactPath(displayPath.directory, 76)}
              </span>
            ) : null}
            <span className="text-[var(--rd-add)]">+{file.additions}</span>
            <span className="text-[var(--rd-del)]">−{file.deletions}</span>
            {file.oldPath ? <span>← {compactPath(file.oldPath, 56)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
                disabled={file.changeKind === "deleted"}
                onClick={onOpenFile}
                aria-label="Open file in editor"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {file.changeKind === "deleted"
                ? "Deleted file has no working-tree path"
                : "Open file in editor"}
            </TooltipContent>
          </Tooltip>
          <ViewModeToggle mode={viewMode} disabled={isOneSided} onChange={setViewMode} />
          <span className="h-4 w-px bg-[var(--rd-hair-2)]" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 rounded-md px-2 text-[11px] text-[var(--rd-cream-2)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
            onClick={onMarkViewed}
          >
            <Eye className="size-3.5" />
            {viewedLabel}
          </Button>
          <Button
            type="button"
            size="xs"
            className={
              isReviewed
                ? "h-7 rounded-md bg-[var(--rd-vermillion)] px-2 text-[11px] text-[var(--rd-ink)] hover:bg-[var(--rd-vermillion-2)]"
                : "h-7 rounded-md bg-[var(--rd-cream)] px-2 text-[11px] text-[var(--rd-ink)] hover:bg-white"
            }
            onClick={onMarkReviewed}
          >
            <CheckCircle2 className="size-3.5" />
            {reviewedLabel}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportRef={scrollViewportRef}>
        <div className="min-w-0 px-4 py-4" ref={diffContainerRef}>
          <div className="overflow-hidden rounded-md bg-[var(--rd-ink-2)]">
            {file.hunks.map((hunk, hunkIndex) => (
              <div key={`${file.id}-${hunk.header}`}>
                <div className="flex items-center gap-3 border-y border-[var(--rd-hair)] bg-[var(--rd-ink)] px-4 py-1.5">
                  <span className="h-px flex-1 bg-[var(--rd-hair-2)]" aria-hidden />
                  <span className="font-mono text-[10px] text-[var(--rd-vermillion-2)]">
                    {hunk.header}
                  </span>
                  <span className="h-px flex-1 bg-[var(--rd-hair-2)]" aria-hidden />
                </div>
                {effectiveMode === "split" && !isOneSided
                  ? (splitRowsByHunk[hunkIndex] ?? []).map((row) => {
                      const positions = getSplitRowPositions(row);
                      const lineComments = positions.flatMap(
                        (position) => commentsByPosition.get(position) ?? [],
                      );

                      return (
                        <Fragment key={`${hunk.header}-${row.key}`}>
                          <SplitRow
                            row={row}
                            selected={positions.some((position) =>
                              isTargetSelected(draftTarget, position),
                            )}
                            onAddComment={openInlineComposer}
                            onBeginSelection={beginInlineSelection}
                            onExtendSelection={extendInlineSelection}
                          />
                          {draftTarget &&
                          !isLineSelectionDragging &&
                          positions.includes(draftTarget.endDiffPosition) ? (
                            <InlineCommentComposer
                              target={draftTarget}
                              supportsReviewComments={supportsReviewComments}
                              onSave={saveDraftComment}
                              onCancel={() => {
                                setDraftTarget(null);
                              }}
                            />
                          ) : null}
                          {lineComments.map((comment) => (
                            <InlineCommentCard
                              key={comment.id}
                              comment={comment}
                              onDelete={() => onDeleteInlineComment(file.id, comment.id)}
                            />
                          ))}
                          {threadsForRow(threads, file.path, row).map((t) =>
                            expandedThreadId === t.id ? (
                              <ConversationThread
                                key={t.id}
                                thread={t}
                                onCollapse={() => onExpandThread?.(null)}
                                onReply={(id, body) =>
                                  onReplyThread?.(file.id, id, body)
                                }
                              />
                            ) : (
                              <ConversationBubble
                                key={t.id}
                                thread={t}
                                onExpand={(id) => onExpandThread?.(id)}
                              />
                            ),
                          )}
                        </Fragment>
                      );
                    })
                  : hunk.lines.map((line, lineIndex) => {
                      const anchor = getLineAnchor(
                        line,
                        file.changeKind,
                        hunkIndex,
                        lineIndex,
                      );
                      const lineComments =
                        commentsByPosition.get(anchor.diffPosition) ?? [];

                      return (
                        <Fragment key={`${hunk.header}-${lineIndex}-${anchor.diffPosition}`}>
                          <UnifiedRow
                            line={line}
                            anchor={anchor}
                            changeKind={file.changeKind}
                            selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                            onAddComment={openInlineComposer}
                            onBeginSelection={beginInlineSelection}
                            onExtendSelection={extendInlineSelection}
                          />
                          {draftTarget?.endDiffPosition === anchor.diffPosition &&
                          !isLineSelectionDragging ? (
                            <InlineCommentComposer
                              target={draftTarget}
                              supportsReviewComments={supportsReviewComments}
                              onSave={saveDraftComment}
                              onCancel={() => {
                                setDraftTarget(null);
                              }}
                            />
                          ) : null}
                          {lineComments.map((comment) => (
                            <InlineCommentCard
                              key={comment.id}
                              comment={comment}
                              onDelete={() => onDeleteInlineComment(file.id, comment.id)}
                            />
                          ))}
                          {threadsForUnified(
                            threads,
                            file.path,
                            line,
                            anchor,
                          ).map((t) =>
                            expandedThreadId === t.id ? (
                              <ConversationThread
                                key={t.id}
                                thread={t}
                                onCollapse={() => onExpandThread?.(null)}
                                onReply={(id, body) =>
                                  onReplyThread?.(file.id, id, body)
                                }
                              />
                            ) : (
                              <ConversationBubble
                                key={t.id}
                                thread={t}
                                onExpand={(id) => onExpandThread?.(id)}
                              />
                            ),
                          )}
                        </Fragment>
                      );
                    })}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}, areDiffCanvasPropsEqual);

function areDiffCanvasPropsEqual(
  previous: DiffCanvasProps,
  next: DiffCanvasProps,
) {
  return (
    previous.file === next.file &&
    previous.jumpTarget === next.jumpTarget &&
    previous.supportsReviewComments === next.supportsReviewComments &&
    effectiveFileStatus(previous) === effectiveFileStatus(next) &&
    sameInlineComments(previous.fileState, next.fileState) &&
    previous.onScrollHandled === next.onScrollHandled &&
    previous.onMarkViewed === next.onMarkViewed &&
    previous.onMarkReviewed === next.onMarkReviewed &&
    previous.onOpenFile === next.onOpenFile &&
    previous.onSaveInlineComment === next.onSaveInlineComment &&
    previous.onDeleteInlineComment === next.onDeleteInlineComment
  );
}

function effectiveFileStatus(props: DiffCanvasProps) {
  return props.fileState?.status ?? props.file?.viewedStatus ?? "unseen";
}

function sameInlineComments(
  previous: SessionFileState | null,
  next: SessionFileState | null,
) {
  const previousComments = previous?.inlineComments;
  const nextComments = next?.inlineComments;
  if (previousComments === nextComments) {
    return true;
  }
  return (previousComments?.length ?? 0) === 0 && (nextComments?.length ?? 0) === 0;
}

function groupCommentsByPosition(inlineComments: InlineComment[]) {
  const commentsByPosition = new Map<number, InlineComment[]>();
  for (const comment of inlineComments) {
    const comments = commentsByPosition.get(comment.endDiffPosition) ?? [];
    comments.push(comment);
    commentsByPosition.set(comment.endDiffPosition, comments);
  }
  return commentsByPosition;
}

function ViewModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: DiffViewMode;
  disabled: boolean;
  onChange: (mode: DiffViewMode) => void;
}) {
  const effective: DiffViewMode = disabled ? "unified" : mode;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex h-7 items-center rounded-md bg-[var(--rd-ink-2)] p-0.5"
          role="group"
          aria-label="Diff view mode"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("split")}
            className={[
              "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium",
              effective === "split"
                ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
                : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
            aria-pressed={effective === "split"}
            aria-label="Side-by-side diff"
          >
            <Columns2 className="size-3" />
            Split
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("unified")}
            className={[
              "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium",
              effective === "unified"
                ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
                : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
            aria-pressed={effective === "unified"}
            aria-label="Unified diff"
          >
            <Rows3 className="size-3" />
            Unified
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {disabled ? "Single-sided file" : "Toggle: Cmd/Ctrl + \\"}
      </TooltipContent>
    </Tooltip>
  );
}

const SplitRow = memo(function SplitRow({
  row,
  selected,
  onAddComment,
  onBeginSelection,
  onExtendSelection,
}: {
  row: SplitDisplayRow;
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
  onBeginSelection: (anchor: LineAnchor, extendSelection: boolean) => void;
  onExtendSelection: (anchor: LineAnchor) => void;
}) {
  const oldHot = row.old?.line.kind === "deletion";
  const newHot = row.new?.line.kind === "addition";
  const anchor = row.old?.anchor ?? row.new?.anchor;

  return (
    <div
      data-anchor={anchor?.diffPosition}
      className={[
        "group grid min-h-6 grid-cols-[56px_minmax(0,1fr)_56px_minmax(0,1fr)] border-b border-[var(--rd-hair)] font-mono text-[12px] leading-6",
        selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-vermillion-line)]" : "",
      ].join(" ")}
    >
      <LineNumber value={row.old?.line.oldLine} hot={oldHot} tone="del" />
      <CodeCell
        muted={!row.old}
        hot={oldHot}
        marker={row.old ? markerForLine(row.old.line) : ""}
        tone={oldHot ? "del" : "neutral"}
        counterpart={oldHot && row.new ? row.new.line.content : undefined}
        onAddComment={
          row.old ? (extend) => onAddComment(row.old!.anchor, extend) : undefined
        }
        onBeginSelection={
          row.old ? (extend) => onBeginSelection(row.old!.anchor, extend) : undefined
        }
        onExtendSelection={row.old ? () => onExtendSelection(row.old!.anchor) : undefined}
      >
        {row.old?.line.content ?? ""}
      </CodeCell>
      <LineNumber value={row.new?.line.newLine} hot={newHot} tone="add" />
      <CodeCell
        muted={!row.new}
        hot={newHot}
        marker={row.new ? markerForLine(row.new.line) : ""}
        tone={newHot ? "add" : "neutral"}
        counterpart={newHot && row.old ? row.old.line.content : undefined}
        onAddComment={
          row.new ? (extend) => onAddComment(row.new!.anchor, extend) : undefined
        }
        onBeginSelection={
          row.new ? (extend) => onBeginSelection(row.new!.anchor, extend) : undefined
        }
        onExtendSelection={row.new ? () => onExtendSelection(row.new!.anchor) : undefined}
      >
        {row.new?.line.content ?? ""}
      </CodeCell>
    </div>
  );
});

const UnifiedRow = memo(function UnifiedRow({
  line,
  anchor,
  changeKind,
  selected,
  onAddComment,
  onBeginSelection,
  onExtendSelection,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  changeKind: ReviewFile["changeKind"];
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
  onBeginSelection: (anchor: LineAnchor, extendSelection: boolean) => void;
  onExtendSelection: (anchor: LineAnchor) => void;
}) {
  const isAddition = line.kind === "addition";
  const isDeletion = line.kind === "deletion";
  const marker = isAddition ? "+" : isDeletion ? "−" : " ";
  const lineSide: InlineCommentSide = isDeletion || changeKind === "deleted" ? "old" : "new";
  const lineAnchor: LineAnchor = {
    ...anchor,
    side: lineSide,
    lineNumber: lineSide === "old" ? line.oldLine : line.newLine,
  };

  return (
    <div
      data-anchor={anchor.diffPosition}
      className={[
        "group grid min-h-6 grid-cols-[48px_48px_minmax(0,1fr)] border-b border-[var(--rd-hair)] font-mono text-[12px] leading-6",
        isAddition ? "bg-[var(--rd-add-bg)]" : "",
        isDeletion ? "bg-[var(--rd-del-bg)]" : "",
        selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-vermillion-line)]" : "",
      ].join(" ")}
    >
      <LineNumber value={isAddition ? null : line.oldLine} hot={isDeletion} tone="del" />
      <LineNumber value={isDeletion ? null : line.newLine} hot={isAddition} tone="add" />
      <CodeCell
        muted={false}
        hot={isAddition || isDeletion}
        marker={marker}
        tone={isAddition ? "add" : isDeletion ? "del" : "neutral"}
        onAddComment={(extend) => onAddComment(lineAnchor, extend)}
        onBeginSelection={(extend) => onBeginSelection(lineAnchor, extend)}
        onExtendSelection={() => onExtendSelection(lineAnchor)}
      >
        {line.content}
      </CodeCell>
    </div>
  );
});

function InlineCommentComposer({
  target,
  supportsReviewComments,
  onSave,
  onCancel,
}: {
  target: CommentTarget;
  supportsReviewComments: boolean;
  onSave: (body: string, visibility: InlineCommentVisibility) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] =
    useState<InlineCommentVisibility>(supportsReviewComments ? "review" : "private");
  const canSave = body.trim().length > 0;

  useEffect(() => {
    if (!supportsReviewComments && visibility === "review") {
      setVisibility("private");
    }
  }, [supportsReviewComments, visibility]);

  return (
    <div className="border-l-[3px] border-[var(--rd-vermillion-line)] bg-[var(--rd-ink-3)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Comment on {lineRangeLabel(target)}
        </div>
        <button
          type="button"
          className="grid size-6 place-items-center rounded text-[var(--rd-pencil)] hover:bg-[var(--rd-ink-2)] hover:text-[var(--rd-cream)]"
          onClick={onCancel}
          aria-label="Cancel comment"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          if (canSave) {
            onSave(body, visibility);
          }
        }}
        autoFocus
        aria-label="Inline comment body. Markdown supported. Shift Enter adds the comment."
        placeholder="Write a comment for this line."
        className="min-h-24 resize-y border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-0.5">
          <CommentModeButton
            active={visibility === "private"}
            icon={<NotebookPen className="size-3.5" />}
            label="Private"
            onClick={() => setVisibility("private")}
          />
          {supportsReviewComments ? (
            <CommentModeButton
              active={visibility === "review"}
              icon={<MessageSquare className="size-3.5" />}
              label="Review"
              onClick={() => setVisibility("review")}
            />
          ) : null}
        </div>
        <Button
          type="button"
          size="xs"
          className="h-7 rounded-md bg-[var(--rd-cream)] px-3 text-[11px] text-[var(--rd-ink)] hover:bg-white"
          disabled={!canSave}
          onClick={() => onSave(body, visibility)}
        >
          Add comment
        </Button>
      </div>
    </div>
  );
}

const InlineCommentCard = memo(function InlineCommentCard({
  comment,
  onDelete,
}: {
  comment: InlineComment;
  onDelete: () => void;
}) {
  const isPrivate = comment.visibility === "private";

  return (
    <div className="border-l-[3px] border-[var(--rd-vermillion-line)] bg-[var(--rd-ink-3)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
            {isPrivate ? (
              <NotebookPen className="size-3 text-[var(--rd-graphite)]" />
            ) : (
              <MessageSquare className="size-3 text-[var(--rd-vermillion-2)]" />
            )}
            {isPrivate ? "Private" : "Review"}
            <span className="normal-case tracking-normal text-[var(--rd-graphite)]">
              {lineRangeLabel(comment)}
            </span>
          </div>
          <MarkdownView className="mt-1.5" compact>
            {comment.body}
          </MarkdownView>
        </div>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded text-[var(--rd-pencil)] hover:bg-[var(--rd-ink-2)] hover:text-[var(--rd-del)]"
          onClick={onDelete}
          aria-label="Delete inline comment"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
});

const CommentModeButton = memo(function CommentModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "flex h-6 items-center gap-1 rounded px-2 text-[11px]",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
});

const LineNumber = memo(function LineNumber({
  value,
  hot,
  tone,
}: {
  value?: number | null;
  hot: boolean;
  tone: "del" | "add";
}) {
  return (
    <div
      className={[
        "select-none border-r border-[var(--rd-hair)] px-2 text-right text-[10px] tabular-nums",
        hot && tone === "del" ? "text-[var(--rd-del)]" : "",
        hot && tone === "add" ? "text-[var(--rd-add)]" : "",
        !hot ? "text-[var(--rd-pencil)]" : "",
      ].join(" ")}
    >
      {value ?? ""}
    </div>
  );
});

const CodeCell = memo(function CodeCell({
  children,
  muted,
  hot,
  marker,
  tone,
  counterpart,
  onAddComment,
  onBeginSelection,
  onExtendSelection,
}: {
  children: string;
  muted: boolean;
  hot: boolean;
  marker: string;
  tone: "add" | "del" | "neutral";
  counterpart?: string;
  onAddComment?: (extendSelection: boolean) => void;
  onBeginSelection?: (extendSelection: boolean) => void;
  onExtendSelection?: () => void;
}) {
  const canComment = Boolean(children && onAddComment);
  const canCopy = children.length > 0;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const codeContent = useMemo(
    () => (children ? renderCodeContent(children, counterpart, tone) : null),
    [children, counterpart, tone],
  );

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setCopyState("idle"), 900);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyLine(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(children);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div
      onPointerEnter={(event) => {
        if (!canComment || event.buttons !== 1) {
          return;
        }
        onExtendSelection?.();
      }}
      className={[
        "group/cell relative grid min-w-0 grid-cols-[28px_minmax(0,1fr)]",
        tone === "add" ? "bg-[var(--rd-add-bg)]" : "",
        tone === "del" ? "bg-[var(--rd-del-bg)]" : "",
        muted ? "text-[var(--rd-pencil)]" : "text-[var(--rd-cream-2)]",
        hot ? "text-[var(--rd-cream)]" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className={[
          "group/marker relative flex min-h-6 w-7 shrink-0 select-none items-start justify-center border-r border-[var(--rd-hair)] text-[var(--rd-pencil)] focus-visible:bg-[var(--rd-ink-3)] focus-visible:text-[var(--rd-vermillion-2)] focus-visible:outline-none",
          canComment
            ? "cursor-pointer hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-vermillion-2)]"
            : "cursor-default",
        ].join(" ")}
        disabled={!canComment}
        onPointerDown={(event) => {
          if (!canComment || event.button !== 0) {
            return;
          }
          event.preventDefault();
          onBeginSelection?.(event.shiftKey);
        }}
        onPointerEnter={(event) => {
          if (!canComment || event.buttons !== 1) {
            return;
          }
          onExtendSelection?.();
        }}
        onClick={(event) => {
          if (event.detail === 0) {
            onAddComment?.(event.shiftKey);
          }
        }}
        title={
          canComment
            ? "Add line comment. Drag to select a range."
            : undefined
        }
        aria-label="Add line comment"
      >
        <span
          className={[
            "leading-6",
            marker.trim()
              ? ""
              : "opacity-0 group-hover/marker:opacity-100 group-focus-visible/marker:opacity-100",
          ].join(" ")}
        >
          {children ? (marker.trim() ? marker : "+") : ""}
        </span>
      </button>
      <div
        className={[
          "min-w-0 whitespace-pre-wrap break-words px-3 pr-8 transition-colors duration-150",
          copyState === "copied" ? "bg-[var(--rd-vermillion-bg)]" : "",
        ].join(" ")}
      >
        {codeContent}
      </div>
      {canCopy ? (
        <button
          type="button"
          className={[
            "absolute right-1.5 top-1 grid size-4 place-items-center rounded text-[var(--rd-pencil)] opacity-0 transition hover:bg-[var(--rd-ink-4)] hover:text-[var(--rd-cream)] focus-visible:opacity-100 focus-visible:outline-none group-hover/cell:opacity-100",
            copyState === "copied" ? "opacity-100 text-[var(--rd-add)]" : "",
            copyState === "failed" ? "opacity-100 text-[var(--rd-del)]" : "",
          ].join(" ")}
          onClick={copyLine}
          aria-label="Copy raw line"
          title={copyState === "failed" ? "Copy failed" : "Copy raw line"}
        >
          {copyState === "copied" ? (
            <Check className="size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      ) : null}
      {copyState === "failed" ? (
        <div className="absolute right-6 top-0.5 rounded bg-[var(--rd-del-bg)] px-1.5 text-[10px] leading-5 text-[var(--rd-del)]">
          Copy failed
        </div>
      ) : null}
    </div>
  );
});

function buildSplitRows(
  lines: DiffLine[],
  changeKind: ReviewFile["changeKind"],
  hunkIndex: number,
) {
  const rows: SplitDisplayRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "context") {
      rows.push({
        key: `context-${hunkIndex}-${index}`,
        old: anchorLine(line, "old", changeKind, hunkIndex, index),
        new: anchorLine(line, "new", changeKind, hunkIndex, index),
      });
      index += 1;
      continue;
    }

    if (line.kind === "deletion") {
      const deletions: Array<{ line: DiffLine; index: number }> = [];
      while (lines[index]?.kind === "deletion") {
        deletions.push({ line: lines[index], index });
        index += 1;
      }

      const additions: Array<{ line: DiffLine; index: number }> = [];
      while (lines[index]?.kind === "addition") {
        additions.push({ line: lines[index], index });
        index += 1;
      }

      const count = Math.max(deletions.length, additions.length);
      for (let offset = 0; offset < count; offset += 1) {
        const oldLine = deletions[offset];
        const newLine = additions[offset];
        rows.push({
          key: `replace-${hunkIndex}-${oldLine?.index ?? "pad"}-${
            newLine?.index ?? "pad"
          }`,
          old: oldLine
            ? anchorLine(oldLine.line, "old", changeKind, hunkIndex, oldLine.index)
            : undefined,
          new: newLine
            ? anchorLine(newLine.line, "new", changeKind, hunkIndex, newLine.index)
            : undefined,
        });
      }
      continue;
    }

    const additions: Array<{ line: DiffLine; index: number }> = [];
    while (lines[index]?.kind === "addition") {
      additions.push({ line: lines[index], index });
      index += 1;
    }
    for (const addedLine of additions) {
      rows.push({
        key: `addition-${hunkIndex}-${addedLine.index}`,
        new: anchorLine(addedLine.line, "new", changeKind, hunkIndex, addedLine.index),
      });
    }
  }

  return rows;
}

function anchorLine(
  line: DiffLine,
  side: InlineCommentSide,
  changeKind: ReviewFile["changeKind"],
  hunkIndex: number,
  lineIndex: number,
): AnchoredDiffLine {
  const anchor = getLineAnchor(line, changeKind, hunkIndex, lineIndex);
  return {
    line,
    anchor: {
      ...anchor,
      side,
      lineNumber: side === "old" ? line.oldLine : line.newLine,
    },
  };
}

function getSplitRowPositions(row: SplitDisplayRow) {
  return [row.old?.anchor.diffPosition, row.new?.anchor.diffPosition].filter(
    (position): position is number => typeof position === "number",
  );
}

function markerForLine(line: DiffLine) {
  if (line.kind === "addition") {
    return "+";
  }
  if (line.kind === "deletion") {
    return "−";
  }
  return " ";
}

function renderCodeContent(
  content: string,
  counterpart: string | undefined,
  tone: "add" | "del" | "neutral",
) {
  if (!counterpart || content === counterpart || tone === "neutral") {
    return highlightCodeLine(content);
  }

  return inlineSegments(content, counterpart).map((segment, index) => {
    if (!segment.changed) {
      return <Fragment key={`${index}-same`}>{highlightCodeLine(segment.text)}</Fragment>;
    }

    return (
      <span
        key={`${index}-changed`}
        className={[
          "rounded-sm px-[1px]",
          tone === "add"
            ? "bg-[var(--rd-add-line)] text-[var(--rd-cream)]"
            : "bg-[var(--rd-del-line)] text-[var(--rd-cream)]",
        ].join(" ")}
      >
        {highlightCodeLine(segment.text)}
      </span>
    );
  });
}

function inlineSegments(content: string, counterpart: string) {
  let prefix = 0;
  while (
    prefix < content.length &&
    prefix < counterpart.length &&
    content[prefix] === counterpart[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < content.length - prefix &&
    suffix < counterpart.length - prefix &&
    content[content.length - suffix - 1] === counterpart[counterpart.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const end = content.length - suffix;
  return [
    { text: content.slice(0, prefix), changed: false },
    { text: content.slice(prefix, end), changed: true },
    { text: content.slice(end), changed: false },
  ].filter((segment) => segment.text.length > 0);
}

function getLineAnchor(
  line: DiffLine,
  changeKind: ReviewFile["changeKind"],
  hunkIndex: number,
  lineIndex: number,
): LineAnchor {
  const side =
    line.kind === "deletion" || changeKind === "deleted" ? "old" : "new";
  const lineNumber = side === "old" ? line.oldLine : line.newLine;

  return {
    diffPosition: hunkIndex * 100000 + (line.diffPosition ?? lineIndex + 1),
    side,
    lineNumber,
  };
}

function targetFromAnchor(anchor: LineAnchor): CommentTarget {
  return {
    side: anchor.side,
    startDiffPosition: anchor.diffPosition,
    endDiffPosition: anchor.diffPosition,
    startLine: anchor.lineNumber,
    endLine: anchor.lineNumber,
  };
}

function extendTarget(current: CommentTarget, anchor: LineAnchor): CommentTarget {
  const anchorFirst = anchor.diffPosition < current.startDiffPosition;
  return {
    side: current.side,
    startDiffPosition: Math.min(current.startDiffPosition, anchor.diffPosition),
    endDiffPosition: Math.max(current.endDiffPosition, anchor.diffPosition),
    startLine: anchorFirst ? anchor.lineNumber : current.startLine,
    endLine: anchorFirst ? current.endLine : anchor.lineNumber,
  };
}

function isTargetSelected(target: CommentTarget | null, position: number) {
  if (!target) {
    return false;
  }
  return position >= target.startDiffPosition && position <= target.endDiffPosition;
}

function lineRangeLabel(
  target: Pick<CommentTarget, "side" | "startLine" | "endLine">,
) {
  const side = target.side === "old" ? "old" : "new";
  if (!target.startLine && !target.endLine) {
    return `${side} line`;
  }
  if (target.startLine === target.endLine || !target.endLine) {
    return `${side} line ${target.startLine}`;
  }
  return `${side} lines ${target.startLine}-${target.endLine}`;
}

function createCommentId() {
  return `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function threadsForUnified(
  threads: ReviewThread[] | undefined,
  filePath: string,
  line: DiffLine,
  anchor: LineAnchor,
): ReviewThread[] {
  if (!threads || threads.length === 0) return [];
  return threads.filter((t) => {
    if (t.path !== filePath) return false;
    if (t.isOutdated) return false;
    const wantNew = anchor.side === "new" && line.newLine !== null && line.newLine !== undefined;
    const wantOld = anchor.side === "old" && line.oldLine !== null && line.oldLine !== undefined;
    if (wantNew && t.diffSide === "RIGHT" && t.line === line.newLine) return true;
    if (wantOld && t.diffSide === "LEFT" && t.line === line.oldLine) return true;
    return false;
  });
}

function threadsForRow(
  threads: ReviewThread[] | undefined,
  filePath: string,
  row: SplitDisplayRow,
): ReviewThread[] {
  if (!threads || threads.length === 0) return [];
  return threads.filter((t) => {
    if (t.path !== filePath) return false;
    if (t.isOutdated) return false;
    if (
      t.diffSide === "RIGHT" &&
      row.new &&
      row.new.line.newLine === t.line
    )
      return true;
    if (
      t.diffSide === "LEFT" &&
      row.old &&
      row.old.line.oldLine === t.line
    )
      return true;
    return false;
  });
}
