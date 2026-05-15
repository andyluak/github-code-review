import { FolderOpen, GitPullRequestArrow, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  onPickRepo: () => void;
};

export function EmptyState({ onPickRepo }: EmptyStateProps) {
  return (
    <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[var(--rd-bg)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(200,165,92,0.13),transparent_34%),radial-gradient(circle_at_78%_28%,rgba(166,179,148,0.07),transparent_30%),linear-gradient(135deg,rgba(255,236,190,0.045),transparent_42%)]" />
      <div className="absolute inset-x-12 top-12 h-px bg-gradient-to-r from-transparent via-[rgba(222,193,128,0.28)] to-transparent" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-8 text-center">
        <div className="mb-8 flex items-center gap-2 rounded-full border border-[var(--rd-border)] bg-[var(--rd-panel)] px-3 py-1 text-xs text-[var(--rd-muted)] shadow-[inset_0_1px_0_rgba(255,236,190,0.035)]">
          <GitPullRequestArrow className="size-3.5 text-[var(--rd-accent)]" />
          Local-first review session engine
        </div>
        <h1 className="max-w-5xl text-balance text-[clamp(3rem,6vw,6.6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-[var(--rd-text)]">
          Turn a messy patch into a calm review pass.
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--rd-muted)]">
          Open a repo, create a review session, hide generated noise,
          track viewed status, and keep private notes separate from publishable
          comments.
        </p>
        <div className="mt-9 flex items-center gap-3">
          <Button
            type="button"
            className="h-10 bg-[var(--rd-accent)] px-5 text-[var(--rd-ink)] hover:bg-[var(--rd-accent-strong)]"
            onClick={onPickRepo}
          >
            <FolderOpen className="size-4" />
            Open Repository
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 border-[var(--rd-border)] bg-[var(--rd-panel)] px-5 text-[var(--rd-text-soft)] hover:bg-[var(--rd-panel-2)]"
            disabled
          >
            <Sparkles className="size-4" />
            Agent Session Soon
          </Button>
        </div>
      </div>
    </div>
  );
}
