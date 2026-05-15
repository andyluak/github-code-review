import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle } from "lucide-react";
import { CommandBar } from "@/components/review/CommandBar";
import { DiffCanvas } from "@/components/review/DiffCanvas";
import { EmptyState } from "@/components/review/EmptyState";
import { Inspector } from "@/components/review/Inspector";
import { ReviewRail } from "@/components/review/ReviewRail";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDiffViewMode } from "@/hooks/use-diff-view-mode";
import { useFontZoom } from "@/hooks/use-font-zoom";
import {
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
  loadLastRepoPath,
  loadRecentRepos,
  loadReviewHistory,
  loadReviewSessionSnapshot,
  loadWorkspaceState,
  rememberRepo,
  rememberReviewSession,
  reconcileWorkspaceState,
  saveWorkspaceState,
  toggleReviewedStatus,
  toggleViewedStatus,
} from "@/lib/review-session";
import type {
  InlineComment,
  PullRequestSummary,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
  ReviewTarget,
  ReviewTargetKind,
  ReviewTargetRequest,
  ReviewWorkspaceState,
  SessionFileState,
} from "@/types/review";

type JumpTarget = {
  fileId: string;
  diffPosition?: number;
  expandSection?: "private" | "draft";
  requestedAt: number;
};

const EMPTY_FILE_STATE = createDefaultFileState();

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
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>(() =>
    loadRecentRepos(),
  );
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryItem[]>(() =>
    loadReviewHistory(),
  );
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<ReviewWorkspaceState>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRefsLoading, setIsRefsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const refLoadId = useRef(0);
  const sessionLoadId = useRef(0);
  const lastSeenActiveManifest = useRef<string | null>(null);
  const activeSessionPollRef = useRef(false);
  const sessionRef = useRef<ReviewSession | null>(null);
  const activeFileIdRef = useRef<string | null>(null);
  const latestSessionIdRef = useRef<string | null>(null);
  const latestWorkspaceStateRef = useRef<ReviewWorkspaceState>({});

  const fileById = useMemo(() => {
    return new Map(session?.files.map((file) => [file.id, file]) ?? []);
  }, [session]);
  const activeFile = useMemo(() => {
    return activeFileId ? fileById.get(activeFileId) ?? null : null;
  }, [activeFileId, fileById]);

  const activeFileState = useMemo(
    () => (activeFile ? workspaceState[activeFile.id] ?? EMPTY_FILE_STATE : null),
    [activeFile, workspaceState],
  );

  const selectedPullRequest = useMemo(() => {
    if (!pullRequestNumber) {
      return null;
    }
    return (
      repoRefs?.pullRequests.find((pullRequest) => pullRequest.number === pullRequestNumber) ??
      null
    );
  }, [pullRequestNumber, repoRefs]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  useEffect(() => {
    latestSessionIdRef.current = session?.id ?? null;
    latestWorkspaceStateRef.current = workspaceState;
  }, [session?.id, workspaceState]);

  const patchFileState = useCallback(
    (fileId: string, patch: Partial<SessionFileState>) => {
      setWorkspaceState((current) => ({
        ...current,
        [fileId]: {
          ...createDefaultFileState(),
          ...current[fileId],
          ...patch,
        },
      }));
    },
    [],
  );

  const saveInlineComment = useCallback(
    (fileId: string, comment: InlineComment) => {
      setWorkspaceState((current) => {
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
    [],
  );

  const deleteInlineComment = useCallback((fileId: string, commentId: string) => {
    setWorkspaceState((current) => {
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
  }, []);

  const applySession = useCallback((nextSession: ReviewSession) => {
    const previousSession = sessionRef.current;
    const previousActiveFileId = activeFileIdRef.current;
    const sameSession = previousSession?.id === nextSession.id;

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
    setSession(nextSession);
    setWorkspaceState((current) => {
      const saved = loadWorkspaceState(nextSession.id);
      const baseState = sameSession ? { ...saved, ...current } : saved;
      return reconcileWorkspaceState(nextSession, baseState);
    });
    setActiveFileId(
      chooseActiveFileId(nextSession, previousSession, previousActiveFileId),
    );
    setReviewHistory(rememberReviewSession(nextSession));

    if (nextSession.order.manifestPath) {
      lastSeenActiveManifest.current = nextSession.order.manifestPath;
    }
  }, []);

  const tryLoadActiveSession = useCallback(
    async (path: string) => {
      const activeSession = await getActiveReviewSession({ repoPath: path });
      if (!activeSession) {
        return;
      }
      if (activeSession.manifestPath === lastSeenActiveManifest.current) {
        return;
      }

      lastSeenActiveManifest.current = activeSession.manifestPath;
      const nextSession = await importActiveReviewSession({ repoPath: path });
      if (nextSession) {
        if (shouldKeepCurrentSession(nextSession, sessionRef.current)) {
          setError("Agent session has no matching changed files. Current review kept.");
          return;
        }
        applySession(nextSession);
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
        setRecentRepos(rememberRepo(refs));

        if (options?.applyDefaults) {
          const defaults = suggestDefaultRefs(refs);
          setBaseRef(defaults.baseRef);
          setHeadRef(defaults.headRef);
          setCommitRef("HEAD");
          setRangeFromRef(defaults.baseRef || refs.defaultBranch || "");
          setRangeToRef(defaults.headRef || defaults.currentBranch || "HEAD");
          setPullRequestNumber(refs.pullRequests[0]?.number ?? null);
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
    if (activeSession.manifestPath === lastSeenActiveManifest.current) {
      return;
    }

    lastSeenActiveManifest.current = activeSession.manifestPath;
    const nextSession = await importGlobalActiveReviewSession();
    if (nextSession) {
      if (shouldKeepCurrentSession(nextSession, sessionRef.current)) {
        setError("Agent session has no matching changed files. Current review kept.");
        return;
      }
      applySession(nextSession);
      void loadRefsForRepo(nextSession.repo.root, {
        applyDefaults: false,
        loadActive: false,
      });
    }
  }, [applySession, loadRefsForRepo]);

  const openRepoPath = useCallback(
    (path: string) => {
      setRepoPath(path);
      setRepoRefs(null);
      setBaseRef("");
      setHeadRef("");
      void loadRefsForRepo(path, { applyDefaults: true });
    },
    [loadRefsForRepo],
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
      applySession(nextSession);
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
        applySession(nextSession);
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
        const nextSession = await createReviewSession({
          repoPath: nextRepoPath,
          baseRef: nextBaseRef?.trim() || null,
          headRef: nextHeadRef?.trim() || null,
          target,
        });
        if (requestId !== sessionLoadId.current) {
          return;
        }
        applySession(nextSession);
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
    if (currentSession?.order.source === "agent" && currentSession.order.manifestPath) {
      void refreshAgentSession(currentSession.order.manifestPath);
      return;
    }

    void startSession();
  }, [refreshAgentSession, startSession]);

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

  const changeTargetKind = useCallback(
    (kind: ReviewTargetKind) => {
      setTargetKind(kind);

      try {
        if (kind === "workingTree") {
          startTargetSession({ kind: "workingTree" }, { baseRef: "", headRef: "" });
          return;
        }
        if (kind === "commit") {
          startTargetSession({ kind: "commit", commit: commitRef.trim() || "HEAD" });
          return;
        }
        if (kind === "branch" && baseRef.trim() && headRef.trim()) {
          startTargetSession({
            kind: "branch",
            baseRef: baseRef.trim(),
            headRef: headRef.trim(),
          });
          return;
        }
        if (kind === "commitRange" && rangeFromRef.trim() && rangeToRef.trim()) {
          startTargetSession({
            kind: "commitRange",
            fromRef: rangeFromRef.trim(),
            toRef: rangeToRef.trim(),
          });
          return;
        }
        if (kind === "pullRequest") {
          const target = buildReviewTargetRequest({
            kind,
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
        }
      } catch {
        // Some modes need a second dropdown/input before a valid target exists.
      }
    },
    [
      baseRef,
      commitRef,
      headRef,
      pullRequestInput,
      pullRequestNumber,
      rangeFromRef,
      rangeToRef,
      selectedPullRequest,
      startTargetSession,
    ],
  );

  const changeBaseRef = useCallback(
    (value: string) => {
      setBaseRef(value);
      setTargetKind("branch");
      if (value.trim() && headRef.trim()) {
        startTargetSession(
          { kind: "branch", baseRef: value.trim(), headRef: headRef.trim() },
          { baseRef: value, headRef },
        );
      }
    },
    [headRef, startTargetSession],
  );

  const changeHeadRef = useCallback(
    (value: string) => {
      setHeadRef(value);
      setTargetKind("branch");
      if (baseRef.trim() && value.trim()) {
        startTargetSession(
          { kind: "branch", baseRef: baseRef.trim(), headRef: value.trim() },
          { baseRef, headRef: value },
        );
      }
    },
    [baseRef, startTargetSession],
  );

  const changeCommitRef = useCallback(
    (value: string) => {
      const commit = value.trim() || "HEAD";
      setCommitRef(commit);
      setTargetKind("commit");
      startTargetSession({ kind: "commit", commit });
    },
    [startTargetSession],
  );

  const changeRangeFromRef = useCallback(
    (value: string) => {
      setRangeFromRef(value);
      setTargetKind("commitRange");
      if (value.trim() && rangeToRef.trim()) {
        startTargetSession({
          kind: "commitRange",
          fromRef: value.trim(),
          toRef: rangeToRef.trim(),
        });
      }
    },
    [rangeToRef, startTargetSession],
  );

  const changeRangeToRef = useCallback(
    (value: string) => {
      setRangeToRef(value);
      setTargetKind("commitRange");
      if (rangeFromRef.trim() && value.trim()) {
        startTargetSession({
          kind: "commitRange",
          fromRef: rangeFromRef.trim(),
          toRef: value.trim(),
        });
      }
    },
    [rangeFromRef, startTargetSession],
  );

  const changePullRequestNumber = useCallback(
    (value: number | null) => {
      setPullRequestNumber(value);
      setTargetKind("pullRequest");
      if (!value) {
        return;
      }

      const pullRequest =
        repoRefs?.pullRequests.find((item) => item.number === value) ?? null;
      startTargetSession({
        kind: "pullRequest",
        number: value,
        url: pullRequest?.url ?? null,
        baseRef: pullRequest?.baseRefName ?? null,
        headRef: pullRequest?.headRefOid ?? null,
      });
    },
    [repoRefs, startTargetSession],
  );

  const changePullRequestInput = useCallback((value: string) => {
    setPullRequestInput(value);
  }, []);

  const submitPullRequestInput = useCallback(() => {
    const cleanInput = pullRequestInput.trim();
    if (!cleanInput) {
      return;
    }
    setTargetKind("pullRequest");
    setPullRequestNumber(null);
    startTargetSession({
      kind: "pullRequest",
      number: parsePullRequestNumber(cleanInput),
      url: cleanInput.startsWith("http") ? cleanInput : null,
    });
  }, [pullRequestInput, startTargetSession]);

  const resumeReview = useCallback(
    (item: ReviewHistoryItem) => {
      const cachedSession = loadReviewSessionSnapshot(item.id);

      if (cachedSession) {
        applySession(cachedSession);
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
    setReviewHistory(deleteReviewHistoryItem(item.id));
  }, []);

  const clearHistory = useCallback(() => {
    setReviewHistory(clearReviewHistory());
  }, []);

  const refreshRefs = useCallback(() => {
    if (!repoPath || isRefsLoading) {
      return;
    }

    void loadRefsForRepo(repoPath, { applyDefaults: false });
  }, [isRefsLoading, loadRefsForRepo, repoPath]);

  const handleScrollHandled = useCallback(() => setJumpTarget(null), []);

  const jumpToNote = useCallback(
    (target: { fileId: string; diffPosition?: number; expandSection?: "private" | "draft" }) => {
      if (target.fileId !== activeFileId) {
        // The existing useEffect that depends on activeFileId will advance unseen → viewed.
        setActiveFileId(target.fileId);
      }
      setJumpTarget({ ...target, requestedAt: Date.now() });
    },
    [activeFileId],
  );

  const selectFile = useCallback((fileId: string) => {
    const file = sessionRef.current?.files.find((item) => item.id === fileId);
    setActiveFileId(fileId);
    setWorkspaceState((current) => {
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
  }, []);

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

  useEffect(() => {
    const lastRepoPath = loadLastRepoPath();
    if (lastRepoPath) {
      setRepoPath(lastRepoPath);
      void loadRefsForRepo(lastRepoPath, { applyDefaults: true });
    } else {
      void tryLoadGlobalActiveSession().catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    }
  }, [loadRefsForRepo, tryLoadGlobalActiveSession]);

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
    if (!session || !activeFile) {
      return;
    }

    setWorkspaceState((current) => {
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
  }, [activeFile, session]);

  useEffect(() => {
    if (session) {
      const timer = window.setTimeout(() => {
        saveWorkspaceState(session.id, workspaceState);
      }, 350);
      return () => window.clearTimeout(timer);
    }
  }, [session, workspaceState]);

  useEffect(() => {
    function flushWorkspaceState() {
      if (latestSessionIdRef.current) {
        saveWorkspaceState(
          latestSessionIdRef.current,
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

  const changeRepoPath = useCallback((value: string) => {
    setRepoPath(value);
    setRepoRefs(null);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isEditing) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === "\\") {
        event.preventDefault();
        toggleDiffViewMode();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleDiffViewMode]);

  return (
    <TooltipProvider>
      <main className="rd-app dark flex h-[100dvh] min-h-[100dvh] w-full max-w-full flex-col overflow-hidden">
        <CommandBar
          repoPath={repoPath}
          baseRef={baseRef}
          headRef={headRef}
          targetKind={targetKind}
          commitRef={commitRef}
          rangeFromRef={rangeFromRef}
          rangeToRef={rangeToRef}
          pullRequestNumber={pullRequestNumber}
          pullRequestInput={pullRequestInput}
          isLoading={isLoading}
          session={session}
          workspaceState={workspaceState}
          fontZoom={fontZoom}
          repoRefs={repoRefs}
          recentRepos={recentRepos}
          reviewHistory={reviewHistory}
          isRefsLoading={isRefsLoading}
          onResetFontZoom={resetFontZoom}
          onRepoPathChange={changeRepoPath}
          onBaseRefChange={changeBaseRef}
          onHeadRefChange={changeHeadRef}
          onTargetKindChange={changeTargetKind}
          onCommitRefChange={changeCommitRef}
          onRangeFromRefChange={changeRangeFromRef}
          onRangeToRefChange={changeRangeToRef}
          onPullRequestNumberChange={changePullRequestNumber}
          onPullRequestInputChange={changePullRequestInput}
          onPullRequestInputSubmit={submitPullRequestInput}
          onPickRepo={pickRepo}
          onSelectRecentRepo={openRepoPath}
          onSelectReviewHistory={resumeReview}
          onDeleteReviewHistory={deleteHistoryItem}
          onClearReviewHistory={clearHistory}
          onRefreshRefs={refreshRefs}
          onImportAgentSession={importAgentSession}
          onCreateSession={createSession}
        />

        {error ? (
          <div className="flex items-center gap-2 border-b border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] px-4 py-2 text-sm text-[var(--rd-del)]">
            <AlertCircle className="size-4" />
            {error}
          </div>
        ) : null}

        {session ? (
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel defaultSize="24%" minSize="18%" maxSize="34%">
              <ReviewRail
                session={session}
                activeFileId={activeFileId}
                workspaceState={workspaceState}
                onSelectFile={selectFile}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="52%" minSize="36%">
              <DiffCanvas
                file={activeFile}
                fileState={activeFileState}
                jumpTarget={jumpTarget}
                onScrollHandled={handleScrollHandled}
                onMarkViewed={markActiveViewed}
                onMarkReviewed={markActiveReviewed}
                onSaveInlineComment={saveInlineComment}
                onDeleteInlineComment={deleteInlineComment}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="24%" minSize="20%" maxSize="36%">
              <Inspector
                session={session}
                file={activeFile}
                fileState={activeFileState}
                workspaceState={workspaceState}
                onJumpToNote={jumpToNote}
                onPatchFileState={patchFileState}
                onMarkViewed={markActiveViewed}
                onMarkReviewed={markActiveReviewed}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <EmptyState onPickRepo={pickRepo} />
        )}
      </main>
    </TooltipProvider>
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
) {
  if (nextSession.files.length === 0) {
    return null;
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

function shouldKeepCurrentSession(
  nextSession: ReviewSession,
  currentSession: ReviewSession | null,
) {
  return Boolean(
    currentSession && nextSession.order.source === "agent" && nextSession.files.length === 0,
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
  selectedPullRequest: PullRequestSummary | null;
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
        headRef: selectedPullRequest?.headRefOid ?? null,
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
