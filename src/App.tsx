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
import { useFontZoom } from "@/hooks/use-font-zoom";
import {
  createDefaultFileState,
  createReviewSession,
  getActiveReviewSession,
  getGlobalActiveReviewSession,
  importActiveReviewSession,
  importGlobalActiveReviewSession,
  importReviewSession,
  listReviewRefs,
  loadLastRepoPath,
  loadRecentRepos,
  loadReviewHistory,
  loadWorkspaceState,
  nextViewedStatus,
  rememberRepo,
  rememberReviewSession,
  saveWorkspaceState,
} from "@/lib/review-session";
import type {
  InlineComment,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
  ReviewWorkspaceState,
  SessionFileState,
} from "@/types/review";

function App() {
  const { fontZoom, resetFontZoom } = useFontZoom();
  const [repoPath, setRepoPath] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [headRef, setHeadRef] = useState("");
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
  const refLoadId = useRef(0);
  const lastSeenActiveManifest = useRef<string | null>(null);

  const activeFile = useMemo(() => {
    return session?.files.find((file) => file.id === activeFileId) ?? null;
  }, [activeFileId, session]);

  const activeFileState = activeFile
    ? workspaceState[activeFile.id] ?? createDefaultFileState()
    : null;

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
    setRepoPath(nextSession.repo.root);
    setBaseRef(nextSession.repo.baseRef ?? "");
    setHeadRef(nextSession.repo.headRef ?? "");
    setSession(nextSession);
    setWorkspaceState(loadWorkspaceState(nextSession.id));
    setActiveFileId(nextSession.files[0]?.id ?? null);
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

  const startSession = useCallback(
    async (overrides?: {
      repoPath?: string;
      baseRef?: string | null;
      headRef?: string | null;
    }) => {
      const nextRepoPath = overrides?.repoPath ?? repoPath;
      const nextBaseRef = overrides?.baseRef ?? baseRef;
      const nextHeadRef = overrides?.headRef ?? headRef;

      if (!nextRepoPath || isLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const nextSession = await createReviewSession({
          repoPath: nextRepoPath,
          baseRef: nextBaseRef?.trim() || null,
          headRef: nextHeadRef?.trim() || null,
        });
        applySession(nextSession);
        void loadRefsForRepo(nextSession.repo.root, {
          applyDefaults: false,
          loadActive: false,
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setIsLoading(false);
      }
    },
    [applySession, baseRef, headRef, isLoading, loadRefsForRepo, repoPath],
  );

  const createSession = useCallback(() => {
    void startSession();
  }, [startSession]);

  const resumeReview = useCallback(
    (item: ReviewHistoryItem) => {
      setRepoPath(item.repoRoot);
      setBaseRef(item.baseRef ?? "");
      setHeadRef(item.headRef ?? "");
      void loadRefsForRepo(item.repoRoot, { applyDefaults: false });
      void startSession({
        repoPath: item.repoRoot,
        baseRef: item.baseRef,
        headRef: item.headRef,
      });
    },
    [loadRefsForRepo, startSession],
  );

  const refreshRefs = useCallback(() => {
    if (!repoPath || isRefsLoading) {
      return;
    }

    void loadRefsForRepo(repoPath, { applyDefaults: false });
  }, [isRefsLoading, loadRefsForRepo, repoPath]);

  const selectFile = useCallback(
    (fileId: string) => {
      setActiveFileId(fileId);
      const currentStatus = workspaceState[fileId]?.status ?? "unseen";
      patchFileState(fileId, {
        status: nextViewedStatus(currentStatus, "viewed"),
      });
    },
    [patchFileState, workspaceState],
  );

  const markActiveViewed = useCallback(() => {
    if (!activeFile) {
      return;
    }

    patchFileState(activeFile.id, {
      status: nextViewedStatus(activeFileState?.status, "viewed"),
    });
  }, [activeFile, activeFileState?.status, patchFileState]);

  const markActiveReviewed = useCallback(() => {
    if (!activeFile) {
      return;
    }

    patchFileState(activeFile.id, {
      status: nextViewedStatus(activeFileState?.status, "reviewed"),
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

    const timer = window.setInterval(() => {
      void tryLoadGlobalActiveSession().catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    }, 2500);

    return () => window.clearInterval(timer);
  }, [isLoading, tryLoadGlobalActiveSession]);

  useEffect(() => {
    if (!repoPath || isLoading) {
      return;
    }

    const timer = window.setInterval(() => {
      void tryLoadActiveSession(repoPath).catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    }, 2500);

    return () => window.clearInterval(timer);
  }, [isLoading, repoPath, tryLoadActiveSession]);

  useEffect(() => {
    if (!session || !activeFileId) {
      return;
    }

    setWorkspaceState((current) => {
      const fileState = current[activeFileId] ?? createDefaultFileState();
      if (fileState.status !== "unseen") {
        return current;
      }

      return {
        ...current,
        [activeFileId]: {
          ...fileState,
          status: "viewed",
        },
      };
    });
  }, [activeFileId, session]);

  useEffect(() => {
    if (session) {
      saveWorkspaceState(session.id, workspaceState);
    }
  }, [session, workspaceState]);

  return (
    <TooltipProvider>
      <main className="rd-app dark flex h-[100dvh] min-h-[100dvh] w-full max-w-full flex-col overflow-hidden">
        <CommandBar
          repoPath={repoPath}
          baseRef={baseRef}
          headRef={headRef}
          isLoading={isLoading}
          session={session}
          fontZoom={fontZoom}
          repoRefs={repoRefs}
          recentRepos={recentRepos}
          reviewHistory={reviewHistory}
          isRefsLoading={isRefsLoading}
          onResetFontZoom={resetFontZoom}
          onRepoPathChange={(value) => {
            setRepoPath(value);
            setRepoRefs(null);
          }}
          onBaseRefChange={setBaseRef}
          onHeadRefChange={setHeadRef}
          onPickRepo={pickRepo}
          onSelectRecentRepo={openRepoPath}
          onSelectReviewHistory={resumeReview}
          onRefreshRefs={refreshRefs}
          onImportAgentSession={importAgentSession}
          onCreateSession={createSession}
        />

        {error ? (
          <div className="flex items-center gap-2 border-b border-[var(--rd-clay-border)] bg-[var(--rd-clay-soft)] px-4 py-2 text-sm text-[var(--rd-clay)]">
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
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="52%" minSize="36%">
              <DiffCanvas
                file={activeFile}
                fileState={activeFileState}
                onMarkViewed={markActiveViewed}
                onMarkReviewed={markActiveReviewed}
                onSaveInlineComment={saveInlineComment}
                onDeleteInlineComment={deleteInlineComment}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="24%" minSize="20%" maxSize="36%">
              <Inspector
                session={session}
                file={activeFile}
                fileState={activeFileState}
                workspaceState={workspaceState}
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
    return { baseRef: "", headRef: "" };
  }

  return { baseRef, headRef: currentBranch };
}

function isMainBranch(refName: string) {
  return ["main", "master", "origin/main", "origin/master"].includes(refName);
}

export default App;
