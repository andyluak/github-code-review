import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  onPickRepo: () => void;
};

export function EmptyState({ onPickRepo }: EmptyStateProps) {
  return (
    <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[var(--rd-ink)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(255, 79, 63, 0.08), transparent 36%), radial-gradient(circle at 82% 78%, rgba(236, 230, 216, 0.04), transparent 32%)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-12 top-14 h-px bg-gradient-to-r from-transparent via-[var(--rd-hair-2)] to-transparent" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-start px-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--rd-pencil)]">
          Review Desk · No. 01
        </div>

        <h1 className="mt-8 rd-display text-balance text-[clamp(3.5rem,7vw,7.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-[var(--rd-cream)]">
          <span className="text-[var(--rd-vermillion)]">Turn</span> a messy patch
          <br />
          into a calm review pass.
        </h1>

        <p className="mt-8 max-w-xl text-[15px] leading-7 text-[var(--rd-cream-2)]">
          Open a repository, hide generated noise, walk a focused queue, and keep
          private notes separate from publishable comments.
        </p>

        <div className="mt-9 flex items-center gap-4">
          <Button
            type="button"
            className="h-10 rounded-md bg-[var(--rd-cream)] px-5 text-[13px] text-[var(--rd-ink)] hover:bg-white"
            onClick={onPickRepo}
          >
            <FolderOpen className="size-4" />
            Open repository
          </Button>
          <span className="rd-display-italic text-[13px] text-[var(--rd-graphite)]">
            or drop an agent manifest from the bar above.
          </span>
        </div>

        <div className="mt-16 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)]">
          <span className="h-px w-10 bg-[var(--rd-hair-2)]" aria-hidden />
          <span>Local · Tauri · Git</span>
          <span className="h-px w-10 bg-[var(--rd-hair-2)]" aria-hidden />
        </div>
      </div>
    </div>
  );
}
