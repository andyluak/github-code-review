import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Check,
  Copy,
  FileDiff,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useDiffViewMode, type DiffViewMode } from "@/hooks/use-diff-view-mode";
import { compactPath, pathParts } from "@/lib/format";
import { highlightCodeLine } from "@/lib/syntax-highlight";
import { SlabButton } from "@/components/ui/slab-button";
import { SlabToggleGroup } from "@/components/ui/slab-toggle-group";
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
  expandSection?: "private";
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

type ThreadsByAnchor = Map<string, ReviewThread[]>;

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
  const threadsByAnchor = useMemo(() => groupThreadsByAnchor(threads), [threads]);
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
      {/* Identity block */}
      <div className="shrink-0 px-6 pt-5 pb-4 bg-[var(--rd-ink)]">
        <h2 className="truncate font-mono text-[17px] font-medium tracking-[-0.005em] text-[var(--rd-cream)]" title={file.path}>
          {displayPath.fileName}
        </h2>
        <div className="mt-1.5 flex items-baseline gap-2.5 flex-wrap font-mono text-[11.5px] text-[var(--rd-pencil)]">
          <span className="font-voice font-medium text-[12px] lowercase tracking-[0.01em] text-[var(--rd-vermillion-2)]">
            {file.changeKind}
          </span>
          <span className="text-[var(--rd-hair-3)]" aria-hidden>·</span>
          <span className="text-[var(--rd-add)]">+{file.additions}</span>
          <span className="text-[var(--rd-del)]">−{file.deletions}</span>
          {displayPath.directory ? (
            <>
              <span className="text-[var(--rd-hair-3)]" aria-hidden>·</span>
              <span className="min-w-0 truncate">
                {compactPath(displayPath.directory, 76)}
                {displayPath.directory.endsWith("/") ? "" : "/"}
              </span>
            </>
          ) : null}
          {file.oldPath ? (
            <>
              <span className="text-[var(--rd-hair-3)]" aria-hidden>·</span>
              <span>← {compactPath(file.oldPath, 56)}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-stretch border-y border-[var(--rd-hair)] bg-black/15 pl-6 pr-2">
        <SlabToggleGroup aria-label="Diff view mode">
          <SlabButton
            variant={effectiveMode === "split" ? "active" : "default"}
            disabled={isOneSided}
            onClick={() => setViewMode("split")}
            aria-pressed={effectiveMode === "split"}
            aria-label="Side-by-side diff"
            title="Toggle: Cmd/Ctrl + \\"
          >
            split
          </SlabButton>
          <SlabButton
            variant={effectiveMode === "unified" ? "active" : "default"}
            disabled={isOneSided}
            onClick={() => setViewMode("unified")}
            aria-pressed={effectiveMode === "unified"}
            aria-label="Unified diff"
            title="Toggle: Cmd/Ctrl + \\"
          >
            unified
          </SlabButton>
        </SlabToggleGroup>

        <span className="self-stretch w-px bg-[var(--rd-hair)]" aria-hidden />

        <SlabButton
          variant="default"
          disabled={file.changeKind === "deleted"}
          onClick={onOpenFile}
          aria-label={file.changeKind === "deleted" ? "Deleted file has no working-tree path" : "Open file in editor"}
          title={file.changeKind === "deleted" ? "Deleted file has no working-tree path" : "Open file in editor"}
        >
          open in editor ↗
        </SlabButton>

        <div className="flex-1" />

        <SlabButton
          variant="default"
          onClick={onMarkViewed}
          aria-label={viewedLabel}
        >
          {viewedLabel.toLowerCase()}
        </SlabButton>

        <span className="self-stretch w-px bg-[var(--rd-hair)]" aria-hidden />

        <SlabButton
          variant={isReviewed ? "danger" : "primary"}
          onClick={onMarkReviewed}
          aria-label={reviewedLabel}
        >
          {reviewedLabel.toLowerCase()}
        </SlabButton>
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
                              onSave={(updated) => onSaveInlineComment(file.id, updated)}
                            />
                          ))}
                          {threadsForRow(threadsByAnchor, file.path, row).map((t) =>
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
                              onSave={(updated) => onSaveInlineComment(file.id, updated)}
                            />
                          ))}
                          {threadsForUnified(
                            threadsByAnchor,
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
    previous.onDeleteInlineComment === next.onDeleteInlineComment &&
    previous.threads === next.threads &&
    previous.expandedThreadId === next.expandedThreadId &&
    previous.onExpandThread === next.onExpandThread &&
    previous.onReplyThread === next.onReplyThread
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
        selected ? "shadow-[inset_3px_0_0_var(--rd-vermillion)] bg-[rgba(230,106,79,0.06)]" : "",
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
        selected ? "shadow-[inset_3px_0_0_var(--rd-vermillion)] bg-[rgba(230,106,79,0.06)]" : "",
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

  // Privacy drives the left-hairline ink color — matches the rendered card.
  const hairlineColor = visibility === "private" ? "var(--rd-vermillion)" : "var(--rd-graphite)";

  return (
    <div className="relative px-6 py-4">
      <div
        className="border-l pl-3.5 ml-[68px]"
        style={{ borderLeftColor: hairlineColor }}
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="font-voice text-[12px] text-[var(--rd-cream-2)]">
            comment on {lineRangeLabel(target)}
          </div>
          <button
            type="button"
            className="font-voice text-[10.5px] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)] lowercase tracking-[0.02em]"
            onClick={onCancel}
            aria-label="Cancel comment"
          >
            cancel
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
          placeholder="write a comment for this line."
          className="min-h-24 resize-y rounded-none border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-3.5 py-3 font-voice text-[13px] leading-[1.5] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)] placeholder:font-voice focus-visible:border-[var(--rd-vermillion-line)] focus-visible:ring-0 focus-visible:outline-none"
        />

        <div className="mt-3 flex items-stretch justify-between gap-0">
          <div className="flex items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]">
            <SlabButton
              size="compact"
              variant={visibility === "private" ? "active" : "default"}
              onClick={() => setVisibility("private")}
              aria-pressed={visibility === "private"}
            >
              private
            </SlabButton>
            {supportsReviewComments ? (
              <SlabButton
                size="compact"
                variant={visibility === "review" ? "active" : "default"}
                onClick={() => setVisibility("review")}
                aria-pressed={visibility === "review"}
              >
                review
              </SlabButton>
            ) : null}
          </div>
          <SlabButton
            size="compact"
            variant="primary"
            disabled={!canSave}
            onClick={() => onSave(body, visibility)}
          >
            add comment
          </SlabButton>
        </div>
      </div>
    </div>
  );
}

const InlineCommentCard = memo(function InlineCommentCard({
  comment,
  onDelete,
  onSave,
}: {
  comment: InlineComment;
  onDelete: () => void;
  onSave: (updated: InlineComment) => void;
}) {
  const isPrivate = comment.visibility === "private";
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(comment.body);

  // Privacy drives the left-hairline ink color. Vermillion for private
  // (your own ink), graphite for review (will-be-sent-to-GitHub).
  const hairlineColor = isPrivate ? "var(--rd-vermillion)" : "var(--rd-graphite)";

  const startEdit = () => {
    setDraftBody(comment.body);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraftBody(comment.body);
    setIsEditing(false);
  };

  const saveEdit = () => {
    const trimmed = draftBody.trim();
    if (!trimmed || trimmed === comment.body) {
      cancelEdit();
      return;
    }
    onSave({ ...comment, body: trimmed, updatedAt: new Date().toISOString() });
    setIsEditing(false);
  };

  return (
    <div className="group/note relative flex px-6 py-3">
      {/* Body wrapper with the left hairline + indent matching the gutter rhythm */}
      <div
        className="min-w-0 flex-1 border-l pl-3.5 ml-[68px]"
        style={{ borderLeftColor: hairlineColor }}
      >
        {isEditing ? (
          <>
            <Textarea
              value={draftBody}
              onChange={(event) => setDraftBody(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                  return;
                }
                if (event.key === "Enter" && event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  saveEdit();
                }
              }}
              autoFocus
              aria-label="Edit inline comment body. Markdown supported. Shift Enter saves."
              className="min-h-20 resize-y rounded-none border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-3.5 py-3 font-voice text-[13px] leading-[1.5] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)] focus-visible:border-[var(--rd-vermillion-line)] focus-visible:ring-0 focus-visible:outline-none"
            />
            <div className="mt-2 flex items-stretch justify-end gap-0 border border-[var(--rd-hair)] w-fit ml-auto divide-x divide-[var(--rd-hair)]">
              <SlabButton variant="default" size="sm" onClick={cancelEdit}>
                cancel
              </SlabButton>
              <SlabButton
                variant="primary"
                size="sm"
                onClick={saveEdit}
                disabled={!draftBody.trim() || draftBody.trim() === comment.body}
              >
                save
              </SlabButton>
            </div>
          </>
        ) : (
          <>
            <MarkdownView
              className="rd-voice text-[13px] leading-[1.5] text-[var(--rd-cream)] [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-[var(--rd-cream)] [&_code]:bg-transparent [&_code]:px-0"
              compact
            >
              {comment.body}
            </MarkdownView>
            <div className="mt-1.5 font-sans text-[10.5px] text-[var(--rd-pencil)]">
              — {lineRangeLabel(comment)}
              {isPrivate ? (
                <>
                  {" · "}
                  <span className="font-voice font-medium text-[var(--rd-vermillion-2)]">
                    private
                  </span>
                </>
              ) : (
                " · review"
              )}
            </div>

            {/* Hover-reveal action group, anchored to the top-right of the body */}
            <div className="absolute right-6 top-3 flex border border-[var(--rd-hair-2)] divide-x divide-[var(--rd-hair-2)] opacity-0 transition-opacity duration-150 group-hover/note:opacity-100">
              <SlabButton variant="default" size="sm" onClick={startEdit} aria-label="Edit inline comment">
                edit
              </SlabButton>
              <SlabButton variant="danger" size="sm" onClick={onDelete} aria-label="Delete inline comment">
                delete
              </SlabButton>
            </div>
          </>
        )}
      </div>
    </div>
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

function groupThreadsByAnchor(threads: ReviewThread[] | undefined): ThreadsByAnchor {
  const grouped: ThreadsByAnchor = new Map();
  for (const thread of threads ?? []) {
    if (thread.isOutdated || thread.line === null || thread.line === undefined) {
      continue;
    }
    const key = threadAnchorKey(thread.path, thread.diffSide, thread.line);
    const bucket = grouped.get(key) ?? [];
    bucket.push(thread);
    grouped.set(key, bucket);
  }
  return grouped;
}

function threadAnchorKey(path: string, diffSide: string, line: number) {
  return `${path}\u0000${diffSide}\u0000${line}`;
}

function threadsForUnified(
  threadsByAnchor: ThreadsByAnchor,
  filePath: string,
  line: DiffLine,
  anchor: LineAnchor,
): ReviewThread[] {
  const wantNew = anchor.side === "new" && line.newLine !== null && line.newLine !== undefined;
  const wantOld = anchor.side === "old" && line.oldLine !== null && line.oldLine !== undefined;
  if (wantNew) {
    return threadsByAnchor.get(threadAnchorKey(filePath, "RIGHT", line.newLine!)) ?? [];
  }
  if (wantOld) {
    return threadsByAnchor.get(threadAnchorKey(filePath, "LEFT", line.oldLine!)) ?? [];
  }
  return [];
}

function threadsForRow(
  threadsByAnchor: ThreadsByAnchor,
  filePath: string,
  row: SplitDisplayRow,
): ReviewThread[] {
  const matches: ReviewThread[] = [];
  if (row.new?.line.newLine !== null && row.new?.line.newLine !== undefined) {
    matches.push(
      ...(threadsByAnchor.get(threadAnchorKey(filePath, "RIGHT", row.new.line.newLine)) ?? []),
    );
  }
  if (row.old?.line.oldLine !== null && row.old?.line.oldLine !== undefined) {
    matches.push(
      ...(threadsByAnchor.get(threadAnchorKey(filePath, "LEFT", row.old.line.oldLine)) ?? []),
    );
  }
  return matches;
}
