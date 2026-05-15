import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  FileDiff,
  GitCommitHorizontal,
  MessageSquare,
  NotebookPen,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { compactPath } from "@/lib/format";
import { statusTone } from "@/lib/status";
import { highlightCodeLine } from "@/lib/syntax-highlight";
import type {
  DiffLine,
  InlineComment,
  InlineCommentSide,
  InlineCommentVisibility,
  ReviewFile,
  SessionFileState,
} from "@/types/review";

type DiffCanvasProps = {
  file: ReviewFile | null;
  fileState: SessionFileState | null;
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
  onMarkViewed,
  onMarkReviewed,
  onSaveInlineComment,
  onDeleteInlineComment,
}: DiffCanvasProps) {
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<InlineCommentVisibility>("review");

  useEffect(() => {
    setDraftTarget(null);
    setDraftBody("");
    setDraftVisibility("review");
  }, [file?.id]);

  if (!file) {
    return (
      <section className="grid h-full place-items-center bg-[var(--rd-bg)]">
        <div className="text-center">
          <FileDiff className="mx-auto size-10 text-[var(--rd-faint)]" />
          <div className="mt-4 text-sm font-medium text-[var(--rd-text-soft)]">
            No file selected
          </div>
          <div className="mt-1 text-xs text-[var(--rd-faint)]">
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
    <section className="flex h-full min-h-0 flex-col bg-[var(--rd-bg)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--rd-border)] bg-[rgba(19,17,13,0.94)] px-3 shadow-[inset_0_1px_0_rgba(255,236,190,0.035)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileDiff className="size-3.5 text-[var(--rd-faint)]" />
            <h2 className="truncate text-[0.83rem] font-semibold tracking-tight text-[var(--rd-text)]">
              {compactPath(file.path, 92)}
            </h2>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[0.68rem] text-[var(--rd-muted)]">
            <GitCommitHorizontal className="size-3" />
            <span>{file.changeKind}</span>
            <span className="text-[var(--rd-sage)]">+{file.additions}</span>
            <span className="text-[var(--rd-clay)]">-{file.deletions}</span>
            {file.oldPath ? <span>from {compactPath(file.oldPath, 56)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Badge className={`border ${statusTone(status)}`}>{statusLabel(status)}</Badge>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-7 rounded-lg border-[var(--rd-border)] bg-[var(--rd-panel-2)] px-2 text-[0.72rem] text-[var(--rd-muted)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-text)] active:translate-y-px"
            onClick={onMarkViewed}
          >
            <Eye className="size-3.5 text-[var(--rd-sage)]" />
            {isViewed ? "Viewed" : "Mark Viewed"}
          </Button>
          <Button
            type="button"
            size="xs"
            className={
              isReviewed
                ? "h-7 rounded-lg bg-[var(--rd-accent)] px-2 text-[var(--rd-ink)] hover:bg-[var(--rd-accent-strong)] active:translate-y-px"
                : "h-7 rounded-lg bg-[var(--rd-text-soft)] px-2 text-[var(--rd-ink)] hover:bg-[var(--rd-text)] active:translate-y-px"
            }
            onClick={onMarkReviewed}
          >
            <CheckCircle2 className="size-3.5" />
            {isReviewed ? "Reviewed" : "Mark Reviewed"}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-0 p-3">
          <div className="overflow-hidden rounded-lg border border-[var(--rd-border)] bg-[var(--rd-panel)] shadow-[inset_0_1px_0_rgba(255,236,190,0.035),0_18px_55px_rgba(0,0,0,0.28)]">
            <div
              className={[
                "grid border-b border-[var(--rd-border)] bg-[var(--rd-panel-2)] px-0 py-1.5 text-[0.64rem] uppercase tracking-[0.14em] text-[var(--rd-muted)]",
                isOneSided
                  ? "grid-cols-[72px_minmax(0,1fr)]"
                  : "grid-cols-[64px_minmax(0,1fr)_64px_minmax(0,1fr)]",
              ].join(" ")}
            >
              {isOneSided ? (
                <>
                  <div className="px-3">
                    {file.changeKind === "deleted" ? "Old" : "New"}
                  </div>
                  <div className="px-3">
                    {file.changeKind === "deleted" ? "Deleted Content" : "Added Content"}
                  </div>
                </>
              ) : (
                <>
                  <div className="px-3">Old</div>
                  <div className="px-3">Before</div>
                  <div className="px-3">New</div>
                  <div className="px-3">After</div>
                </>
              )}
            </div>
            {file.hunks.map((hunk, hunkIndex) => (
              <div key={`${file.id}-${hunk.header}`}>
                <div className="border-y border-[var(--rd-border)] bg-[var(--rd-accent-soft)] px-3 py-1.5 font-mono text-[var(--rd-accent-strong)]">
                  {hunk.header}
                </div>
                {hunk.lines.map((line, lineIndex) => {
                  const anchor = getLineAnchor(
                    line,
                    file.changeKind,
                    hunkIndex,
                    lineIndex,
                  );
                  const lineComments = inlineComments.filter(
                    (comment) => comment.endDiffPosition === anchor.diffPosition,
                  );

                  return (
                    <Fragment
                      key={`${hunk.header}-${lineIndex}-${anchor.diffPosition}`}
                    >
                      <DiffRow
                        line={line}
                        anchor={anchor}
                        oneSided={isOneSided}
                        changeKind={file.changeKind}
                        selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                        onAddComment={openInlineComposer}
                      />
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

function DiffRow({
  line,
  anchor,
  oneSided,
  changeKind,
  selected,
  onAddComment,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  oneSided: boolean;
  changeKind: ReviewFile["changeKind"];
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
}) {
  const isAddition = line.kind === "addition";
  const isDeletion = line.kind === "deletion";
  const marker = isAddition ? "+" : isDeletion ? "-" : " ";

  if (oneSided) {
    const lineNumber = changeKind === "deleted" ? line.oldLine : line.newLine;

    return (
      <div
        className={[
          "group grid min-h-6 grid-cols-[72px_minmax(0,1fr)] border-b border-[rgba(222,193,128,0.055)] font-mono text-[0.76rem] leading-6",
          isAddition ? "bg-[var(--rd-sage-soft)]" : "",
          isDeletion ? "bg-[var(--rd-clay-soft)]" : "",
          selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-accent-border)]" : "",
        ].join(" ")}
      >
        <LineNumber
          value={lineNumber}
          hot={isAddition || isDeletion}
          tone={isDeletion ? "clay" : "sage"}
        />
        <CodeCell
          muted={false}
          hot={isAddition || isDeletion}
          marker={marker}
          onAddComment={(extend) => onAddComment(anchor, extend)}
        >
          {line.content}
        </CodeCell>
      </div>
    );
  }

  const oldAnchor: LineAnchor = {
    ...anchor,
    side: "old",
    lineNumber: line.oldLine,
  };
  const newAnchor: LineAnchor = {
    ...anchor,
    side: "new",
    lineNumber: line.newLine,
  };

  return (
    <div
      className={[
        "group grid min-h-6 grid-cols-[64px_minmax(0,1fr)_64px_minmax(0,1fr)] border-b border-[rgba(222,193,128,0.055)] font-mono text-[0.76rem] leading-6",
        isAddition ? "bg-[var(--rd-sage-soft)]" : "",
        isDeletion ? "bg-[var(--rd-clay-soft)]" : "",
        selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-accent-border)]" : "",
      ].join(" ")}
    >
      <LineNumber value={line.oldLine} hot={isDeletion} tone="clay" />
      <CodeCell
        muted={isAddition}
        hot={isDeletion}
        marker={marker}
        onAddComment={
          isAddition ? undefined : (extend) => onAddComment(oldAnchor, extend)
        }
      >
        {isAddition ? "" : line.content}
      </CodeCell>
      <LineNumber value={line.newLine} hot={isAddition} tone="sage" />
      <CodeCell
        muted={isDeletion}
        hot={isAddition}
        marker={marker}
        onAddComment={
          isDeletion ? undefined : (extend) => onAddComment(newAnchor, extend)
        }
      >
        {isDeletion ? "" : line.content}
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
    <div className="border-b border-[var(--rd-border)] bg-[rgba(19,17,13,0.98)] px-3 py-3">
      <div className="ml-9 max-w-3xl rounded-lg border border-[var(--rd-border)] bg-[var(--rd-bg)] p-3 shadow-[0_16px_45px_rgba(0,0,0,0.22)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-[var(--rd-text-soft)]">
            Comment on {lineRangeLabel(target)}
          </div>
          <button
            type="button"
            className="grid size-6 place-items-center rounded-md text-[var(--rd-faint)] hover:bg-[var(--rd-panel-2)] hover:text-[var(--rd-text)]"
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
          className="min-h-24 resize-y border-[var(--rd-border)] bg-[var(--rd-panel)] text-sm text-[var(--rd-text)] placeholder:text-[var(--rd-faint)]"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex rounded-lg border border-[var(--rd-border)] bg-[var(--rd-panel)] p-0.5">
            <CommentModeButton
              active={visibility === "private"}
              icon={<NotebookPen className="size-3.5" />}
              label="Private"
              onClick={() => onVisibilityChange("private")}
            />
            <CommentModeButton
              active={visibility === "review"}
              icon={<MessageSquare className="size-3.5" />}
              label="Review bucket"
              onClick={() => onVisibilityChange("review")}
            />
          </div>
          <Button
            type="button"
            size="xs"
            className="h-7 rounded-lg bg-[var(--rd-accent)] px-2 text-[var(--rd-ink)] hover:bg-[var(--rd-accent-strong)]"
            disabled={!body.trim()}
            onClick={onSave}
          >
            Add comment
          </Button>
        </div>
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
    <div className="border-b border-[var(--rd-border)] bg-[rgba(19,17,13,0.96)] px-3 py-2">
      <div className="ml-9 max-w-3xl rounded-lg border border-[var(--rd-border)] bg-[var(--rd-panel)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[var(--rd-muted)]">
              {isPrivate ? (
                <NotebookPen className="size-3.5 text-[var(--rd-muted)]" />
              ) : (
                <MessageSquare className="size-3.5 text-[var(--rd-accent)]" />
              )}
              {isPrivate ? "Private note" : "Review bucket"}
              <span className="normal-case tracking-normal text-[var(--rd-faint)]">
                {lineRangeLabel(comment)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--rd-text-soft)]">
              {comment.body}
            </p>
          </div>
          <button
            type="button"
            className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--rd-faint)] hover:bg-[var(--rd-bg)] hover:text-[var(--rd-clay)]"
            onClick={onDelete}
            aria-label="Delete inline comment"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
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
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.72rem] transition-colors",
        active
          ? "bg-[var(--rd-accent)] text-[var(--rd-ink)]"
          : "text-[var(--rd-muted)] hover:bg-[var(--rd-panel-2)] hover:text-[var(--rd-text)]",
      ].join(" ")}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "reviewed":
      return "reviewed";
    case "viewed":
      return "viewed";
    case "changedSinceReviewed":
      return "changed after review";
    case "changedSinceViewed":
      return "changed after view";
    case "unseen":
    default:
      return "unseen";
  }
}

function LineNumber({
  value,
  hot,
  tone,
}: {
  value?: number | null;
  hot: boolean;
  tone: "clay" | "sage";
}) {
  return (
    <div
      className={[
        "select-none border-r border-[rgba(222,193,128,0.055)] px-3 text-right text-[0.68rem]",
        hot && tone === "clay" ? "text-[var(--rd-clay)]" : "",
        hot && tone === "sage" ? "text-[var(--rd-sage)]" : "",
        !hot ? "text-[var(--rd-faint)]" : "",
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
        "relative grid min-w-0 grid-cols-[32px_minmax(0,1fr)] text-[var(--rd-text-soft)]",
        muted ? "text-[var(--rd-faint)]" : "",
        hot ? "text-[var(--rd-text)]" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className={[
          "group/marker relative flex min-h-6 w-8 shrink-0 select-none items-start justify-center border-r border-[rgba(222,193,128,0.035)] text-[var(--rd-faint)] focus-visible:bg-[var(--rd-panel-3)] focus-visible:text-[var(--rd-accent)] focus-visible:outline-none",
          canComment
            ? "cursor-pointer hover:bg-[var(--rd-panel-3)] hover:text-[var(--rd-accent)]"
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
            "leading-6 transition-colors",
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
        <Copy className="absolute right-2 top-1.5 size-3 text-[var(--rd-faint)] opacity-0 transition-opacity group-hover:opacity-100" />
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
