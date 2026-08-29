import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle } from "lucide-react";
import { DiffCanvas } from "@/components/review/DiffCanvas";
import { EmptyState } from "@/components/review/EmptyState";
import { HandoffSheet } from "@/components/review/HandoffSheet";
import { Inspector } from "@/components/review/Inspector";
import { PublishMergeSheet } from "@/components/review/PublishMergeSheet";
import { ReviewRail } from "@/components/review/ReviewRail";
import { SessionSwitcher } from "@/components/review/SessionSwitcher";
import { ShortcutHelpOverlay } from "@/components/review/ShortcutHelpOverlay";
import { TopBar } from "@/components/review/topbar/TopBar";
import { SlabButton } from "@/components/ui/slab-button";
import { SlabToggleGroup } from "@/components/ui/slab-toggle-group";
import { useKeybinding, type Binding } from "@/hooks/use-keybinding";
import { usePrContext } from "@/hooks/use-pr-context";
import { usePrInbox } from "@/hooks/use-pr-inbox";
import { useReviewReferences } from "@/hooks/use-review-references";
import type {
  PullRequestSummary as GhPullRequestSummary,
  PublishReviewResponse,
} from "@/types/github";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDiffViewMode } from "@/hooks/use-diff-view-mode";
import { useFontZoom } from "@/hooks/use-font-zoom";
import {
  fingerprintInline,
  fingerprintThreadReply,
} from "@/lib/fingerprint";
import {
  buildReviewReferenceDiffIndex,
  mapReviewReferenceTargets,
} from "@/lib/review-reference-locations";
import {
  countThreadReplyDrafts,
  createThreadReplyDraft,
  normalizeThreadReplyDrafts,
  normalizeThreadReplyMap,
} from "@/lib/thread-reply-drafts";
import {
  clearRecentRepos,
  clearReviewHistory,
  createDefaultFileState,
  createReviewSession,
  deleteReviewHistoryItem,
  getActiveReviewSession,
  getGlobalActiveReviewSession,
  importActiveReviewSession,
  importGlobalActiveReviewSession,
  importReviewSession,
  listReviewRefs,
  loadActiveReviewFileId,
  loadReviewDiagram,
  loadLastReviewSessionSnapshot,
  loadLastRepoPath,
  loadRecentRepos,
  loadReviewHistory,
  loadReviewSessionSnapshot,
  loadReviewSessionSnapshotForTarget,
  loadWorkspaceState,
  mergeWorkspaceStates,
  openReviewFile,
  rememberRepo,
  rememberActiveReviewFileId,
  rememberReviewSession,
  reconcileWorkspaceState,
  saveReviewDiagram,
  saveWorkspaceState,
  toggleReviewedStatus,
  toggleViewedStatus,
} from "@/lib/review-session";
import type {
  ReviewReferenceLookupRequest,
  ReviewReferenceLookupResult,
  ReviewReferenceTarget,
} from "@/types/references";
import type {
  ActiveReviewSession,
  InlineComment,
  RecentRepo,
  RepoRefs,
  ReviewDiagram,
  ReviewHistoryItem,
  ReviewSession,
  ReviewTarget,
  ReviewTargetKind,
  ReviewTargetRequest,
  ReviewWorkspaceState,
  SessionFileState,
  ThreadReplyDraftMap,
} from "@/types/review";

type SelectedPullRequest = Pick<
  GhPullRequestSummary,
  "number" | "url" | "baseRefName"
>;

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

type ReferenceBackTarget = {
  fileId: string;
  diffPosition: number;
  reference: NonNullable<JumpTarget["reference"]>;
};

type CenterMode = "diff" | "map";

const EMPTY_FILE_STATE = createDefaultFileState();
const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = "review-desk.single-key-shortcuts";
const preloadReviewMap = () => import("@/components/review/ReviewMap");
const ReviewMap = lazy(() =>
  preloadReviewMap().then((module) => ({ default: module.ReviewMap })),
);

function App() {
  const { fontZoom, resetFontZoom } = useFontZoom();
  const [, , toggleDiffViewMode] = useDiffViewMode();
  const [repoPath, setRepoPath] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [headRef, setHeadRef] = useState("");
  const [targetKind, setTargetKind] = useState<ReviewTargetKind>("workingTree");
  const [commitRef, setCommitRef] = useState("HEAD");
  const [rangeFromRef, setRangeFromRef] = useState("");
  const [rangeToRef, setRangeToRef] = useState("HEAD");
  const [pullRequestNumber, setPullRequestNumber] = useState<number | null>(null);
  const [pullRequestInput, setPullRequestInput] = useState("");
  const [repoRefs, setRepoRefs] = useState<RepoRefs | null>(null);
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([]);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryItem[]>([]);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [centerMode, setCenterMode] = useState<CenterMode>("diff");
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [reviewDiagram, setReviewDiagram] = useState<ReviewDiagram | null>(null);
  const [isDiagramLoading, setIsDiagramLoading] = useState(false);
  const [diagramError, setDiagramError] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<ReviewWorkspaceState>(
    {},
  );
  const [workspaceStateReadySessionId, setWorkspaceStateReadySessionId] =
    useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefsLoading, setIsRefsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const [referenceBackStack, setReferenceBackStack] = useState<ReferenceBackTarget[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [diffFindRequestId, setDiffFindRequestId] = useState<number | null>(null);
  const [diffSelectAllRequestId, setDiffSelectAllRequestId] =
    useState<number | null>(null);
  const [singleKeyShortcutsEnabled, setSingleKeyShortcutsEnabled] = useState(
    () => window.localStorage.getItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY) !== "off",
  );
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const inbox = usePrInbox(repoPath || null);
  const activePrNumber =
    session?.target.kind === "pullRequest" ? session.target.number ?? null : null;
  const prContext = usePrContext(repoPath || null, activePrNumber);
  const reviewReferences = useReviewReferences(session);
  const visiblePrContext = prContext.context;
  const visibleReviewThreads = visiblePrContext?.reviewThreads ?? [];
  const hasReviewMapSource = Boolean(reviewDiagram?.source.trim());
  const jumpThreadRef = useRef<(direction: 1 | -1) => void>(() => {});
  const queueFilterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
      singleKeyShortcutsEnabled ? "on" : "off",
    );
  }, [singleKeyShortcutsEnabled]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void preloadReviewMap().then((module) => {
        if (hasReviewMapSource) {
          void module.preloadMermaidRenderer();
        }
      });
    }, hasReviewMapSource ? 750 : 250);
    return () => window.clearTimeout(timeout);
  }, [hasReviewMapSource, session?.id]);

  jumpThreadRef.current = (direction: 1 | -1) => {
    if (!session || visibleReviewThreads.length === 0) return;
    const visible = visibleReviewThreads.filter((t) => !t.isOutdated);
    if (visible.length === 0) return;
    const currentIdx = expandedThreadId
      ? visible.findIndex((t) => t.id === expandedThreadId)
      : -1;
    const nextIdx =
      currentIdx < 0
        ? direction === 1
          ? 0
          : visible.length - 1
        : (currentIdx + direction + visible.length) % visible.length;
    const next = visible[nextIdx];
    setExpandedThreadId(next.id);
    const file = session.files.find((f) => f.path === next.path);
    if (file) {
      setActiveFileId(file.id);
      setJumpTarget({ fileId: file.id, requestedAt: Date.now() });
    }
  };
  const refLoadId = useRef(0);
  const sessionLoadId = useRef(0);
  const sessionApplyId = useRef(0);
  const diagramLoadId = useRef(0);
  const workspaceLoadId = useRef(0);
  const lastSeenActiveRevision = useRef<string | null>(null);
  const activeSessionPollRef = useRef(false);
  const repoPathRef = useRef("");
  const sessionRef = useRef<ReviewSession | null>(null);
  const activeFileIdRef = useRef<string | null>(null);
  const currentSessionOpenedAtRef = useRef(0);
  const latestSessionRef = useRef<ReviewSession | null>(null);
  const latestWorkspaceStateRef = useRef<ReviewWorkspaceState>({});
  const workspaceStateReadySessionIdRef = useRef<string | null>(null);

  const replaceWorkspaceState = useCallback((next: ReviewWorkspaceState) => {
    latestWorkspaceStateRef.current = next;
    setWorkspaceState(next);
  }, []);

  const updateWorkspaceState = useCallback(
    (updater: (current: ReviewWorkspaceState) => ReviewWorkspaceState) => {
      const next = updater(latestWorkspaceStateRef.current);
      latestWorkspaceStateRef.current = next;
      setWorkspaceState(next);
    },
    [],
  );

  const fileById = useMemo(() => {
    return new Map(session?.files.map((file) => [file.id, file]) ?? []);
  }, [session]);
  const referenceDiffIndex = useMemo(
    () => buildReviewReferenceDiffIndex(session),
    [session],
  );
  const activeFile = useMemo(() => {
    return activeFileId ? fileById.get(activeFileId) ?? null : null;
  }, [activeFileId, fileById]);

  const activeFileState = useMemo(
    () => (activeFile ? workspaceState[activeFile.id] ?? EMPTY_FILE_STATE : null),
    [activeFile, workspaceState],
  );
  const supportsReviewComments = session?.target.kind === "pullRequest";

  const selectedPullRequest = useMemo(() => {
    if (!pullRequestNumber) {
      return null;
    }
    return (
      inbox.data?.pullRequests.find((pullRequest) => pullRequest.number === pullRequestNumber) ??
      repoRefs?.pullRequests.find((pullRequest) => pullRequest.number === pullRequestNumber) ??
      null
    );
  }, [inbox.data?.pullRequests, pullRequestNumber, repoRefs]);

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setReferenceBackStack([]);
  }, [session?.id, session?.snapshotHash]);

  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  useEffect(() => {
    if (session) {
      void rememberActiveReviewFileId(session.id, activeFileId).catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    }
  }, [activeFileId, session]);

  useEffect(() => {
    latestSessionRef.current = session;
    latestWorkspaceStateRef.current = workspaceState;
  }, [session, workspaceState]);

  useEffect(() => {
    workspaceStateReadySessionIdRef.current = workspaceStateReadySessionId;
  }, [workspaceStateReadySessionId]);

  const patchFileState = useCallback(
    (fileId: string, patch: Partial<SessionFileState>) => {
      updateWorkspaceState((current) => ({
        ...current,
        [fileId]: {
          ...createDefaultFileState(),
          ...current[fileId],
          ...patch,
        },
      }));
    },
    [updateWorkspaceState],
  );

  const saveInlineComment = useCallback(
    (fileId: string, comment: InlineComment) => {
      updateWorkspaceState((current) => {
        const previous = {
          ...createDefaultFileState(),
          ...current[fileId],
        };
        const comments = previous.inlineComments ?? [];
        const nextComments = comments.some((item) => item.id === comment.id)
          ? comments.map((item) => (item.id === comment.id ? comment : item))
          : [...comments, comment];

        return {
          ...current,
          [fileId]: {
            ...previous,
            inlineComments: nextComments,
          },
        };
      });
    },
    [updateWorkspaceState],
  );

  const deleteInlineComment = useCallback((fileId: string, commentId: string) => {
    updateWorkspaceState((current) => {
      const previous = {
        ...createDefaultFileState(),
        ...current[fileId],
      };

      return {
        ...current,
        [fileId]: {
          ...previous,
          inlineComments: (previous.inlineComments ?? []).filter(
            (comment) => comment.id !== commentId,
          ),
        },
      };
    });
  }, [updateWorkspaceState]);

  const saveThreadReply = useCallback(
    (fileId: string, threadId: string, body: string) => {
      updateWorkspaceState((current) => {
        const previous = {
          ...createDefaultFileState(),
          ...current[fileId],
        };
        const threadReplies = normalizeThreadReplyMap(previous.threadReplies);
        const existingReplies = normalizeThreadReplyDrafts(threadReplies[threadId]);

        return {
          ...current,
          [fileId]: {
            ...previous,
            threadReplies: {
              ...threadReplies,
              [threadId]: [...existingReplies, createThreadReplyDraft(body)],
            },
          },
        };
      });
    },
    [updateWorkspaceState],
  );

  const deleteThreadReply = useCallback(
    (fileId: string, threadId: string, draftId?: string) => {
      updateWorkspaceState((current) => {
        const previous = {
          ...createDefaultFileState(),
          ...current[fileId],
        };
        const threadReplies = normalizeThreadReplyMap(previous.threadReplies);
        if (draftId) {
          const kept = normalizeThreadReplyDrafts(threadReplies[threadId]).filter(
            (draft) => draft.id !== draftId,
          );
          if (kept.length > 0) {
            threadReplies[threadId] = kept;
          } else {
            delete threadReplies[threadId];
          }
        } else {
          delete threadReplies[threadId];
        }

        return {
          ...current,
          [fileId]: {
            ...previous,
            threadReplies,
          },
        };
      });
    },
    [updateWorkspaceState],
  );

  const loadDiagramForSession = useCallback(async (nextSession: ReviewSession) => {
    const requestId = diagramLoadId.current + 1;
    diagramLoadId.current = requestId;
    setIsDiagramLoading(true);
    setDiagramError(null);

    try {
      const diagram = await loadReviewDiagram({
        repoPath: nextSession.repo.root,
        sessionId: nextSession.id,
      });
      if (
        diagramLoadId.current !== requestId ||
        sessionRef.current?.id !== nextSession.id
      ) {
        return;
      }
      setReviewDiagram(diagram);
    } catch (caught) {
      if (diagramLoadId.current === requestId) {
        setReviewDiagram(null);
        setDiagramError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (diagramLoadId.current === requestId) {
        setIsDiagramLoading(false);
      }
    }
  }, []);

  const reloadDiagram = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession || isDiagramLoading) {
      return;
    }
    void loadDiagramForSession(currentSession);
  }, [isDiagramLoading, loadDiagramForSession]);

  const clearCurrentReviewSurface = useCallback(() => {
    const previousSession = sessionRef.current;
    if (
      previousSession &&
      workspaceStateReadySessionIdRef.current === previousSession.id
    ) {
      void saveWorkspaceState(
        previousSession,
        latestWorkspaceStateRef.current,
      ).catch(() => {});
    }

    sessionLoadId.current += 1;
    sessionApplyId.current += 1;
    workspaceLoadId.current += 1;
    diagramLoadId.current += 1;
    currentSessionOpenedAtRef.current = Date.now();
    lastSeenActiveRevision.current = null;
    sessionRef.current = null;
    latestSessionRef.current = null;
    activeFileIdRef.current = null;
    workspaceStateReadySessionIdRef.current = null;
    latestWorkspaceStateRef.current = {};

    setSession(null);
    setActiveFileId(null);
    setReviewDiagram(null);
    setIsDiagramLoading(false);
    setDiagramError(null);
    setWorkspaceStateReadySessionId(null);
    replaceWorkspaceState({});
    setCenterMode("diff");
    setExpandedThreadId(null);
    setJumpTarget(null);
    setPublishOpen(false);
    setHandoffOpen(false);
    setIsLoading(false);
  }, [replaceWorkspaceState]);

  const saveDiagram = useCallback((diagram: ReviewDiagram) => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      return;
    }

    setReviewDiagram(diagram);
    setDiagramError(null);
    void saveReviewDiagram({
      repoPath: currentSession.repo.root,
      diagram,
    })
      .then((saved) => setReviewDiagram(saved))
      .catch((caught) => {
        setDiagramError(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  const applySession = useCallback(async (nextSession: ReviewSession) => {
    const previousSession = sessionRef.current;
    const previousActiveFileId = activeFileIdRef.current;
    if (
      previousSession &&
      workspaceStateReadySessionIdRef.current === previousSession.id
    ) {
      void saveWorkspaceState(
        previousSession,
        latestWorkspaceStateRef.current,
      ).catch(() => {});
    }

    const applyRequestId = sessionApplyId.current + 1;
    sessionApplyId.current = applyRequestId;
    const savedActiveFileId = await loadActiveReviewFileId(nextSession.id);
    if (applyRequestId !== sessionApplyId.current) {
      return;
    }

    const fallbackActiveFileId = chooseActiveFileId(
      nextSession,
      previousSession,
      previousActiveFileId,
      savedActiveFileId,
    );
    const sameSession = previousSession?.id === nextSession.id;
    const workspaceRequestId = workspaceLoadId.current + 1;
    workspaceLoadId.current = workspaceRequestId;
    currentSessionOpenedAtRef.current = Date.now();

    setRepoPath(nextSession.repo.root);
    setBaseRef(nextSession.repo.baseRef ?? "");
    setHeadRef(nextSession.repo.headRef ?? "");
    applyTargetControls(nextSession.target, {
      setTargetKind,
      setCommitRef,
      setRangeFromRef,
      setRangeToRef,
      setPullRequestNumber,
      setPullRequestInput,
    });
    workspaceStateReadySessionIdRef.current = null;
    setWorkspaceStateReadySessionId(null);
    setSession(nextSession);
    sessionRef.current = nextSession;
    setReviewDiagram(null);
    setDiagramError(null);
    replaceWorkspaceState(
      sameSession
        ? reconcileWorkspaceState(nextSession, latestWorkspaceStateRef.current)
        : {},
    );
    setActiveFileId(fallbackActiveFileId);

    void loadDiagramForSession(nextSession);

    void rememberReviewSession(nextSession)
      .then((history) => {
        if (sessionApplyId.current === applyRequestId) {
          setReviewHistory(history);
        }
      })
      .catch((caught) => {
        if (sessionApplyId.current === applyRequestId) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });

    void loadWorkspaceState(nextSession)
      .then((saved) => {
        if (
          workspaceLoadId.current !== workspaceRequestId ||
          sessionRef.current?.id !== nextSession.id
        ) {
          return;
        }

        const nextWorkspaceState = reconcileWorkspaceState(
          nextSession,
          mergeWorkspaceStates(latestWorkspaceStateRef.current, saved),
        );

        replaceWorkspaceState(nextWorkspaceState);
        setActiveFileId(
          chooseResumeFileId(nextSession, nextWorkspaceState, fallbackActiveFileId),
        );
        workspaceStateReadySessionIdRef.current = nextSession.id;
        setWorkspaceStateReadySessionId(nextSession.id);
      })
      .catch((caught) => {
        if (workspaceLoadId.current === workspaceRequestId) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
  }, [loadDiagramForSession, replaceWorkspaceState]);

  const tryLoadActiveSession = useCallback(
    async (path: string) => {
      const activeSession = await getActiveReviewSession({ repoPath: path });
      if (!activeSession) {
        return;
      }
      const revision = activeReviewSessionRevision(activeSession);
      const currentSession = sessionRef.current;
      if (activeSession.manifestPath === currentSession?.order.manifestPath) {
        if (revision !== lastSeenActiveRevision.current) {
          const refreshedSession = await importActiveReviewSession({ repoPath: path });
          if (refreshedSession) {
            lastSeenActiveRevision.current = revision;
            if (
              refreshedSession.id !== currentSession.id ||
              refreshedSession.snapshotHash !== currentSession.snapshotHash
            ) {
              await applySession(refreshedSession);
            }
          }
          return;
        }

        if (!isLiveAgentWorktreeSession(currentSession, activeSession.manifestPath)) {
          return;
        }
        const refreshedSession = await importActiveReviewSession({ repoPath: path });
        if (
          refreshedSession &&
          refreshedSession.snapshotHash !== currentSession.snapshotHash
        ) {
          await applySession(refreshedSession);
        }
        return;
      }
      if (revision === lastSeenActiveRevision.current) {
        return;
      }
      if (
        !shouldImportActiveSession(
          activeSession,
          currentSession,
          currentSessionOpenedAtRef.current,
        )
      ) {
        return;
      }

      const nextSession = await importActiveReviewSession({ repoPath: path });
      if (nextSession) {
        lastSeenActiveRevision.current = revision;
        if (shouldKeepCurrentSession(nextSession, currentSession)) {
          setError("Agent session has no matching changed files. Current review kept.");
          return;
        }
        await applySession(nextSession);
      }
    },
    [applySession],
  );

  const loadRefsForRepo = useCallback(
    async (
      path: string,
      options?: { applyDefaults?: boolean; loadActive?: boolean },
    ) => {
      const nextPath = path.trim();
      if (!nextPath) {
        return;
      }

      const requestId = refLoadId.current + 1;
      refLoadId.current = requestId;
      setIsRefsLoading(true);
      setError(null);

      try {
        const refs = await listReviewRefs({ repoPath: nextPath });
        if (requestId !== refLoadId.current) {
          return;
        }

        setRepoPath(refs.root);
        setRepoRefs(refs);
        setRecentRepos(await rememberRepo(refs));

        if (options?.applyDefaults) {
          const defaults = suggestDefaultRefs(refs);
          setBaseRef(defaults.baseRef);
          setHeadRef(defaults.headRef);
          setCommitRef("HEAD");
          setRangeFromRef(defaults.baseRef || refs.defaultBranch || "");
          setRangeToRef(defaults.headRef || defaults.currentBranch || "HEAD");
          setPullRequestNumber(null);
          setPullRequestInput("");
          setTargetKind("workingTree");
        }

        if (options?.loadActive !== false) {
          void tryLoadActiveSession(refs.root);
        }
      } catch (caught) {
        if (requestId === refLoadId.current) {
          setRepoRefs(null);
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (requestId === refLoadId.current) {
          setIsRefsLoading(false);
        }
      }
    },
    [tryLoadActiveSession],
  );

  const tryLoadGlobalActiveSession = useCallback(async () => {
    const activeSession = await getGlobalActiveReviewSession();
    if (!activeSession) {
      return;
    }
    const revision = activeReviewSessionRevision(activeSession);
    if (revision === lastSeenActiveRevision.current) {
      return;
    }
    const currentSession = sessionRef.current;
    const isCurrentManifest =
      activeSession.manifestPath === currentSession?.order.manifestPath;
    if (
      !isCurrentManifest &&
      !shouldImportActiveSession(
        activeSession,
        currentSession,
        currentSessionOpenedAtRef.current,
      )
    ) {
      return;
    }

    const currentRepoPath = repoPathRef.current.trim();
    if (currentRepoPath && !sameRepoPath(activeSession.repoRoot, currentRepoPath)) {
      return;
    }

    const nextSession = await importGlobalActiveReviewSession();
    if (nextSession) {
      lastSeenActiveRevision.current = revision;
      if (shouldKeepCurrentSession(nextSession, currentSession)) {
        setError("Agent session has no matching changed files. Current review kept.");
        return;
      }
      if (currentRepoPath && !sameRepoPath(nextSession.repo.root, currentRepoPath)) {
        return;
      }
      if (
        nextSession.id !== currentSession?.id ||
        nextSession.snapshotHash !== currentSession.snapshotHash
      ) {
        await applySession(nextSession);
      }
      void loadRefsForRepo(nextSession.repo.root, {
        applyDefaults: false,
        loadActive: false,
      });
    }
  }, [applySession, loadRefsForRepo]);

  const openRepoPath = useCallback(
    (path: string) => {
      clearCurrentReviewSurface();
      setRepoPath(path);
      setRepoRefs(null);
      setBaseRef("");
      setHeadRef("");
      setCommitRef("HEAD");
      setRangeFromRef("");
      setRangeToRef("HEAD");
      setPullRequestNumber(null);
      setPullRequestInput("");
      setTargetKind("workingTree");
      void loadRefsForRepo(path, { applyDefaults: true, loadActive: false });
    },
    [clearCurrentReviewSurface, loadRefsForRepo],
  );

  const pickRepo = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open repository",
    });

    if (typeof selected === "string") {
      openRepoPath(selected);
    }
  }, [openRepoPath]);

  const importAgentSession = useCallback(async () => {
    if (isLoading) {
      return;
    }

    const selected = await open({
      multiple: false,
      title: "Import agent review session",
      filters: [
        {
          name: "Review session manifest",
          extensions: ["json"],
        },
      ],
    });

    if (typeof selected !== "string") {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextSession = await importReviewSession({ manifestPath: selected });
      await applySession(nextSession);
      void loadRefsForRepo(nextSession.repo.root, { applyDefaults: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [applySession, isLoading, loadRefsForRepo]);

  const refreshAgentSession = useCallback(
    async (manifestPath: string) => {
      const requestId = sessionLoadId.current + 1;
      sessionLoadId.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const nextSession = await importReviewSession({ manifestPath });
        if (requestId !== sessionLoadId.current) {
          return;
        }
        if (shouldKeepCurrentSession(nextSession, sessionRef.current)) {
          setError("Agent session has no matching changed files. Current review kept.");
          return;
        }
        await applySession(nextSession);
        void loadRefsForRepo(nextSession.repo.root, {
          applyDefaults: false,
          loadActive: false,
        });
      } catch (caught) {
        if (requestId === sessionLoadId.current) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (requestId === sessionLoadId.current) {
          setIsLoading(false);
        }
      }
    },
    [applySession, loadRefsForRepo],
  );

  const startSession = useCallback(
    async (overrides?: {
      repoPath?: string;
      baseRef?: string | null;
      headRef?: string | null;
      target?: ReviewTargetRequest | null;
    }) => {
      const nextRepoPath = overrides?.repoPath ?? repoPath;
      const nextBaseRef = overrides?.baseRef ?? baseRef;
      const nextHeadRef = overrides?.headRef ?? headRef;

      if (!nextRepoPath) {
        return;
      }

      const requestId = sessionLoadId.current + 1;
      sessionLoadId.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const target =
          overrides?.target ??
          buildReviewTargetRequest({
            kind: targetKind,
            baseRef: nextBaseRef,
            headRef: nextHeadRef,
            commitRef,
            rangeFromRef,
            rangeToRef,
            pullRequestNumber,
            pullRequestInput,
            selectedPullRequest,
          });

        const cachedSession = await loadReviewSessionSnapshotForTarget({
          repoPath: nextRepoPath,
          target,
        });
        if (cachedSession && requestId === sessionLoadId.current) {
          await applySession(cachedSession);
        }

        const nextSession = await createReviewSession({
          repoPath: nextRepoPath,
          baseRef: nextBaseRef?.trim() || null,
          headRef: nextHeadRef?.trim() || null,
          target,
        });
        if (requestId !== sessionLoadId.current) {
          return;
        }
        await applySession(nextSession);
      } catch (caught) {
        if (requestId === sessionLoadId.current) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (requestId === sessionLoadId.current) {
          setIsLoading(false);
        }
      }
    },
    [
      applySession,
      baseRef,
      commitRef,
      headRef,
      pullRequestInput,
      pullRequestNumber,
      rangeFromRef,
      rangeToRef,
      repoPath,
      selectedPullRequest,
      targetKind,
    ],
  );

  const createSession = useCallback(() => {
    const currentSession = sessionRef.current;
    if (currentSession?.target.kind === "pullRequest") {
      void prContext.refresh();
      void inbox.refresh();
    }
    if (currentSession?.order.source === "agent" && currentSession.order.manifestPath) {
      void refreshAgentSession(currentSession.order.manifestPath);
      return;
    }

    void startSession();
  }, [inbox.refresh, prContext.refresh, refreshAgentSession, startSession]);

  const startTargetSession = useCallback(
    (target: ReviewTargetRequest, refs?: { baseRef?: string; headRef?: string }) => {
      void startSession({
        baseRef: refs?.baseRef ?? baseRef,
        headRef: refs?.headRef ?? headRef,
        target,
      });
    },
    [baseRef, headRef, startSession],
  );

  const pickCommitAndOpen = useCallback(
    (sha: string) => {
      const clean = sha.trim();
      if (!clean) return;
      setCommitRef(clean);
      setTargetKind("commit");
      startTargetSession({ kind: "commit", commit: clean });
    },
    [startTargetSession],
  );

  const submitTargetFromPopover = useCallback(() => {
    if (!repoPath) return;
    try {
      const target = buildReviewTargetRequest({
        kind: targetKind,
        baseRef,
        headRef,
        commitRef,
        rangeFromRef,
        rangeToRef,
        pullRequestNumber,
        pullRequestInput,
        selectedPullRequest,
      });
      startTargetSession(target);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [
    baseRef,
    commitRef,
    headRef,
    pullRequestInput,
    pullRequestNumber,
    rangeFromRef,
    rangeToRef,
    repoPath,
    selectedPullRequest,
    startTargetSession,
    targetKind,
  ]);

  const resumeReview = useCallback(
    async (item: ReviewHistoryItem) => {
      const cachedSession = await loadReviewSessionSnapshot(item.id);

      if (cachedSession) {
        await applySession(cachedSession);
      } else {
        setRepoPath(item.repoRoot);
        setBaseRef(item.baseRef ?? "");
        setHeadRef(item.headRef ?? "");
        if (item.target) {
          applyTargetControls(item.target, {
            setTargetKind,
            setCommitRef,
            setRangeFromRef,
            setRangeToRef,
            setPullRequestNumber,
            setPullRequestInput,
          });
        }
      }

      void loadRefsForRepo(item.repoRoot, {
        applyDefaults: false,
        loadActive: false,
      });

      const manifestPath = cachedSession?.order.manifestPath ?? item.manifestPath;
      if (item.orderSource === "agent" && manifestPath) {
        void refreshAgentSession(manifestPath);
      } else {
        void startSession({
          repoPath: item.repoRoot,
          baseRef: item.baseRef,
          headRef: item.headRef,
          target: item.target
            ? reviewTargetToRequest(item.target)
            : legacyHistoryTargetToRequest(item),
        });
      }
    },
    [applySession, loadRefsForRepo, refreshAgentSession, startSession],
  );

  const deleteHistoryItem = useCallback((item: ReviewHistoryItem) => {
    void deleteReviewHistoryItem(item.id)
      .then(setReviewHistory)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  const clearHistory = useCallback(() => {
    void clearReviewHistory()
      .then(setReviewHistory)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  const refreshRefs = useCallback(() => {
    if (!repoPath || isRefsLoading) {
      return;
    }

    void loadRefsForRepo(repoPath, { applyDefaults: false });
  }, [isRefsLoading, loadRefsForRepo, repoPath]);

  const handleScrollHandled = useCallback(() => setJumpTarget(null), []);

  const findReviewReferences = useCallback(
    (origin: ReviewReferenceLookupRequest): ReviewReferenceLookupResult => {
      const references = reviewReferences.findReferences(origin);
      return {
        kind: "semantic",
        symbol: origin.symbol,
        references: mapReviewReferenceTargets({
          index: referenceDiffIndex,
          origin,
          references,
        }),
        warnings: [
          ...reviewReferences.warnings,
          ...(reviewReferences.error ? [reviewReferences.error] : []),
        ],
      };
    },
    [referenceDiffIndex, reviewReferences],
  );

  const jumpToReviewReference = useCallback(
    (target: ReviewReferenceTarget, origin: ReviewReferenceLookupRequest) => {
      if (target.diffPosition === null) {
        return;
      }
      setReferenceBackStack((current) =>
        [
          ...current,
          {
            fileId: origin.fileId,
            diffPosition: origin.diffPosition,
            reference: {
              lineNumber: origin.lineNumber,
              column: origin.column,
              length: origin.length,
              symbol: origin.symbol,
            },
          },
        ].slice(-20),
      );
      setActiveFileId(target.fileId);
      setJumpTarget({
        fileId: target.fileId,
        diffPosition: target.diffPosition,
        reference: {
          lineNumber: target.lineNumber,
          column: target.column,
          length: target.length,
          symbol: origin.symbol,
        },
        requestedAt: Date.now(),
      });
    },
    [],
  );

  const jumpBackFromReference = useCallback(() => {
    setReferenceBackStack((current) => {
      const previous = current[current.length - 1];
      if (!previous) {
        return current;
      }
      setActiveFileId(previous.fileId);
      setJumpTarget({
        fileId: previous.fileId,
        diffPosition: previous.diffPosition,
        reference: previous.reference,
        requestedAt: Date.now(),
      });
      return current.slice(0, -1);
    });
  }, []);

  const selectFile = useCallback((fileId: string) => {
    const file = sessionRef.current?.files.find((item) => item.id === fileId);
    setActiveFileId(fileId);
    updateWorkspaceState((current) => {
      const currentStatus = current[fileId]?.status ?? "unseen";
      if (currentStatus !== "unseen") {
        return current;
      }

      return {
        ...current,
        [fileId]: {
          ...createDefaultFileState(),
          ...current[fileId],
          status: "viewed",
          lastPatchHash: file?.patchHash,
        },
      };
    });
  }, [updateWorkspaceState]);

  const markActiveViewed = useCallback(() => {
    if (!activeFile) {
      return;
    }

    patchFileState(activeFile.id, {
      status: toggleViewedStatus(activeFileState?.status),
      lastPatchHash: activeFile.patchHash,
    });
  }, [activeFile, activeFileState?.status, patchFileState]);

  const markActiveReviewed = useCallback(() => {
    if (!activeFile) {
      return;
    }

    patchFileState(activeFile.id, {
      status: toggleReviewedStatus(activeFileState?.status),
      lastPatchHash: activeFile.patchHash,
    });
  }, [activeFile, activeFileState?.status, patchFileState]);

  const openActiveFile = useCallback(() => {
    if (!session || !activeFile || activeFile.changeKind === "deleted") {
      return;
    }

    void openReviewFile({
      repoPath: session.repo.root,
      filePath: activeFile.path,
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [activeFile, session]);

  const moveActiveFile = useCallback(
    (direction: 1 | -1) => {
      const currentSession = sessionRef.current;
      if (!currentSession || currentSession.files.length === 0) return;
      const currentId = activeFileIdRef.current;
      const currentIndex = currentId
        ? currentSession.files.findIndex((file) => file.id === currentId)
        : -1;
      const fallbackIndex = direction === 1 ? 0 : currentSession.files.length - 1;
      const nextIndex =
        currentIndex < 0
          ? fallbackIndex
          : Math.min(
              currentSession.files.length - 1,
              Math.max(0, currentIndex + direction),
            );
      const nextFile = currentSession.files[nextIndex];
      if (nextFile) {
        selectFile(nextFile.id);
      }
    },
    [selectFile],
  );

  const markActiveReviewedAndAdvance = useCallback(() => {
    const currentSession = sessionRef.current;
    const currentId = activeFileIdRef.current;
    if (!currentSession || !currentId) return;
    const currentIndex = currentSession.files.findIndex((file) => file.id === currentId);
    const currentFile = currentSession.files[currentIndex];
    if (!currentFile) return;

    patchFileState(currentFile.id, {
      status: "reviewed",
      lastPatchHash: currentFile.patchHash,
    });

    const nextFile = currentSession.files[currentIndex + 1];
    if (nextFile) {
      selectFile(nextFile.id);
    }
  }, [patchFileState, selectFile]);

  const focusQueueFilter = useCallback(() => {
    queueFilterInputRef.current?.focus();
    queueFilterInputRef.current?.select();
  }, []);

  const openDiffFind = useCallback(() => {
    setCenterMode("diff");
    setDiffFindRequestId(Date.now());
  }, []);

  const selectActiveDiffFile = useCallback(() => {
    setCenterMode("diff");
    setDiffSelectAllRequestId(Date.now());
  }, []);

  const topLayerOpen = shortcutHelpOpen || paletteOpen || publishOpen || handoffOpen;
  const canUseReviewShortcuts = Boolean(session) && !topLayerOpen;
  const reviewShortcutBindings = useMemo<Binding[]>(
    () => [
      {
        combo: "F1",
        label: "Open shortcut help",
        group: "General",
        disabled: shortcutHelpOpen,
        handler: () => setShortcutHelpOpen(true),
      },
      {
        combo: "?",
        label: "Open shortcut help",
        group: "General",
        disabled: topLayerOpen,
        handler: () => setShortcutHelpOpen(true),
      },
      {
        combo: "Escape",
        label: "Close the top panel",
        group: "General",
        disabled: !topLayerOpen,
        handler: () => {
          if (shortcutHelpOpen) setShortcutHelpOpen(false);
          else if (paletteOpen) setPaletteOpen(false);
          else if (publishOpen) setPublishOpen(false);
          else if (handoffOpen) setHandoffOpen(false);
        },
      },
      {
        combo: "cmd+k",
        label: "Switch review target",
        group: "General",
        disabled: !repoPath || publishOpen || handoffOpen || shortcutHelpOpen,
        handler: () => setPaletteOpen((current) => !current),
      },
      {
        combo: "cmd+Backslash",
        label: "Toggle split/unified diff",
        group: "Diff",
        disabled: topLayerOpen,
        handler: () => toggleDiffViewMode(),
      },
      {
        combo: "cmd+f",
        label: "Find in active file",
        group: "Diff",
        disabled: !canUseReviewShortcuts || !activeFile,
        handler: openDiffFind,
      },
      {
        combo: "cmd+a",
        label: "Select active diff file",
        group: "Diff",
        disabled: !canUseReviewShortcuts || !activeFile,
        handler: selectActiveDiffFile,
      },
      {
        combo: "/",
        label: "Focus queue filter",
        group: "Queue",
        disabled: !canUseReviewShortcuts,
        handler: focusQueueFilter,
      },
      {
        combo: "k",
        label: "Next file",
        group: "Queue",
        disabled: !canUseReviewShortcuts,
        allowRepeat: true,
        handler: () => moveActiveFile(1),
      },
      {
        combo: "j",
        label: "Previous file",
        group: "Queue",
        disabled: !canUseReviewShortcuts,
        allowRepeat: true,
        handler: () => moveActiveFile(-1),
      },
      {
        combo: "v",
        label: "Mark viewed or unviewed",
        group: "Queue",
        disabled: !canUseReviewShortcuts || !activeFile,
        handler: markActiveViewed,
      },
      {
        combo: "r",
        label: "Mark reviewed and advance",
        group: "Queue",
        disabled: !canUseReviewShortcuts || !activeFile,
        handler: markActiveReviewedAndAdvance,
      },
      {
        combo: "o",
        label: "Open active file in editor",
        group: "Queue",
        disabled:
          !canUseReviewShortcuts ||
          !activeFile ||
          activeFile.changeKind === "deleted",
        handler: openActiveFile,
      },
      {
        combo: "b",
        label: "Back to previous reference",
        group: "References",
        disabled: !canUseReviewShortcuts || referenceBackStack.length === 0,
        handler: jumpBackFromReference,
      },
      {
        combo: "[",
        label: "Previous PR thread",
        group: "Threads",
        disabled: !canUseReviewShortcuts || visibleReviewThreads.length === 0,
        allowRepeat: true,
        handler: () => jumpThreadRef.current(-1),
      },
      {
        combo: "]",
        label: "Next PR thread",
        group: "Threads",
        disabled: !canUseReviewShortcuts || visibleReviewThreads.length === 0,
        allowRepeat: true,
        handler: () => jumpThreadRef.current(1),
      },
      {
        combo: "p",
        label: "Open publish sheet",
        group: "Publish",
        disabled: !canUseReviewShortcuts || !supportsReviewComments,
        handler: () => setPublishOpen(true),
      },
      {
        combo: "h",
        label: "Open agent handoff",
        group: "Publish",
        disabled: !canUseReviewShortcuts || !session,
        handler: () => setHandoffOpen(true),
      },
    ],
    [
      activeFile,
      canUseReviewShortcuts,
      focusQueueFilter,
      handoffOpen,
      jumpBackFromReference,
      markActiveReviewedAndAdvance,
      markActiveViewed,
      moveActiveFile,
      openActiveFile,
      openDiffFind,
      paletteOpen,
      publishOpen,
      referenceBackStack.length,
      repoPath,
      selectActiveDiffFile,
      session,
      shortcutHelpOpen,
      supportsReviewComments,
      toggleDiffViewMode,
      topLayerOpen,
      visibleReviewThreads.length,
    ],
  );

  useKeybinding(reviewShortcutBindings, {
    singleKeyShortcutsEnabled,
  });

  useEffect(() => {
    let cancelled = false;

    async function restoreStartupState() {
      try {
        const [repos, history] = await Promise.all([
          loadRecentRepos(),
          loadReviewHistory(),
        ]);
        if (cancelled) return;

        setRecentRepos(repos);
        setReviewHistory(history);

        await tryLoadGlobalActiveSession();
        if (cancelled || sessionRef.current) return;

        const lastReviewSession = await loadLastReviewSessionSnapshot();
        if (cancelled) return;
        if (lastReviewSession) {
          await applySession(lastReviewSession);
          if (cancelled) return;
          void loadRefsForRepo(lastReviewSession.repo.root, {
            applyDefaults: false,
            loadActive: false,
          });
          return;
        }

        const lastRepoPath = await loadLastRepoPath();
        if (cancelled) return;
        if (lastRepoPath) {
          setRepoPath(lastRepoPath);
          void loadRefsForRepo(lastRepoPath, { applyDefaults: true });
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    }

    void restoreStartupState();

    return () => {
      cancelled = true;
    };
  }, [applySession, loadRefsForRepo, tryLoadGlobalActiveSession]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let cancelled = false;
    async function pollActiveSessions() {
      if (activeSessionPollRef.current) {
        return;
      }

      activeSessionPollRef.current = true;
      try {
        if (repoPath) {
          await tryLoadActiveSession(repoPath);
        }
        await tryLoadGlobalActiveSession();
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        activeSessionPollRef.current = false;
      }
    }

    const timer = window.setInterval(() => {
      void pollActiveSessions();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isLoading, repoPath, tryLoadActiveSession, tryLoadGlobalActiveSession]);

  useEffect(() => {
    if (
      centerMode !== "map" ||
      !session ||
      reviewDiagram ||
      isDiagramLoading ||
      diagramError
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentSession = sessionRef.current;
      if (currentSession?.id === session.id) {
        void loadDiagramForSession(currentSession);
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [
    centerMode,
    diagramError,
    isDiagramLoading,
    loadDiagramForSession,
    reviewDiagram,
    session,
  ]);

  useEffect(() => {
    if (
      !session ||
      !activeFile ||
      workspaceStateReadySessionId !== session.id
    ) {
      return;
    }

    updateWorkspaceState((current) => {
      const fileState = current[activeFile.id] ?? createDefaultFileState();
      if (fileState.status !== "unseen") {
        return current;
      }

      return {
        ...current,
        [activeFile.id]: {
          ...fileState,
          status: "viewed",
          lastPatchHash: activeFile.patchHash,
        },
      };
    });
  }, [activeFile, session, updateWorkspaceState, workspaceStateReadySessionId]);

  useEffect(() => {
    if (session && workspaceStateReadySessionId === session.id) {
      const timer = window.setTimeout(() => {
        void saveWorkspaceState(session, workspaceState).catch((caught) => {
          setError(caught instanceof Error ? caught.message : String(caught));
        });
      }, 350);
      return () => window.clearTimeout(timer);
    }
  }, [session, workspaceState, workspaceStateReadySessionId]);

  // Flush any pending workspace-state writes when switching away from a session,
  // so a note added <350ms before the switch is not lost to the debounce cancel.
  useEffect(() => {
    if (!session) return;
    const currentSession = session;
    return () => {
      if (workspaceStateReadySessionIdRef.current === currentSession.id) {
        void saveWorkspaceState(
          currentSession,
          latestWorkspaceStateRef.current,
        ).catch(() => {});
      }
    };
  }, [session]);

  useEffect(() => {
    function flushWorkspaceState() {
      if (
        latestSessionRef.current &&
        workspaceStateReadySessionIdRef.current === latestSessionRef.current.id
      ) {
        void saveWorkspaceState(
          latestSessionRef.current,
          latestWorkspaceStateRef.current,
        );
      }
    }

    window.addEventListener("pagehide", flushWorkspaceState);
    return () => {
      window.removeEventListener("pagehide", flushWorkspaceState);
      flushWorkspaceState();
    };
  }, []);

  return (
    <TooltipProvider>
      <main className="rd-app dark flex h-[100dvh] min-h-[100dvh] w-full max-w-full flex-col overflow-hidden">
        <TopBar
          session={session}
          targetKind={targetKind}
          baseRef={baseRef}
          headRef={headRef}
          commitRef={commitRef}
          rangeFromRef={rangeFromRef}
          rangeToRef={rangeToRef}
          pullRequestInput={pullRequestInput}
          pullRequestNumber={pullRequestNumber}
          repoPath={repoPath}
          repoRefs={repoRefs}
          recentRepos={recentRepos}
          pullRequests={inbox.data?.pullRequests ?? []}
          isInboxLoading={inbox.isRefreshing}
          inboxError={inbox.error}
          isRefsLoading={isRefsLoading}
          isLoading={isLoading}
          prSummary={(() => {
            if (!session || session.target.kind !== "pullRequest") return null;
            const n = session.target.number;
            if (n === null || n === undefined) return null;
            return inbox.data?.pullRequests.find((pr) => pr.number === n) ?? null;
          })()}
          prContext={prContext.context}
          prContextError={prContext.error}
          workspaceState={workspaceState}
          activeFile={activeFile}
          reviewHistory={reviewHistory}
          publishLabelCount={countPublishableDrafts(workspaceState)}
          fontZoom={fontZoom}
          onResetFontZoom={resetFontZoom}
          onPickFolder={pickRepo}
          onSelectRepo={openRepoPath}
          onRefreshRefs={refreshRefs}
          onClearRecentRepos={() => {
            void clearRecentRepos()
              .then(() => setRecentRepos([]))
              .catch((caught) => {
                setError(caught instanceof Error ? caught.message : String(caught));
              });
          }}
          onTargetKindChange={setTargetKind}
          onBaseRefChange={setBaseRef}
          onHeadRefChange={setHeadRef}
          onCommitRefChange={setCommitRef}
          onRangeFromRefChange={setRangeFromRef}
          onRangeToRefChange={setRangeToRef}
          onPullRequestInputChange={setPullRequestInput}
          onPullRequestInputSubmit={submitTargetFromPopover}
          onPickPullRequest={(pr) => {
            setTargetKind("pullRequest");
            setPullRequestInput("");
            setPullRequestNumber(pr.number);
            void startSession({
              target: {
                kind: "pullRequest",
                number: pr.number,
                url: pr.url,
                baseRef: pr.baseRefName,
                headRef: null,
              },
            });
          }}
          onPickCommit={pickCommitAndOpen}
          onCreateSession={submitTargetFromPopover}
          onRefreshSession={createSession}
          onImportAgentSession={importAgentSession}
          onOpenHandoff={() => setHandoffOpen(true)}
          onOpenPublish={() => setPublishOpen(true)}
          onSelectReviewHistory={resumeReview}
          onDeleteReviewHistory={deleteHistoryItem}
          onClearReviewHistory={clearHistory}
          onJumpToDraft={(target) => {
            setActiveFileId(target.fileId);
            if ("diffPosition" in target) {
              setJumpTarget({
                fileId: target.fileId,
                diffPosition: target.diffPosition,
                requestedAt: Date.now(),
              });
            } else if ("expandSection" in target) {
              setJumpTarget({
                fileId: target.fileId,
                expandSection: "private",
                requestedAt: Date.now(),
              });
            } else {
              const thread = prContext.context?.reviewThreads.find((t) => t.id === target.threadId);
              if (thread) {
                const file = session?.files.find((f) => f.path === thread.path);
                if (file) {
                  setActiveFileId(file.id);
                  setJumpTarget({ fileId: file.id, requestedAt: Date.now() });
                }
              }
            }
          }}
          onDropDraft={(target) => {
            if (!session) return;
            if ("diffPosition" in target) {
              const fs = workspaceState[target.fileId];
              const matching = fs?.inlineComments.find(
                (c) => c.endDiffPosition === target.diffPosition && c.visibility === "review",
              );
              if (matching) deleteInlineComment(target.fileId, matching.id);
            } else if ("expandSection" in target) {
              patchFileState(target.fileId, { privateNote: "" });
            } else {
              deleteThreadReply(target.fileId, target.threadId, target.draftId);
            }
          }}
          onJumpToThread={(target) => {
            const file = session?.files.find((f) => f.path === target.path);
            if (!file) return;
            setActiveFileId(file.id);
            setJumpTarget({ fileId: file.id, requestedAt: Date.now() });
          }}
        />

        {error ? (
          <div className="flex items-center gap-2 border-b border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] px-4 py-2 text-sm text-[var(--rd-del)]">
            <AlertCircle className="size-4" />
            {error}
          </div>
        ) : null}

        {session ? (
          centerMode === "map" ? (
            <section className="flex min-h-0 flex-1 flex-col bg-[var(--rd-ink)]">
              <CenterModeToggle mode={centerMode} onChange={setCenterMode} />
              <div className="min-h-0 flex-1">
                <Suspense fallback={<ReviewMapFallback />}>
                  <ReviewMap
                    session={session}
                    diagram={reviewDiagram}
                    isLoading={isDiagramLoading}
                    error={diagramError}
                    onReload={reloadDiagram}
                    onSave={saveDiagram}
                    onSelectFile={(fileId) => {
                      selectFile(fileId);
                      setCenterMode("diff");
                    }}
                  />
                </Suspense>
              </div>
            </section>
          ) : (
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel defaultSize="24%" minSize="18%" maxSize="34%">
              <ReviewRail
                session={session}
                activeFileId={activeFileId}
                workspaceState={workspaceState}
                onSelectFile={selectFile}
                filterInputRef={queueFilterInputRef}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="52%" minSize="36%">
              <section className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
                <div className="min-h-0 flex-1">
                  <DiffCanvas
                    repoRoot={session.repo.root}
                    diffTarget={session.patchArtifact.diffTarget}
                    file={activeFile}
                    fileState={activeFileState}
                    jumpTarget={jumpTarget}
                    referenceStatus={reviewReferences.status}
                    referenceWarnings={reviewReferences.warnings}
                    referenceError={reviewReferences.error}
                    referenceBackCount={referenceBackStack.length}
                    findRequestId={diffFindRequestId}
                    selectAllRequestId={diffSelectAllRequestId}
                    supportsReviewComments={supportsReviewComments}
                    centerMode={centerMode}
                    onCenterModeChange={setCenterMode}
                    onScrollHandled={handleScrollHandled}
                    onFindReferences={findReviewReferences}
                    onJumpToReference={jumpToReviewReference}
                    onReferenceBack={jumpBackFromReference}
                    onMarkViewed={markActiveViewed}
                    onMarkReviewed={markActiveReviewed}
                    onOpenFile={openActiveFile}
                    onSaveInlineComment={saveInlineComment}
                    onDeleteInlineComment={deleteInlineComment}
                    threads={visibleReviewThreads}
                    expandedThreadId={expandedThreadId}
                    onExpandThread={setExpandedThreadId}
                    onReplyThread={saveThreadReply}
                    onDeleteThreadReply={deleteThreadReply}
                  />
                </div>
              </section>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="24%" minSize="20%" maxSize="36%">
              <Inspector
                session={session}
                file={activeFile}
                fileState={activeFileState}
                workspaceState={workspaceState}
                jumpTarget={jumpTarget}
                onScrollHandled={handleScrollHandled}
                onMarkViewed={markActiveViewed}
                onMarkReviewed={markActiveReviewed}
                onSelectFile={setActiveFileId}
                onJumpToInline={(fileId, diffPosition) => {
                  setActiveFileId(fileId);
                  setJumpTarget({
                    fileId,
                    diffPosition,
                    requestedAt: Date.now(),
                  });
                }}
                onDeleteInline={deleteInlineComment}
                prContext={visiblePrContext}
                onJumpToThread={(target) => {
                  const file = session.files.find(
                    (f) => f.path === target.path,
                  );
                  if (!file) return;
                  setActiveFileId(file.id);
                  setJumpTarget({
                    fileId: file.id,
                    requestedAt: Date.now(),
                  });
                }}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          )
        ) : repoPath ? (
          <div className="min-h-0 flex-1">
            <SessionSwitcher
              framing="home"
              pullRequests={inbox.data?.pullRequests ?? []}
              inboxFetchedAt={inbox.data?.fetchedAt ?? null}
              isInboxLoading={inbox.isRefreshing}
              inboxError={inbox.error}
              history={reviewHistory}
              workspaceByPr={{}}
              repoRefs={repoRefs}
              onRefreshInbox={inbox.refresh}
              onPickPullRequest={(pr: GhPullRequestSummary) =>
                void startSession({
                  target: {
                    kind: "pullRequest",
                    number: pr.number,
                    url: pr.url,
                    baseRef: pr.baseRefName,
                    headRef: null,
                  },
                })
              }
              onPickTarget={(target) => void startSession({ target })}
            />
          </div>
        ) : (
          <EmptyState onPickRepo={pickRepo} />
        )}
        {paletteOpen && repoPath ? (
          <div className="absolute inset-0 z-40 bg-black/40">
            <SessionSwitcher
              framing="palette"
              pullRequests={inbox.data?.pullRequests ?? []}
              inboxFetchedAt={inbox.data?.fetchedAt ?? null}
              isInboxLoading={inbox.isRefreshing}
              inboxError={inbox.error}
              history={reviewHistory}
              workspaceByPr={{}}
              repoRefs={repoRefs}
              onRefreshInbox={inbox.refresh}
              onPickPullRequest={(pr: GhPullRequestSummary) => {
                setPaletteOpen(false);
                void startSession({
                  target: {
                    kind: "pullRequest",
                    number: pr.number,
                    url: pr.url,
                    baseRef: pr.baseRefName,
                    headRef: null,
                  },
                });
              }}
              onPickTarget={(target) => {
                setPaletteOpen(false);
                void startSession({ target });
              }}
              onDismiss={() => setPaletteOpen(false)}
            />
          </div>
        ) : null}
        <ShortcutHelpOverlay
          open={shortcutHelpOpen}
          shortcuts={reviewShortcutBindings}
          singleKeyShortcutsEnabled={singleKeyShortcutsEnabled}
          onSingleKeyShortcutsChange={setSingleKeyShortcutsEnabled}
          onClose={() => setShortcutHelpOpen(false)}
        />
        {session && session.target.kind === "pullRequest" ? (
          <PublishMergeSheet
            open={publishOpen}
            session={session}
            workspaceState={workspaceState}
            prContext={prContext.context}
            onClose={() => setPublishOpen(false)}
            onPublished={(response: PublishReviewResponse) => {
              updateWorkspaceState((current) =>
                clearPublishedLocalDrafts(current, session, response),
              );
              void inbox.refresh();
              void prContext.refresh();
            }}
            onMerged={() => {
              void inbox.refresh();
              void prContext.refresh();
            }}
          />
        ) : null}
        <HandoffSheet
          open={handoffOpen}
          session={session}
          workspaceState={workspaceState}
          prContext={prContext.context}
          activeFile={activeFile}
          onClose={() => setHandoffOpen(false)}
        />
      </main>
    </TooltipProvider>
  );
}

function countPublishableDrafts(state: ReviewWorkspaceState): number {
  let n = 0;
  for (const fs of Object.values(state)) {
    if (!fs) continue;
    for (const c of fs.inlineComments ?? []) {
      if (c.visibility === "review") n++;
    }
    if (fs.threadReplies) {
      n += countThreadReplyDrafts(fs.threadReplies);
    }
  }
  return n;
}

function clearPublishedLocalDrafts(
  state: ReviewWorkspaceState,
  session: ReviewSession,
  response: PublishReviewResponse,
): ReviewWorkspaceState {
  if (session.target.kind !== "pullRequest") return state;
  const prNumber = session.target.number ?? null;
  if (prNumber === null || response.postedFingerprints.length === 0) return state;

  const accepted = new Set(response.postedFingerprints);
  let changed = false;
  const next: ReviewWorkspaceState = {};

  for (const [fileId, fileState] of Object.entries(state)) {
    const inlineComments = fileState.inlineComments ?? [];
    const keptInlineComments = inlineComments.filter((comment) => {
      if (comment.visibility !== "review") return true;
      const line = comment.endLine ?? comment.startLine ?? 0;
      const fingerprint = fingerprintInline(
        {
          path: comment.path,
          line,
          side: comment.side === "old" ? "LEFT" : "RIGHT",
          startLine: comment.startLine ?? null,
          body: comment.body,
        },
        prNumber,
        response.headSha,
      );
      return !accepted.has(fingerprint);
    });

    const keptReplies: ThreadReplyDraftMap = {};
    const threadReplies = normalizeThreadReplyMap(fileState.threadReplies);
    for (const [threadId, drafts] of Object.entries(threadReplies)) {
      const kept = drafts.filter((draft) => {
        const fingerprint = fingerprintThreadReply(
          threadId,
          draft.body,
          prNumber,
          response.headSha,
        );
        return !accepted.has(fingerprint);
      });
      if (kept.length > 0) {
        keptReplies[threadId] = kept;
      }
    }

    const inlineChanged = keptInlineComments.length !== inlineComments.length;
    const replyChanged =
      Object.values(keptReplies).reduce((count, drafts) => count + drafts.length, 0) !==
      Object.values(threadReplies).reduce((count, drafts) => count + drafts.length, 0);

    if (inlineChanged || replyChanged) {
      changed = true;
      next[fileId] = {
        ...fileState,
        inlineComments: keptInlineComments,
        threadReplies: keptReplies,
      };
    } else {
      next[fileId] = fileState;
    }
  }

  return changed ? next : state;
}

function CenterModeToggle({
  mode,
  onChange,
}: {
  mode: CenterMode;
  onChange: (mode: CenterMode) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-center border-b border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <SlabToggleGroup aria-label="Center pane view mode">
        <SlabButton
          variant={mode === "diff" ? "active" : "default"}
          size="sm"
          onClick={() => onChange("diff")}
          aria-pressed={mode === "diff"}
          aria-label="Diff view"
        >
          diff
        </SlabButton>
        <SlabButton
          variant={mode === "map" ? "active" : "default"}
          size="sm"
          onClick={() => onChange("map")}
          aria-pressed={mode === "map"}
          aria-label="Review map view"
        >
          map
        </SlabButton>
      </SlabToggleGroup>
    </div>
  );
}

function suggestDefaultRefs(refs: RepoRefs) {
  const currentBranch =
    refs.currentBranch && refs.currentBranch !== "HEAD" ? refs.currentBranch : "";
  const currentRef = refs.refs.find((gitRef) => gitRef.name === currentBranch);
  const baseCandidates = [
    currentRef?.upstream,
    "origin/main",
    "main",
    "origin/master",
    "master",
    "upstream/main",
    "upstream/master",
  ].filter(Boolean) as string[];
  const baseRef =
    baseCandidates.find(
      (candidate) =>
        candidate !== currentBranch &&
        refs.refs.some((gitRef) => gitRef.name === candidate),
    ) ?? "";

  if (!currentBranch || !baseRef || isMainBranch(currentBranch)) {
    return { baseRef: "", headRef: "", currentBranch };
  }

  return { baseRef, headRef: currentBranch, currentBranch };
}

function isMainBranch(refName: string) {
  return ["main", "master", "origin/main", "origin/master"].includes(refName);
}

type TargetControlSetters = {
  setTargetKind: (value: ReviewTargetKind) => void;
  setCommitRef: (value: string) => void;
  setRangeFromRef: (value: string) => void;
  setRangeToRef: (value: string) => void;
  setPullRequestNumber: (value: number | null) => void;
  setPullRequestInput: (value: string) => void;
};

function applyTargetControls(target: ReviewTarget, setters: TargetControlSetters) {
  setters.setTargetKind(target.kind);
  switch (target.kind) {
    case "commit":
      setters.setCommitRef(target.commit);
      break;
    case "commitRange":
      setters.setRangeFromRef(target.fromRef);
      setters.setRangeToRef(target.toRef);
      break;
    case "pullRequest":
      setters.setPullRequestNumber(target.number ?? null);
      setters.setPullRequestInput(target.url ?? target.number?.toString() ?? "");
      break;
    case "workingTree":
    case "branch":
      break;
  }
}

function chooseActiveFileId(
  nextSession: ReviewSession,
  previousSession: ReviewSession | null,
  previousActiveFileId: string | null,
  savedActiveFileId: string | null,
) {
  if (nextSession.files.length === 0) {
    return null;
  }
  if (
    savedActiveFileId &&
    nextSession.files.some((file) => file.id === savedActiveFileId)
  ) {
    return savedActiveFileId;
  }
  if (
    previousActiveFileId &&
    nextSession.files.some((file) => file.id === previousActiveFileId)
  ) {
    return previousActiveFileId;
  }

  const previousIndex = previousSession?.files.findIndex(
    (file) => file.id === previousActiveFileId,
  );
  if (previousIndex !== undefined && previousIndex >= 0) {
    return nextSession.files[Math.min(previousIndex, nextSession.files.length - 1)]?.id ?? null;
  }

  return nextSession.files[0]?.id ?? null;
}

function chooseResumeFileId(
  session: ReviewSession,
  state: ReviewWorkspaceState,
  fallbackFileId: string | null,
) {
  if (session.files.length === 0) {
    return null;
  }

  const fallbackFile = fallbackFileId
    ? session.files.find((file) => file.id === fallbackFileId)
    : null;
  if (fallbackFile && needsReview(fileStatus(fallbackFile, state))) {
    return fallbackFile.id;
  }

  const firstUnreviewed = session.files.find((file) =>
    needsReview(fileStatus(file, state)),
  );
  return firstUnreviewed?.id ?? fallbackFile?.id ?? session.files[0]?.id ?? null;
}

function fileStatus(
  file: ReviewSession["files"][number],
  state: ReviewWorkspaceState,
) {
  return state[file.id]?.status ?? file.viewedStatus;
}

function needsReview(status: SessionFileState["status"]) {
  return status !== "reviewed";
}

function shouldImportActiveSession(
  activeSession: ActiveReviewSession,
  currentSession: ReviewSession | null,
  currentSessionOpenedAt: number,
) {
  if (!currentSession) {
    return true;
  }
  if (
    currentSession.order.manifestPath &&
    currentSession.order.manifestPath === activeSession.manifestPath
  ) {
    return false;
  }

  const activatedAt = timestampValue(activeSession.activatedAt);
  return activatedAt > currentSessionOpenedAt;
}

function activeReviewSessionRevision(activeSession: ActiveReviewSession) {
  return `${activeSession.manifestPath}\0${activeSession.manifestHash}\0${activeSession.activatedAt ?? ""}`;
}

function timestampValue(value?: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sameRepoPath(left: string, right: string) {
  return normalizeRepoPath(left) === normalizeRepoPath(right);
}

function normalizeRepoPath(value: string) {
  return value.trim().replace(/[\\/]+$/, "");
}

function shouldKeepCurrentSession(
  nextSession: ReviewSession,
  currentSession: ReviewSession | null,
) {
  return Boolean(
    currentSession && nextSession.order.source === "agent" && nextSession.files.length === 0,
  );
}

function ReviewMapFallback() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
      <div className="h-10 shrink-0 border-b border-[var(--rd-hair)]" />
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
        <div className="rd-display-italic text-[13px] text-[var(--rd-graphite)]">
          Loading map...
        </div>
      </div>
    </div>
  );
}

function isLiveAgentWorktreeSession(
  session: ReviewSession | null,
  manifestPath: string,
): session is ReviewSession {
  if (
    !session ||
    session.order.source !== "agent" ||
    session.order.manifestPath !== manifestPath
  ) {
    return false;
  }

  return (
    session.target.kind === "workingTree" ||
    (session.target.kind === "branch" && session.target.headRef === "working tree")
  );
}

function buildReviewTargetRequest({
  kind,
  baseRef,
  headRef,
  commitRef,
  rangeFromRef,
  rangeToRef,
  pullRequestNumber,
  pullRequestInput,
  selectedPullRequest,
}: {
  kind: ReviewTargetKind;
  baseRef: string | null | undefined;
  headRef: string | null | undefined;
  commitRef: string;
  rangeFromRef: string;
  rangeToRef: string;
  pullRequestNumber: number | null;
  pullRequestInput: string;
  selectedPullRequest: SelectedPullRequest | null;
}): ReviewTargetRequest {
  switch (kind) {
    case "workingTree":
      return { kind: "workingTree" };
    case "branch": {
      const cleanBase = baseRef?.trim();
      const cleanHead = headRef?.trim();
      if (!cleanBase || !cleanHead) {
        throw new Error("Choose both base and head branches.");
      }
      return { kind: "branch", baseRef: cleanBase, headRef: cleanHead };
    }
    case "commit":
      return { kind: "commit", commit: commitRef.trim() || "HEAD" };
    case "commitRange": {
      const cleanFrom = rangeFromRef.trim();
      const cleanTo = rangeToRef.trim();
      if (!cleanFrom || !cleanTo) {
        throw new Error("Choose both commits for the range.");
      }
      return { kind: "commitRange", fromRef: cleanFrom, toRef: cleanTo };
    }
    case "pullRequest": {
      const cleanInput = pullRequestInput.trim();
      const parsedNumber = parsePullRequestNumber(cleanInput);
      const number = selectedPullRequest?.number ?? pullRequestNumber ?? parsedNumber;
      const url = cleanInput.startsWith("http") ? cleanInput : selectedPullRequest?.url;
      if (!number && !url) {
        throw new Error("Choose a pull request or paste a PR URL/number.");
      }
      return {
        kind: "pullRequest",
        number: number ?? null,
        url: url ?? null,
        baseRef: selectedPullRequest?.baseRefName ?? null,
        headRef: null,
      };
    }
  }
}

function reviewTargetToRequest(target: ReviewTarget): ReviewTargetRequest {
  switch (target.kind) {
    case "workingTree":
      return { kind: "workingTree" };
    case "branch":
      return { kind: "branch", baseRef: target.baseRef, headRef: target.headRef };
    case "commit":
      return { kind: "commit", commit: target.commit };
    case "commitRange":
      return {
        kind: "commitRange",
        fromRef: target.fromRef,
        toRef: target.toRef,
      };
    case "pullRequest":
      return {
        kind: "pullRequest",
        number: target.number ?? null,
        url: target.url ?? null,
        baseRef: target.baseRef,
        headRef: target.headRef,
      };
  }
}

function legacyHistoryTargetToRequest(item: ReviewHistoryItem): ReviewTargetRequest {
  if (item.baseRef && item.headRef) {
    return { kind: "branch", baseRef: item.baseRef, headRef: item.headRef };
  }
  if (item.baseRef) {
    return { kind: "branch", baseRef: item.baseRef, headRef: "WORKTREE" };
  }
  return { kind: "workingTree" };
}

function parsePullRequestNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const match = trimmed.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

export default App;
