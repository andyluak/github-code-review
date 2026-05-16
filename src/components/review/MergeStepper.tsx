import { useState } from "react";
import { Button } from "@/components/ui/button";
import { mergePullRequest } from "@/lib/github";
import type {
  MergePullRequestResponse,
  PullRequestMergeReadiness,
} from "@/types/github";

type MergeMethod = "MERGE" | "SQUASH" | "REBASE";

type Props = {
  open: boolean;
  repoPath: string;
  number: number;
  readiness: PullRequestMergeReadiness | null;
  defaultMethod?: MergeMethod;
  defaultDeleteBranch?: boolean;
  onClose: () => void;
  onMerged: (response: MergePullRequestResponse) => void;
};

export function MergeStepper(props: Props) {
  const {
    open,
    repoPath,
    number,
    readiness,
    defaultMethod,
    defaultDeleteBranch,
    onClose,
    onMerged,
  } = props;
  const allowed = readiness?.allowedMergeMethods ?? [];
  const [method, setMethod] = useState<MergeMethod>(
    pickInitialMethod(allowed, defaultMethod, readiness?.defaultMergeMethod),
  );
  const [deleteBranch, setDeleteBranch] = useState<boolean>(
    Boolean(
      (defaultDeleteBranch ?? readiness?.deleteBranchOnMerge) &&
        readiness?.safeToDeleteBranch,
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const blockers = readiness?.mergeBlockers ?? [];
  const cannotMerge =
    !readiness ||
    !readiness.viewerCanMerge ||
    blockers.length > 0 ||
    !readiness.expectedHeadSha ||
    !(allowed as string[]).includes(method);

  async function onMergeClick() {
    if (!readiness) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await mergePullRequest({
        repoPath,
        number,
        expectedHeadSha: readiness.expectedHeadSha,
        method,
        deleteBranch: deleteBranch && readiness.safeToDeleteBranch,
      });
      onMerged(result);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute right-0 top-12 bottom-0 z-30 w-[420px] border-l border-[var(--rd-hair)] bg-[var(--rd-ink)] p-4 text-[12px] text-[var(--rd-cream)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="rd-display-italic text-[14px]">Merge pull request</h2>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
        >
          close
        </button>
      </div>
      <div className="space-y-2 font-mono text-[11px]">
        <div>
          <div className="mb-1 text-[var(--rd-pencil)]">Merge method</div>
          <div className="flex gap-2">
            {allowed.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m as MergeMethod)}
                className={
                  method === m
                    ? "rounded bg-[var(--rd-vermillion)] px-2 py-1 text-white"
                    : "rounded bg-[var(--rd-ink-2)] px-2 py-1 text-[var(--rd-pencil)]"
                }
              >
                {m}
              </button>
            ))}
          </div>
          {allowed.length === 0 ? (
            <div className="mt-2 text-[var(--rd-del)]">
              No merge methods are enabled for this repository.
            </div>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-[var(--rd-cream-2)]">
          <input
            type="checkbox"
            checked={deleteBranch}
            disabled={!readiness?.safeToDeleteBranch}
            onChange={(e) => setDeleteBranch(e.currentTarget.checked)}
          />
          Delete head branch after merge{" "}
          {!readiness?.safeToDeleteBranch ? "(fork — disabled)" : ""}
        </label>
        {blockers.length > 0 ? (
          <ul className="space-y-1 text-[var(--rd-del)]">
            {blockers.map((b) => (
              <li key={b}>⚠ {b}</li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <div className="whitespace-pre-wrap text-[var(--rd-del)]">
            {error}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          onClick={() => {
            void onMergeClick();
          }}
          disabled={cannotMerge || submitting}
        >
          {submitting ? "Merging…" : "Merge"}
        </Button>
      </div>
    </div>
  );
}

function pickInitialMethod(
  allowed: string[],
  defaultMethod?: MergeMethod,
  repositoryDefault?: MergeMethod | null,
): MergeMethod {
  if (defaultMethod && allowed.includes(defaultMethod)) return defaultMethod;
  if (repositoryDefault && allowed.includes(repositoryDefault)) {
    return repositoryDefault;
  }
  return (allowed.find((method) => method === "SQUASH") ??
    allowed[0] ??
    "SQUASH") as MergeMethod;
}
