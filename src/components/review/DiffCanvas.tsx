import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  CornerUpLeft,
  Copy,
  FileDiff,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useDiffViewMode, type DiffViewMode } from "@/hooks/use-diff-view-mode";
import { isShortcutTextEntryTarget } from "@/hooks/use-keybinding";
import { copyTextFromSelectedDiffCells } from "@/lib/diff-copy";
import { compactPath, pathParts } from "@/lib/format";
import { tokenizeCodeLine, type CodeToken } from "@/lib/syntax-highlight";
import { SlabButton } from "@/components/ui/slab-button";
import { SlabToggleGroup } from "@/components/ui/slab-toggle-group";
import { MarkdownView } from "@/components/review/MarkdownView";
import { ConversationBubble } from "@/components/review/ConversationBubble";
import { ConversationThread } from "@/components/review/ConversationThread";
import { loadReviewAssetPreview } from "@/lib/review-session";
import {
  hasThreadReplyDrafts,
  normalizeThreadReplyDrafts,
  normalizeThreadReplyMap,
} from "@/lib/thread-reply-drafts";
import type { ReviewThread } from "@/types/github";
import type {
  ReviewReferenceLookupRequest,
  ReviewReferenceLookupResult,
  ReviewReferenceStatus,
  ReviewReferenceTarget,
} from "@/types/references";
import type {
  DiffLine,
  InlineComment,
  InlineCommentSide,
  InlineCommentVisibility,
  ReviewAssetPreview,
  ReviewAssetSide,
  ReviewFile,
  SessionFileState,
} from "@/types/review";

type JumpTarget = {
  fileId: string;
  diffPosition?: number;
  expandSection?: "private";
  reference?: {
    lineNumber: number;
    column: number;
    length: number;
    symbol: string;
  };
  requestedAt: number;
};

type DiffCanvasProps = {
  repoRoot: string | null;
  diffTarget: string | null;
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  jumpTarget: JumpTarget | null;
  referenceStatus: ReviewReferenceStatus;
  referenceWarnings: string[];
  referenceError: string | null;
  referenceBackCount: number;
  findRequestId: number | null;
  selectAllRequestId: number | null;
  supportsReviewComments: boolean;
  centerMode: "diff" | "map";
  onCenterModeChange: (mode: "diff" | "map") => void;
  onScrollHandled: () => void;
  onFindReferences: (
    origin: ReviewReferenceLookupRequest,
  ) => ReviewReferenceLookupResult;
  onJumpToReference: (
    target: ReviewReferenceTarget,
    origin: ReviewReferenceLookupRequest,
  ) => void;
  onReferenceBack: () => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onOpenFile: () => void;
  onSaveInlineComment: (fileId: string, comment: InlineComment) => void;
  onDeleteInlineComment: (fileId: string, commentId: string) => void;
  threads?: ReviewThread[];
  expandedThreadId?: string | null;
  onExpandThread?: (id: string | null) => void;
  onReplyThread?: (fileId: string, threadId: string, body: string) => void;
  onDeleteThreadReply?: (fileId: string, threadId: string, draftId?: string) => void;
};

type LineAnchor = {
  diffPosition: number;
  side: InlineCommentSide;
  lineNumber?: number | null;
};

type CodeReferenceLine = Omit<
  ReviewReferenceLookupRequest,
  "symbol" | "column" | "length"
>;

type ReferencePanelState = {
  origin: ReviewReferenceLookupRequest;
  result: ReviewReferenceLookupResult | null;
  requestedAt: number;
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

type FindMatch = {
  id: string;
  diffPosition: number;
  start: number;
  length: number;
};

type FindRenderState = {
  query: string;
  diffPosition: number;
  activeMatch: FindMatch | null;
};

type ThreadsByAnchor = Map<string, ReviewThread[]>;

type SplitDisplayRow = {
  key: string;
  old?: AnchoredDiffLine;
  new?: AnchoredDiffLine;
};

const EMPTY_INLINE_COMMENTS: InlineComment[] = [];
const DIFF_KEY_SCROLL_STEP = 24;
const MAX_REFERENCE_ROWS = 80;
const REFERENCE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
]);

export const DiffCanvas = memo(function DiffCanvas({
  repoRoot,
  diffTarget,
  file,
  fileState,
  jumpTarget,
  referenceStatus,
  referenceWarnings,
  referenceError,
  referenceBackCount,
  findRequestId,
  selectAllRequestId,
  supportsReviewComments,
  centerMode,
  onCenterModeChange,
  onScrollHandled,
  onFindReferences,
  onJumpToReference,
  onReferenceBack,
  onMarkViewed,
  onMarkReviewed,
  onOpenFile,
  onSaveInlineComment,
  onDeleteInlineComment,
  threads,
  expandedThreadId,
  onExpandThread,
  onReplyThread,
  onDeleteThreadReply,
}: DiffCanvasProps) {
  const [viewMode, setViewMode] = useDiffViewMode();
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null);
  const [referencePanel, setReferencePanel] = useState<ReferencePanelState | null>(null);
  const [isLineSelectionDragging, setIsLineSelectionDragging] = useState(false);
  const [assetPreview, setAssetPreview] = useState<ReviewAssetPreview | null>(null);
  const [assetPreviewStatus, setAssetPreviewStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [assetPreviewError, setAssetPreviewError] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const lineSelectionDragRef = useRef(false);
  const shouldPreviewImageAsset = Boolean(
    file &&
      repoRoot &&
      diffTarget &&
      file.hunks.length === 0 &&
      isPreviewableImagePath(file.path),
  );

  useEffect(() => {
    setDraftTarget(null);
    setReferencePanel(null);
    setIsLineSelectionDragging(false);
    lineSelectionDragRef.current = false;
    const viewport = scrollViewportRef.current;
    viewport?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    viewport?.focus({ preventScroll: true });
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
    target.scrollIntoView({ block: "center", behavior: "instant" });
    // Force animation restart in case the class is still attached from a prior jump.
    target.classList.remove("rd-jump-flash");
    void target.offsetWidth;
    target.classList.add("rd-jump-flash");
    const symbolTarget = jumpTarget.reference
      ? target.querySelector<HTMLElement>(
          `[data-reference-column="${jumpTarget.reference.column}"][data-reference-length="${jumpTarget.reference.length}"]`,
        )
      : null;
    symbolTarget?.classList.remove("rd-symbol-flash");
    if (symbolTarget) {
      void symbolTarget.offsetWidth;
      symbolTarget.classList.add("rd-symbol-flash");
    }
    const flashTimer = window.setTimeout(() => {
      target.classList.remove("rd-jump-flash");
      symbolTarget?.classList.remove("rd-symbol-flash");
    }, 900);
    onScrollHandled();
    return () => {
      window.clearTimeout(flashTimer);
      target.classList.remove("rd-jump-flash");
      symbolTarget?.classList.remove("rd-symbol-flash");
    };
  }, [jumpTarget, file, onScrollHandled]);

  useEffect(() => {
    if (!file || !repoRoot || !diffTarget || !shouldPreviewImageAsset) {
      setAssetPreview(null);
      setAssetPreviewStatus("idle");
      setAssetPreviewError(null);
      return;
    }

    let cancelled = false;
    setAssetPreview(null);
    setAssetPreviewStatus("loading");
    setAssetPreviewError(null);
    void loadReviewAssetPreview({
      repoPath: repoRoot,
      filePath: file.path,
      oldPath: file.oldPath ?? null,
      changeKind: file.changeKind,
      diffTarget,
    })
      .then((preview) => {
        if (cancelled) return;
        setAssetPreview(preview);
        setAssetPreviewStatus("idle");
      })
      .catch((caught) => {
        if (cancelled) return;
        setAssetPreview(null);
        setAssetPreviewStatus("error");
        setAssetPreviewError(caught instanceof Error ? caught.message : String(caught));
      });

    return () => {
      cancelled = true;
    };
  }, [diffTarget, file, repoRoot, shouldPreviewImageAsset]);

  useEffect(() => {
    if (!referencePanel || referencePanel.result || referenceStatus !== "ready") {
      return;
    }
    setReferencePanel((current) =>
      current && current.requestedAt === referencePanel.requestedAt
        ? { ...current, result: onFindReferences(current.origin) }
        : current,
    );
  }, [onFindReferences, referencePanel, referenceStatus]);

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
  const findMatches = useMemo(
    () => buildFindMatches(file, findQuery),
    [file, findQuery],
  );
  const activeFindMatch =
    findMatches.length > 0
      ? findMatches[Math.min(activeFindIndex, findMatches.length - 1)]
      : null;

  useEffect(() => {
    if (findRequestId === null) {
      return;
    }
    setFindOpen(true);
    window.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, [findRequestId]);

  useEffect(() => {
    if (selectAllRequestId === null) {
      return;
    }
    selectAllDiffCodeCells(
      diffContainerRef.current,
      file?.changeKind === "deleted" ? "old" : "new",
    );
    scrollViewportRef.current?.focus({ preventScroll: true });
  }, [file?.changeKind, selectAllRequestId]);

  useEffect(() => {
    setActiveFindIndex(0);
  }, [file?.id, findQuery]);

  useEffect(() => {
    if (activeFindIndex < findMatches.length || findMatches.length === 0) {
      return;
    }
    setActiveFindIndex(findMatches.length - 1);
  }, [activeFindIndex, findMatches.length]);

  useEffect(() => {
    if (!findOpen || !activeFindMatch) {
      return;
    }
    const container = diffContainerRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector<HTMLElement>(
      `[data-anchor="${activeFindMatch.diffPosition}"]`,
    );
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "instant" });
    target.classList.remove("rd-jump-flash");
    void target.offsetWidth;
    target.classList.add("rd-jump-flash");
    const flashTimer = window.setTimeout(() => {
      target.classList.remove("rd-jump-flash");
    }, 900);
    return () => {
      window.clearTimeout(flashTimer);
      target.classList.remove("rd-jump-flash");
    };
  }, [activeFindMatch, findOpen]);

  const moveFindMatch = useCallback(
    (direction: 1 | -1) => {
      if (findMatches.length === 0) {
        return;
      }
      setActiveFindIndex((current) =>
        (current + direction + findMatches.length) % findMatches.length,
      );
    },
    [findMatches.length],
  );

  const handleDiffCopy = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
    const text = diffClipboardTextFromSelection(
      diffContainerRef.current,
      window.getSelection(),
    );
    if (text === null) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
  }, []);

  const handleDiffViewportKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        !event.defaultPrevented &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "a" &&
        !isShortcutTextEntryTarget(event.target)
      ) {
        event.preventDefault();
        selectAllDiffCodeCells(
          diffContainerRef.current,
          file?.changeKind === "deleted" ? "old" : "new",
        );
        return;
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isShortcutTextEntryTarget(event.target)
      ) {
        return;
      }

      const viewport = event.currentTarget;
      const pageStep = Math.max(DIFF_KEY_SCROLL_STEP, viewport.clientHeight - 48);
      let nextTop: number | null = null;

      switch (event.key) {
        case "ArrowDown":
          nextTop = viewport.scrollTop + DIFF_KEY_SCROLL_STEP;
          break;
        case "ArrowUp":
          nextTop = viewport.scrollTop - DIFF_KEY_SCROLL_STEP;
          break;
        case "PageDown":
          nextTop = viewport.scrollTop + pageStep;
          break;
        case "PageUp":
          nextTop = viewport.scrollTop - pageStep;
          break;
        case "Home":
          nextTop = 0;
          break;
        case "End":
          nextTop = viewport.scrollHeight;
          break;
        default:
          return;
      }

      event.preventDefault();
      viewport.scrollTop = Math.max(
        0,
        Math.min(nextTop, viewport.scrollHeight - viewport.clientHeight),
      );
    },
    [file?.changeKind],
  );

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

  function openReferencePanel(origin: ReviewReferenceLookupRequest) {
    setReferencePanel({
      origin,
      result: referenceStatus === "ready" ? onFindReferences(origin) : null,
      requestedAt: Date.now(),
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
      <section className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
        <div className="flex shrink-0 items-stretch border-b border-[var(--rd-hair)] bg-black/15 pl-6 pr-2">
          <SlabToggleGroup aria-label="Center pane view mode">
            <SlabButton
              variant={centerMode === "diff" ? "active" : "default"}
              onClick={() => onCenterModeChange("diff")}
              aria-pressed={centerMode === "diff"}
              aria-label="Diff view"
            >
              diff
            </SlabButton>
            <SlabButton
              variant={centerMode === "map" ? "active" : "default"}
              onClick={() => onCenterModeChange("map")}
              aria-pressed={centerMode === "map"}
              aria-label="Review map view"
            >
              map
            </SlabButton>
          </SlabToggleGroup>
        </div>
        <div className="grid flex-1 place-items-center">
          <div className="text-center">
            <FileDiff className="mx-auto size-10 text-[var(--rd-pencil)]" />
            <div className="mt-4 font-voice text-[15px] text-[var(--rd-cream-2)]">
              no file selected
            </div>
            <div className="mt-1 font-mono text-[11px] text-[var(--rd-pencil)]">
              Pick a file from the review queue.
            </div>
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
      <div className="shrink-0 px-6 pt-3 pb-2.5 bg-[var(--rd-ink)]">
        <h2 className="truncate font-mono text-[13px] font-medium tracking-[-0.005em] text-[var(--rd-cream)]" title={file.path}>
          {displayPath.fileName}
        </h2>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap font-mono text-[10.5px] text-[var(--rd-pencil)]">
          <span className="font-voice font-medium text-[11px] lowercase tracking-[0.01em] text-[var(--rd-vermillion-2)]">
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
        <SlabToggleGroup aria-label="Center pane view mode">
          <SlabButton
            variant={centerMode === "diff" ? "active" : "default"}
            onClick={() => onCenterModeChange("diff")}
            aria-pressed={centerMode === "diff"}
            aria-label="Diff view"
          >
            diff
          </SlabButton>
          <SlabButton
            variant={centerMode === "map" ? "active" : "default"}
            onClick={() => onCenterModeChange("map")}
            aria-pressed={centerMode === "map"}
            aria-label="Review map view"
          >
            map
          </SlabButton>
        </SlabToggleGroup>

        <span className="self-stretch w-px bg-[var(--rd-hair)]" aria-hidden />

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

        <SlabButton
          variant="default"
          disabled={referenceBackCount === 0}
          onClick={onReferenceBack}
          aria-label="Back to previous reference"
          title="Back to previous reference: b"
        >
          <CornerUpLeft className="mr-1 size-3" />
          ref back
        </SlabButton>

        <span className="self-stretch w-px bg-[var(--rd-hair)]" aria-hidden />

        <SlabButton
          variant={findOpen ? "active" : "default"}
          onClick={() => {
            setFindOpen((current) => !current);
            window.requestAnimationFrame(() => {
              findInputRef.current?.focus();
              findInputRef.current?.select();
            });
          }}
          aria-pressed={findOpen}
          aria-label="Find in file"
          title="Find in file: Cmd/Ctrl + F"
        >
          <Search className="mr-1 size-3" />
          find
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

      {findOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-6 py-2">
          <div className="relative min-w-[240px] max-w-[520px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--rd-pencil)]" />
            <Input
              ref={findInputRef}
              type="search"
              value={findQuery}
              onChange={(event) => setFindQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setFindOpen(false);
                  scrollViewportRef.current?.focus({ preventScroll: true });
                  return;
                }
                if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                  return;
                }
                event.preventDefault();
                moveFindMatch(event.shiftKey ? -1 : 1);
              }}
              placeholder="Find in file"
              aria-label="Find in file"
              className="h-7 rounded-none border border-[var(--rd-hair)] bg-[var(--rd-ink)] pl-7 pr-2 font-mono text-[11px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)] focus-visible:border-[var(--rd-vermillion-line)] focus-visible:ring-0"
            />
          </div>
          <div className="w-20 text-right font-mono text-[10.5px] tabular-nums text-[var(--rd-pencil)]">
            {findQuery
              ? findMatches.length > 0
                ? `${Math.min(activeFindIndex + 1, findMatches.length)} / ${findMatches.length}`
                : "0 / 0"
              : ""}
          </div>
          <div className="flex items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]">
            <SlabButton
              size="compact"
              variant="default"
              disabled={findMatches.length === 0}
              onClick={() => moveFindMatch(-1)}
              aria-label="Previous match"
              title="Previous match: Shift + Enter"
            >
              <ChevronUp className="size-3" />
            </SlabButton>
            <SlabButton
              size="compact"
              variant="default"
              disabled={findMatches.length === 0}
              onClick={() => moveFindMatch(1)}
              aria-label="Next match"
              title="Next match: Enter"
            >
              <ChevronDown className="size-3" />
            </SlabButton>
            <SlabButton
              size="compact"
              variant="default"
              onClick={() => {
                setFindOpen(false);
                scrollViewportRef.current?.focus({ preventScroll: true });
              }}
              aria-label="Close find"
            >
              <X className="size-3" />
            </SlabButton>
          </div>
        </div>
      ) : null}

      <ScrollArea
        className="min-h-0 flex-1"
        viewportRef={scrollViewportRef}
        viewportProps={{
          "aria-label": `Diff for ${file.path}`,
          onCopy: handleDiffCopy,
          onKeyDown: handleDiffViewportKeyDown,
          role: "region",
          tabIndex: 0,
          style: { overscrollBehavior: "contain", scrollBehavior: "auto" },
        }}
      >
        <div className="min-w-0 px-4 py-4" ref={diffContainerRef}>
          <div className="overflow-hidden rounded-md bg-[var(--rd-ink-2)]">
            {file.hunks.length === 0 ? (
              <ImageAssetDiff
                file={file}
                preview={assetPreview}
                status={assetPreviewStatus}
                error={assetPreviewError}
                canPreview={shouldPreviewImageAsset}
              />
            ) : file.hunks.map((hunk, hunkIndex) => (
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
                            oldReferenceLine={row.old ? referenceLineForAnchor(file, row.old.anchor) : null}
                            newReferenceLine={row.new ? referenceLineForAnchor(file, row.new.anchor) : null}
                            findQuery={findQuery}
                            activeFindMatch={activeFindMatch}
                            selected={positions.some((position) =>
                              isTargetSelected(draftTarget, position),
                            )}
                            onAddComment={openInlineComposer}
                            onBeginSelection={beginInlineSelection}
                            onExtendSelection={extendInlineSelection}
                            onRequestReferences={openReferencePanel}
                          />
                          {referencePanel &&
                          positions.includes(referencePanel.origin.diffPosition) ? (
                            <ReferencePanel
                              panel={referencePanel}
                              status={referenceStatus}
                              warnings={referenceWarnings}
                              error={referenceError}
                              onClose={() => setReferencePanel(null)}
                              onJump={onJumpToReference}
                              onBack={onReferenceBack}
                              backCount={referenceBackCount}
                            />
                          ) : null}
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
                                localDraftReplies={normalizeThreadReplyDrafts(
                                  fileState?.threadReplies?.[t.id],
                                )}
                                onCollapse={() => onExpandThread?.(null)}
                                onReply={(id, body) =>
                                  onReplyThread?.(file.id, id, body)
                                }
                                onDeleteDraftReply={(id, draftId) =>
                                  onDeleteThreadReply?.(file.id, id, draftId)
                                }
                              />
                            ) : (
                              <ConversationBubble
                                key={t.id}
                                thread={t}
                                hasDraftReply={hasThreadReplyDrafts({
                                  [t.id]: fileState?.threadReplies?.[t.id],
                                })}
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
                            referenceLine={referenceLineForAnchor(file, {
                              ...anchor,
                              side:
                                line.kind === "deletion" || file.changeKind === "deleted"
                                  ? "old"
                                  : "new",
                              lineNumber:
                                line.kind === "deletion" || file.changeKind === "deleted"
                                  ? line.oldLine
                                  : line.newLine,
                            })}
                            findQuery={findQuery}
                            activeFindMatch={activeFindMatch}
                            selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                            onAddComment={openInlineComposer}
                            onBeginSelection={beginInlineSelection}
                            onExtendSelection={extendInlineSelection}
                            onRequestReferences={openReferencePanel}
                          />
                          {referencePanel?.origin.diffPosition === anchor.diffPosition ? (
                            <ReferencePanel
                              panel={referencePanel}
                              status={referenceStatus}
                              warnings={referenceWarnings}
                              error={referenceError}
                              onClose={() => setReferencePanel(null)}
                              onJump={onJumpToReference}
                              onBack={onReferenceBack}
                              backCount={referenceBackCount}
                            />
                          ) : null}
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
                                localDraftReplies={normalizeThreadReplyDrafts(
                                  fileState?.threadReplies?.[t.id],
                                )}
                                onCollapse={() => onExpandThread?.(null)}
                                onReply={(id, body) =>
                                  onReplyThread?.(file.id, id, body)
                                }
                                onDeleteDraftReply={(id, draftId) =>
                                  onDeleteThreadReply?.(file.id, id, draftId)
                                }
                              />
                            ) : (
                              <ConversationBubble
                                key={t.id}
                                thread={t}
                                hasDraftReply={hasThreadReplyDrafts({
                                  [t.id]: fileState?.threadReplies?.[t.id],
                                })}
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
    previous.repoRoot === next.repoRoot &&
    previous.diffTarget === next.diffTarget &&
    previous.file === next.file &&
    previous.jumpTarget === next.jumpTarget &&
    previous.referenceStatus === next.referenceStatus &&
    previous.referenceWarnings === next.referenceWarnings &&
    previous.referenceError === next.referenceError &&
    previous.referenceBackCount === next.referenceBackCount &&
    previous.findRequestId === next.findRequestId &&
    previous.selectAllRequestId === next.selectAllRequestId &&
    previous.supportsReviewComments === next.supportsReviewComments &&
    previous.centerMode === next.centerMode &&
    previous.onCenterModeChange === next.onCenterModeChange &&
    effectiveFileStatus(previous) === effectiveFileStatus(next) &&
    sameInlineComments(previous.fileState, next.fileState) &&
    sameThreadReplies(previous.fileState, next.fileState) &&
    previous.onScrollHandled === next.onScrollHandled &&
    previous.onFindReferences === next.onFindReferences &&
    previous.onJumpToReference === next.onJumpToReference &&
    previous.onReferenceBack === next.onReferenceBack &&
    previous.onMarkViewed === next.onMarkViewed &&
    previous.onMarkReviewed === next.onMarkReviewed &&
    previous.onOpenFile === next.onOpenFile &&
    previous.onSaveInlineComment === next.onSaveInlineComment &&
    previous.onDeleteInlineComment === next.onDeleteInlineComment &&
    previous.threads === next.threads &&
    previous.expandedThreadId === next.expandedThreadId &&
    previous.onExpandThread === next.onExpandThread &&
    previous.onReplyThread === next.onReplyThread &&
    previous.onDeleteThreadReply === next.onDeleteThreadReply
  );
}

function effectiveFileStatus(props: DiffCanvasProps) {
  return props.fileState?.status ?? props.file?.viewedStatus ?? "unseen";
}

function ImageAssetDiff({
  file,
  preview,
  status,
  error,
  canPreview,
}: {
  file: ReviewFile;
  preview: ReviewAssetPreview | null;
  status: "idle" | "loading" | "error";
  error: string | null;
  canPreview: boolean;
}) {
  if (!canPreview) {
    return (
      <div className="grid min-h-[220px] place-items-center border border-[var(--rd-hair)] px-6 py-10 text-center">
        <div>
          <FileDiff className="mx-auto size-8 text-[var(--rd-pencil)]" />
          <div className="mt-3 font-mono text-[12px] text-[var(--rd-cream-2)]">
            Binary file preview is not available for this file type.
          </div>
          <div className="mt-1 font-mono text-[10px] text-[var(--rd-pencil)]">
            {file.path}
          </div>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-[220px] place-items-center border border-[var(--rd-hair)] px-6 py-10 font-mono text-[12px] text-[var(--rd-pencil)]">
        Loading image preview...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="grid min-h-[220px] place-items-center border border-[var(--rd-hair)] px-6 py-10 text-center">
        <div>
          <div className="font-mono text-[12px] text-[var(--rd-del)]">
            Failed to load image preview.
          </div>
          <div className="mt-2 max-w-lg font-mono text-[10px] text-[var(--rd-pencil)]">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!preview || (!preview.old && !preview.new)) {
    return (
      <div className="grid min-h-[220px] place-items-center border border-[var(--rd-hair)] px-6 py-10 text-center">
        <div>
          <div className="font-mono text-[12px] text-[var(--rd-cream-2)]">
            No image data could be resolved for this file.
          </div>
          <div className="mt-1 font-mono text-[10px] text-[var(--rd-pencil)]">
            {preview?.message ?? file.path}
          </div>
        </div>
      </div>
    );
  }

  const sides = [preview.old, preview.new].filter(Boolean) as ReviewAssetSide[];
  return (
    <div className="border border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <div className="flex items-center justify-between border-b border-[var(--rd-hair)] px-4 py-2 font-mono text-[10px] text-[var(--rd-pencil)]">
        <span>{preview.mimeType}</span>
        <span>{sides.length === 2 ? "before / after" : file.changeKind}</span>
      </div>
      <div
        className={[
          "grid gap-0",
          sides.length === 2 ? "md:grid-cols-2" : "grid-cols-1",
        ].join(" ")}
      >
        {preview.old ? <ImageSidePreview side={preview.old} /> : null}
        {preview.new ? <ImageSidePreview side={preview.new} /> : null}
      </div>
    </div>
  );
}

function ImageSidePreview({ side }: { side: ReviewAssetSide }) {
  return (
    <figure className="border-b border-[var(--rd-hair)] last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <figcaption className="flex items-center justify-between border-b border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-4 py-2 font-mono text-[10px]">
        <span className="uppercase tracking-[0.14em] text-[var(--rd-vermillion-2)]">
          {side.label}
        </span>
        <span className="text-[var(--rd-pencil)]">{formatBytes(side.byteSize)}</span>
      </figcaption>
      <div className="grid min-h-[280px] place-items-center overflow-auto p-6">
        <div
          className="max-w-full rounded border border-[var(--rd-hair)] p-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            backgroundImage:
              "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
            backgroundSize: "16px 16px",
          }}
        >
          <img
            src={side.dataUrl}
            alt={`${side.label} preview of ${side.path}`}
            className="block max-h-[520px] max-w-full object-contain [image-rendering:auto]"
          />
        </div>
      </div>
    </figure>
  );
}

function isPreviewableImagePath(path: string) {
  return /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(path);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

function sameThreadReplies(
  previous: SessionFileState | null,
  next: SessionFileState | null,
) {
  if (previous?.threadReplies === next?.threadReplies) {
    return true;
  }

  const previousReplies = normalizeThreadReplyMap(previous?.threadReplies);
  const nextReplies = normalizeThreadReplyMap(next?.threadReplies);
  const previousKeys = Object.keys(previousReplies ?? {});
  const nextKeys = Object.keys(nextReplies ?? {});
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) => {
    const previousDrafts = previousReplies[key] ?? [];
    const nextDrafts = nextReplies[key] ?? [];
    if (previousDrafts.length !== nextDrafts.length) {
      return false;
    }
    return previousDrafts.every((draft, index) => {
      const nextDraft = nextDrafts[index];
      return (
        draft.id === nextDraft?.id &&
        draft.body === nextDraft?.body &&
        draft.updatedAt === nextDraft?.updatedAt
      );
    });
  });
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

function ReferencePanel({
  panel,
  status,
  warnings,
  error,
  backCount,
  onClose,
  onJump,
  onBack,
}: {
  panel: ReferencePanelState;
  status: ReviewReferenceStatus;
  warnings: string[];
  error: string | null;
  backCount: number;
  onClose: () => void;
  onJump: (
    target: ReviewReferenceTarget,
    origin: ReviewReferenceLookupRequest,
  ) => void;
  onBack: () => void;
}) {
  const references = panel.result?.references ?? [];
  const visibleReferences = references.slice(0, MAX_REFERENCE_ROWS);
  const grouped = groupReferenceTargets(visibleReferences);
  const visibleWarnings = [
    ...(panel.result?.warnings ?? warnings),
    ...(references.length > MAX_REFERENCE_ROWS
      ? [`Showing first ${MAX_REFERENCE_ROWS} references.`]
      : []),
  ].slice(0, 3);

  return (
    <div className="border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-6 py-3">
      <div className="ml-[68px] border-l border-[var(--rd-vermillion)] pl-3.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-voice text-[12px] text-[var(--rd-cream-2)]">
              references for{" "}
              <span className="font-mono text-[var(--rd-vermillion-2)]">
                {panel.origin.symbol}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[var(--rd-pencil)]">
              semantic TypeScript/JavaScript · current review files
            </div>
          </div>
          <div className="flex items-stretch border border-[var(--rd-hair)] divide-x divide-[var(--rd-hair)]">
            <SlabButton
              size="sm"
              variant="default"
              disabled={backCount === 0}
              onClick={onBack}
            >
              <CornerUpLeft className="size-3" />
              back
            </SlabButton>
            <SlabButton size="sm" variant="default" onClick={onClose}>
              close
            </SlabButton>
          </div>
        </div>

        {status === "loading" && !panel.result ? (
          <ReferencePanelMessage>indexing references...</ReferencePanelMessage>
        ) : null}
        {status === "error" ? (
          <ReferencePanelMessage tone="error">
            {error ?? "Reference index failed."}
          </ReferencePanelMessage>
        ) : null}
        {status === "ready" && references.length === 0 ? (
          <ReferencePanelMessage>
            no semantic references in changed review files.
          </ReferencePanelMessage>
        ) : null}

        {grouped.map((group) => (
          <section key={group.path} className="mt-2">
            <div className="mb-1 truncate font-mono text-[10.5px] text-[var(--rd-pencil)]">
              {compactPath(group.path, 72)}
            </div>
            <div className="space-y-1">
              {group.references.map((reference) => {
                const canJump = reference.diffPosition !== null;
                return (
                  <button
                    key={`${reference.path}:${reference.lineNumber}:${reference.column}`}
                    type="button"
                    disabled={!canJump}
                    onClick={() => onJump(reference, panel.origin)}
                    className={[
                      "grid w-full grid-cols-[72px_minmax(0,1fr)_112px] gap-2 border border-[var(--rd-hair)] px-2.5 py-1.5 text-left font-mono text-[11px]",
                      canJump
                        ? "text-[var(--rd-cream-2)] hover:border-[var(--rd-vermillion-line)] hover:bg-[var(--rd-ink-3)]"
                        : "cursor-not-allowed text-[var(--rd-pencil)] opacity-70",
                    ].join(" ")}
                  >
                    <span className="tabular-nums text-[var(--rd-vermillion-2)]">
                      line {reference.lineNumber}
                    </span>
                    <span className="truncate">{reference.lineText.trim()}</span>
                    <span className="text-right text-[10px] text-[var(--rd-pencil)]">
                      {canJump ? "jump" : "outside visible diff"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {visibleWarnings.length > 0 ? (
          <div className="mt-2 space-y-1">
            {visibleWarnings.map((warning) => (
              <div
                key={warning}
                className="font-mono text-[10px] text-[var(--rd-pencil)]"
              >
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReferencePanelMessage({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={[
        "border border-[var(--rd-hair)] px-3 py-2 font-mono text-[11px]",
        tone === "error" ? "text-[var(--rd-del)]" : "text-[var(--rd-pencil)]",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function groupReferenceTargets(references: ReviewReferenceTarget[]) {
  const groups: Array<{ path: string; references: ReviewReferenceTarget[] }> = [];
  const byPath = new Map<string, ReviewReferenceTarget[]>();
  for (const reference of references) {
    byPath.set(reference.path, [...(byPath.get(reference.path) ?? []), reference]);
  }
  for (const [path, items] of byPath) {
    groups.push({ path, references: items });
  }
  return groups;
}

const SplitRow = memo(function SplitRow({
  row,
  oldReferenceLine,
  newReferenceLine,
  findQuery,
  activeFindMatch,
  selected,
  onAddComment,
  onBeginSelection,
  onExtendSelection,
  onRequestReferences,
}: {
  row: SplitDisplayRow;
  oldReferenceLine: CodeReferenceLine | null;
  newReferenceLine: CodeReferenceLine | null;
  findQuery: string;
  activeFindMatch: FindMatch | null;
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
  onBeginSelection: (anchor: LineAnchor, extendSelection: boolean) => void;
  onExtendSelection: (anchor: LineAnchor) => void;
  onRequestReferences: (origin: ReviewReferenceLookupRequest) => void;
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
        copyable={Boolean(row.old)}
        copyLayout="split"
        copySide="old"
        diffPosition={row.old?.anchor.diffPosition}
        findQuery={findQuery}
        activeFindMatch={activeFindMatch}
        onAddComment={
          row.old ? (extend) => onAddComment(row.old!.anchor, extend) : undefined
        }
        onBeginSelection={
          row.old ? (extend) => onBeginSelection(row.old!.anchor, extend) : undefined
        }
        onExtendSelection={row.old ? () => onExtendSelection(row.old!.anchor) : undefined}
        referenceLine={oldReferenceLine}
        onRequestReferences={onRequestReferences}
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
        copyable={Boolean(row.new)}
        copyLayout="split"
        copySide="new"
        diffPosition={row.new?.anchor.diffPosition}
        findQuery={findQuery}
        activeFindMatch={activeFindMatch}
        onAddComment={
          row.new ? (extend) => onAddComment(row.new!.anchor, extend) : undefined
        }
        onBeginSelection={
          row.new ? (extend) => onBeginSelection(row.new!.anchor, extend) : undefined
        }
        onExtendSelection={row.new ? () => onExtendSelection(row.new!.anchor) : undefined}
        referenceLine={newReferenceLine}
        onRequestReferences={onRequestReferences}
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
  referenceLine,
  findQuery,
  activeFindMatch,
  selected,
  onAddComment,
  onBeginSelection,
  onExtendSelection,
  onRequestReferences,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  changeKind: ReviewFile["changeKind"];
  referenceLine: CodeReferenceLine | null;
  findQuery: string;
  activeFindMatch: FindMatch | null;
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
  onBeginSelection: (anchor: LineAnchor, extendSelection: boolean) => void;
  onExtendSelection: (anchor: LineAnchor) => void;
  onRequestReferences: (origin: ReviewReferenceLookupRequest) => void;
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
        copyable
        copyLayout="unified"
        copySide={lineSide}
        diffPosition={anchor.diffPosition}
        findQuery={findQuery}
        activeFindMatch={activeFindMatch}
        onAddComment={(extend) => onAddComment(lineAnchor, extend)}
        onBeginSelection={(extend) => onBeginSelection(lineAnchor, extend)}
        onExtendSelection={() => onExtendSelection(lineAnchor)}
        referenceLine={referenceLine}
        onRequestReferences={onRequestReferences}
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
  copyable,
  copyLayout,
  copySide,
  diffPosition,
  findQuery,
  activeFindMatch,
  onAddComment,
  onBeginSelection,
  onExtendSelection,
  referenceLine,
  onRequestReferences,
}: {
  children: string;
  muted: boolean;
  hot: boolean;
  marker: string;
  tone: "add" | "del" | "neutral";
  counterpart?: string;
  copyable: boolean;
  copyLayout: "split" | "unified";
  copySide: InlineCommentSide;
  diffPosition?: number;
  findQuery: string;
  activeFindMatch: FindMatch | null;
  onAddComment?: (extendSelection: boolean) => void;
  onBeginSelection?: (extendSelection: boolean) => void;
  onExtendSelection?: () => void;
  referenceLine?: CodeReferenceLine | null;
  onRequestReferences?: (origin: ReviewReferenceLookupRequest) => void;
}) {
  const canComment = Boolean(children && onAddComment);
  const canCopy = children.length > 0;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const findRenderState = useMemo<FindRenderState | null>(
    () =>
      diffPosition === undefined
        ? null
        : {
            query: findQuery,
            diffPosition,
            activeMatch: activeFindMatch,
          },
    [activeFindMatch, diffPosition, findQuery],
  );
  const codeContent = useMemo(
    () =>
      children
        ? renderCodeContent(
            children,
            counterpart,
            tone,
            referenceLine ?? null,
            onRequestReferences,
            findRenderState,
          )
        : null,
    [
      children,
      counterpart,
      findRenderState,
      onRequestReferences,
      referenceLine,
      tone,
    ],
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
        data-diff-code-cell={copyable ? "true" : undefined}
        data-diff-copy-text={copyable ? children : undefined}
        data-diff-layout={copyable ? copyLayout : undefined}
        data-diff-side={copyable ? copySide : undefined}
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

function buildFindMatches(file: ReviewFile | null, query: string): FindMatch[] {
  if (!file || query.length === 0) {
    return [];
  }

  const needle = query.toLocaleLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const matches: FindMatch[] = [];
  file.hunks.forEach((hunk, hunkIndex) => {
    hunk.lines.forEach((line, lineIndex) => {
      const anchor = getLineAnchor(line, file.changeKind, hunkIndex, lineIndex);
      const haystack = line.content.toLocaleLowerCase();
      let start = haystack.indexOf(needle);
      while (start >= 0) {
        matches.push({
          id: `${anchor.diffPosition}:${start}`,
          diffPosition: anchor.diffPosition,
          start,
          length: query.length,
        });
        start = haystack.indexOf(needle, start + Math.max(needle.length, 1));
      }
    });
  });

  return matches;
}

function diffClipboardTextFromSelection(
  root: HTMLElement | null,
  selection: Selection | null,
): string | null {
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!safeIntersectsNode(range, root)) {
    return null;
  }

  const cells = Array.from(
    root.querySelectorAll<HTMLElement>("[data-diff-code-cell='true']"),
  )
    .filter((cell) => safeIntersectsNode(range, cell))
    .map((cell) => ({
      text: cell.dataset.diffCopyText ?? "",
      side: cell.dataset.diffSide,
      layout: cell.dataset.diffLayout,
    }));

  if (cells.length === 0) {
    return null;
  }

  if (cells.length === 1) {
    return selection.toString() || cells[0].text;
  }

  const startCell = closestDiffCodeCell(root, selection.anchorNode);
  const endCell = closestDiffCodeCell(root, selection.focusNode);
  return copyTextFromSelectedDiffCells(cells, {
    startSide: startCell?.dataset.diffSide,
    endSide: endCell?.dataset.diffSide,
    startLayout: startCell?.dataset.diffLayout,
    endLayout: endCell?.dataset.diffLayout,
  });
}

function selectAllDiffCodeCells(
  root: HTMLElement | null,
  preferredSplitSide: InlineCommentSide,
) {
  if (!root) {
    return;
  }
  const splitSideCells = root.querySelectorAll<HTMLElement>(
    `[data-diff-code-cell='true'][data-diff-layout='split'][data-diff-side='${preferredSplitSide}']`,
  );
  const cells =
    splitSideCells.length > 0
      ? splitSideCells
      : root.querySelectorAll<HTMLElement>("[data-diff-code-cell='true']");
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (!first || !last) {
    return;
  }

  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function closestDiffCodeCell(root: HTMLElement, node: Node | null) {
  if (!node) {
    return null;
  }
  const element =
    node instanceof HTMLElement
      ? node
      : node.parentElement instanceof HTMLElement
        ? node.parentElement
        : null;
  const cell = element?.closest<HTMLElement>("[data-diff-code-cell='true']");
  return cell && root.contains(cell) ? cell : null;
}

function safeIntersectsNode(range: Range, node: Node) {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

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
  referenceLine: CodeReferenceLine | null,
  onRequestReferences: ((origin: ReviewReferenceLookupRequest) => void) | undefined,
  findState: FindRenderState | null,
) {
  if (!counterpart || content === counterpart || tone === "neutral") {
    return renderCodeTokens(content, 0, referenceLine, onRequestReferences, findState);
  }

  return inlineSegments(content, counterpart).map((segment, index) => {
    if (!segment.changed) {
      return (
        <Fragment key={`${index}-same`}>
          {renderCodeTokens(
            segment.text,
            segment.start,
            referenceLine,
            onRequestReferences,
            findState,
          )}
        </Fragment>
      );
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
        {renderCodeTokens(
          segment.text,
          segment.start,
          referenceLine,
          onRequestReferences,
          findState,
        )}
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
    { text: content.slice(0, prefix), changed: false, start: 0 },
    { text: content.slice(prefix, end), changed: true, start: prefix },
    { text: content.slice(end), changed: false, start: end },
  ].filter((segment) => segment.text.length > 0);
}

function renderCodeTokens(
  content: string,
  baseOffset: number,
  referenceLine: CodeReferenceLine | null,
  onRequestReferences: ((origin: ReviewReferenceLookupRequest) => void) | undefined,
  findState: FindRenderState | null,
) {
  return tokenizeCodeLine(content).map((token, index) => {
    const absoluteStart = baseOffset + token.start;
    const tokenContent = renderFindHighlightedText(token.value, absoluteStart, findState);
    if (!referenceLine || !onRequestReferences || !isReferenceToken(token)) {
      return (
        <span key={`${index}-${token.value}-${absoluteStart}`} className={token.className}>
          {tokenContent}
        </span>
      );
    }

    return (
      <button
        key={`${index}-${token.value}-${absoluteStart}`}
        type="button"
        className={[
          token.className,
          "rounded-[2px] px-[1px] text-left hover:bg-[var(--rd-vermillion-bg)] hover:text-[var(--rd-cream)] focus-visible:bg-[var(--rd-vermillion-bg)] focus-visible:outline-none",
        ].join(" ")}
        data-reference-column={absoluteStart}
        data-reference-length={token.value.length}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRequestReferences({
            ...referenceLine,
            symbol: token.value,
            column: absoluteStart,
            length: token.value.length,
          });
        }}
        aria-label={`Find references for ${token.value}`}
        title={`Find references for ${token.value}`}
      >
        {tokenContent}
      </button>
    );
  });
}

function renderFindHighlightedText(
  value: string,
  absoluteStart: number,
  findState: FindRenderState | null,
) {
  const query = findState?.query;
  if (!query) {
    return value;
  }

  const lowerValue = value.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  if (!lowerQuery) {
    return value;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerQuery);
  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      parts.push(value.slice(cursor, matchIndex));
    }
    const start = absoluteStart + matchIndex;
    const matchText = value.slice(matchIndex, matchIndex + query.length);
    const isActive =
      findState.activeMatch?.diffPosition === findState.diffPosition &&
      findState.activeMatch.start === start;
    parts.push(
      <span
        key={`find-${start}`}
        className={[
          "rounded-[2px] px-[1px]",
          isActive
            ? "bg-[var(--rd-vermillion)] text-[#1A0F0A]"
            : "bg-[var(--rd-vermillion-bg)] text-[var(--rd-cream)]",
        ].join(" ")}
      >
        {matchText}
      </span>,
    );
    cursor = matchIndex + query.length;
    matchIndex = lowerValue.indexOf(lowerQuery, cursor);
  }

  if (cursor < value.length) {
    parts.push(value.slice(cursor));
  }

  return parts.length > 0 ? parts : value;
}

function isReferenceToken(token: CodeToken) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token.value) && !REFERENCE_KEYWORDS.has(token.value);
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

function referenceLineForAnchor(
  file: ReviewFile,
  anchor: LineAnchor,
): CodeReferenceLine | null {
  if (
    file.changeKind === "deleted" ||
    anchor.side !== "new" ||
    typeof anchor.lineNumber !== "number" ||
    !isReferenceTsLikePath(file.path)
  ) {
    return null;
  }

  return {
    fileId: file.id,
    path: file.path,
    lineNumber: anchor.lineNumber,
    diffPosition: anchor.diffPosition,
  };
}

function isReferenceTsLikePath(path: string) {
  return /\.[cm]?[tj]sx?$/.test(path);
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
