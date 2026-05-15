import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Columns2,
  Copy,
  Eye,
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
import { compactPath } from "@/lib/format";
import { highlightCodeLine } from "@/lib/syntax-highlight";
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
  onScrollHandled: () => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onSaveInlineComment: (fileId: string, comment: InlineComment) => void;
  onDeleteInlineComment: (fileId: string, commentId: string) => void;
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

export function DiffCanvas({
  file,
  fileState,
  jumpTarget,
  onScrollHandled,
  onMarkViewed,
  onMarkReviewed,
  onSaveInlineComment,
  onDeleteInlineComment,
}: DiffCanvasProps) {
  const [viewMode, setViewMode] = useDiffViewMode();
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<InlineCommentVisibility>("review");
  const diffContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftTarget(null);
    setDraftBody("");
    setDraftVisibility("review");
  }, [file?.id]);

  useEffect(() => {
    if (!jumpTarget || !file || jumpTarget.fileId !== file.id) {
      return;
    }
    if (jumpTarget.diffPosition === undefined) {
      onScrollHandled();
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
  const isViewed = status === "viewed" || isReviewed;
  const isOneSided = file.changeKind === "added" || file.changeKind === "deleted";
  const effectiveMode: DiffViewMode = isOneSided ? "unified" : viewMode;
  const inlineComments = fileState?.inlineComments ?? [];
  const currentFile = file;

  function openInlineComposer(anchor: LineAnchor, extendSelection: boolean) {
    setDraftTarget((current) => {
      if (extendSelection && current?.side === anchor.side) {
        return extendTarget(current, anchor);
      }
      setDraftBody("");
      setDraftVisibility("review");
      return targetFromAnchor(anchor);
    });
  }

  function saveDraftComment() {
    const body = draftBody.trim();
    if (!draftTarget || !body) {
      return;
    }
    const now = new Date().toISOString();
    onSaveInlineComment(currentFile.id, {
      id: createCommentId(),
      fileId: currentFile.id,
      path: currentFile.path,
      side: draftTarget.side,
      startDiffPosition: draftTarget.startDiffPosition,
      endDiffPosition: draftTarget.endDiffPosition,
      startLine: draftTarget.startLine,
      endLine: draftTarget.endLine,
      body,
      visibility: draftVisibility,
      createdAt: now,
      updatedAt: now,
    });
    setDraftTarget(null);
    setDraftBody("");
    setDraftVisibility("review");
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-mono text-[12px] font-medium text-[var(--rd-cream)]">
              {compactPath(file.path, 92)}
            </h2>
            <span className="rd-display-italic text-[11px] text-[var(--rd-pencil)]">
              {file.changeKind}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] text-[var(--rd-pencil)]">
            <span className="text-[var(--rd-add)]">+{file.additions}</span>
            <span className="text-[var(--rd-del)]">−{file.deletions}</span>
            {file.oldPath ? <span>← {compactPath(file.oldPath, 56)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
            {isViewed ? "Viewed" : "Mark Viewed"}
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
            {isReviewed ? "Reviewed" : "Mark Reviewed"}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
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
                {hunk.lines.map((line, lineIndex) => {
                  const anchor = getLineAnchor(line, file.changeKind, hunkIndex, lineIndex);
                  const lineComments = inlineComments.filter(
                    (comment) => comment.endDiffPosition === anchor.diffPosition,
                  );

                  return (
                    <Fragment key={`${hunk.header}-${lineIndex}-${anchor.diffPosition}`}>
                      {effectiveMode === "split" && !isOneSided ? (
                        <SplitRow
                          line={line}
                          anchor={anchor}
                          selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                          onAddComment={openInlineComposer}
                        />
                      ) : (
                        <UnifiedRow
                          line={line}
                          anchor={anchor}
                          changeKind={file.changeKind}
                          selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                          onAddComment={openInlineComposer}
                        />
                      )}
                      {draftTarget?.endDiffPosition === anchor.diffPosition ? (
                        <InlineCommentComposer
                          target={draftTarget}
                          body={draftBody}
                          visibility={draftVisibility}
                          onBodyChange={setDraftBody}
                          onVisibilityChange={setDraftVisibility}
                          onSave={saveDraftComment}
                          onCancel={() => {
                            setDraftTarget(null);
                            setDraftBody("");
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

function SplitRow({
  line,
  anchor,
  selected,
  onAddComment,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
}) {
  const isAddition = line.kind === "addition";
  const isDeletion = line.kind === "deletion";
  const marker = isAddition ? "+" : isDeletion ? "−" : " ";

  const oldAnchor: LineAnchor = { ...anchor, side: "old", lineNumber: line.oldLine };
  const newAnchor: LineAnchor = { ...anchor, side: "new", lineNumber: line.newLine };

  return (
    <div
      data-anchor={anchor.diffPosition}
      className={[
        "group grid min-h-6 grid-cols-[56px_minmax(0,1fr)_56px_minmax(0,1fr)] border-b border-[var(--rd-hair)] font-mono text-[12px] leading-6",
        isAddition ? "bg-[var(--rd-add-bg)]" : "",
        isDeletion ? "bg-[var(--rd-del-bg)]" : "",
        selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-vermillion-line)]" : "",
      ].join(" ")}
    >
      <LineNumber value={line.oldLine} hot={isDeletion} tone="del" />
      <CodeCell
        muted={isAddition}
        hot={isDeletion}
        marker={marker}
        onAddComment={isAddition ? undefined : (extend) => onAddComment(oldAnchor, extend)}
      >
        {isAddition ? "" : line.content}
      </CodeCell>
      <LineNumber value={line.newLine} hot={isAddition} tone="add" />
      <CodeCell
        muted={isDeletion}
        hot={isAddition}
        marker={marker}
        onAddComment={isDeletion ? undefined : (extend) => onAddComment(newAnchor, extend)}
      >
        {isDeletion ? "" : line.content}
      </CodeCell>
    </div>
  );
}

function UnifiedRow({
  line,
  anchor,
  changeKind,
  selected,
  onAddComment,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  changeKind: ReviewFile["changeKind"];
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
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
        onAddComment={(extend) => onAddComment(lineAnchor, extend)}
      >
        {line.content}
      </CodeCell>
    </div>
  );
}

function InlineCommentComposer({
  target,
  body,
  visibility,
  onBodyChange,
  onVisibilityChange,
  onSave,
  onCancel,
}: {
  target: CommentTarget;
  body: string;
  visibility: InlineCommentVisibility;
  onBodyChange: (value: string) => void;
  onVisibilityChange: (value: InlineCommentVisibility) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
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
        onChange={(event) => onBodyChange(event.currentTarget.value)}
        autoFocus
        placeholder="Write a comment for this line."
        className="min-h-24 resize-y border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-0.5">
          <CommentModeButton
            active={visibility === "private"}
            icon={<NotebookPen className="size-3.5" />}
            label="Private"
            onClick={() => onVisibilityChange("private")}
          />
          <CommentModeButton
            active={visibility === "review"}
            icon={<MessageSquare className="size-3.5" />}
            label="Review"
            onClick={() => onVisibilityChange("review")}
          />
        </div>
        <Button
          type="button"
          size="xs"
          className="h-7 rounded-md bg-[var(--rd-cream)] px-3 text-[11px] text-[var(--rd-ink)] hover:bg-white"
          disabled={!body.trim()}
          onClick={onSave}
        >
          Add comment
        </Button>
      </div>
    </div>
  );
}

function InlineCommentCard({
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
          <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-[var(--rd-cream-2)]">
            {comment.body}
          </p>
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
}

function CommentModeButton({
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
}

function LineNumber({
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
}

function CodeCell({
  children,
  muted,
  hot,
  marker,
  onAddComment,
}: {
  children: string;
  muted: boolean;
  hot: boolean;
  marker: string;
  onAddComment?: (extendSelection: boolean) => void;
}) {
  const canComment = Boolean(children && onAddComment);

  return (
    <div
      className={[
        "relative grid min-w-0 grid-cols-[28px_minmax(0,1fr)]",
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
        onClick={(event) => onAddComment?.(event.shiftKey)}
        title={
          canComment
            ? "Add line comment. Shift-click another line to select a range."
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
      <div className="min-w-0 whitespace-pre-wrap break-words px-3">
        {children ? highlightCodeLine(children) : null}
      </div>
      {hot ? (
        <Copy className="absolute right-2 top-1.5 size-3 text-[var(--rd-pencil)] opacity-0 group-hover:opacity-100" />
      ) : null}
    </div>
  );
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
