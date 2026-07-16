import { useCallback, useEffect, useState } from "react";
import { loadReviewReferenceSources } from "@/lib/review-session";
import type { ReviewReferenceIndex } from "@/lib/review-reference-engine";
import type {
  ReviewReferenceLookupRequest,
  ReviewReferenceSourceLocation,
  ReviewReferenceStatus,
} from "@/types/references";
import type { ReviewSession } from "@/types/review";

type ReadyReferenceState = {
  status: "ready";
  index: ReviewReferenceIndex;
  warnings: string[];
};

type ReviewReferenceState =
  | { status: "idle"; index: null; warnings: string[]; error: null }
  | { status: "loading"; index: null; warnings: string[]; error: null }
  | (ReadyReferenceState & { error: null })
  | { status: "error"; index: null; warnings: string[]; error: string };

const MAX_REFERENCE_SOURCE_BYTES = 512 * 1024;
const referenceIndexCache = new Map<string, Promise<ReadyReferenceState>>();

export function useReviewReferences(session: ReviewSession | null) {
  const [state, setState] = useState<ReviewReferenceState>({
    status: "idle",
    index: null,
    warnings: [],
    error: null,
  });

  useEffect(() => {
    if (!session) {
      setState({ status: "idle", index: null, warnings: [], error: null });
      return;
    }

    const key = referenceCacheKey(session);
    let cancelled = false;
    setState({ status: "loading", index: null, warnings: [], error: null });

    const cached = referenceIndexCache.get(key) ?? buildReferenceIndex(session);
    referenceIndexCache.set(key, cached);

    void cached
      .then((ready) => {
        if (!cancelled) {
          setState({ ...ready, error: null });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setState({
            status: "error",
            index: null,
            warnings: [],
            error: caught instanceof Error ? caught.message : String(caught),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const findReferences = useCallback(
    (request: ReviewReferenceLookupRequest): ReviewReferenceSourceLocation[] => {
      if (state.status !== "ready") {
        return [];
      }
      return state.index.findReferences(request);
    },
    [state],
  );

  return {
    status: state.status as ReviewReferenceStatus,
    warnings: state.warnings,
    error: state.error,
    findReferences,
  };
}

async function buildReferenceIndex(
  session: ReviewSession,
): Promise<ReadyReferenceState> {
  const sources = await loadReviewReferenceSources({
    repoPath: session.repo.root,
    files: session.files.map((file) => ({
      path: file.path,
      changeKind: file.changeKind,
    })),
    diffTarget: session.patchArtifact.diffTarget,
    includeImports: true,
    maxFileBytes: MAX_REFERENCE_SOURCE_BYTES,
  });
  const engine = await import("@/lib/review-reference-engine");
  const index = await engine.buildReviewReferenceIndex(sources.files);
  return {
    status: "ready",
    index,
    warnings: sources.warnings.map((warning) =>
      warning.path ? `${warning.path}: ${warning.message}` : warning.message,
    ),
  };
}

function referenceCacheKey(session: ReviewSession) {
  return `${session.id}:${session.snapshotHash}`;
}
