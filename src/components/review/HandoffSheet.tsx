import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Clipboard, FileJson, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildHandoffBundle,
  handoffScopeLabel,
  renderHandoffMarkdown,
  type HandoffScope,
} from "@/lib/handoff";
import type { PullRequestContext } from "@/types/github";
import type {
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

type HandoffFormat = "markdown" | "json";

type Props = {
  open: boolean;
  session: ReviewSession | null;
  workspaceState: ReviewWorkspaceState;
  prContext: PullRequestContext | null;
  activeFile: ReviewFile | null;
  onClose: () => void;
};

const SCOPES: HandoffScope[] = ["session", "current-file", "notes", "pr-comments"];

export function HandoffSheet({
  open,
  session,
  workspaceState,
  prContext,
  activeFile,
  onClose,
}: Props) {
  const [scope, setScope] = useState<HandoffScope>("session");
  const [format, setFormat] = useState<HandoffFormat>("markdown");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const bundle = useMemo(() => {
    if (!session) return null;
    return buildHandoffBundle({
      session,
      workspaceState,
      prContext,
      activeFile,
      scope,
    });
  }, [activeFile, prContext, scope, session, workspaceState]);

  const output = useMemo(() => {
    if (!bundle) return "";
    return format === "json"
      ? `${JSON.stringify(bundle, null, 2)}\n`
      : renderHandoffMarkdown(bundle);
  }, [bundle, format]);

  if (!open || !session || !bundle) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="absolute right-0 top-12 bottom-0 z-30 flex w-[560px] flex-col border-l border-[var(--rd-hair)] bg-[var(--rd-ink)] text-[12px] text-[var(--rd-cream)]">
      <header className="flex items-center justify-between border-b border-[var(--rd-hair)] px-4 py-3">
        <div>
          <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">
            Agent handoff
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--rd-pencil)]">
            {bundle.target.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded text-[var(--rd-pencil)] hover:bg-[var(--rd-ink-2)] hover:text-[var(--rd-cream)]"
          aria-label="Close handoff"
        >
          <X className="size-4" />
        </button>
      </header>

      <section className="border-b border-[var(--rd-hair)] px-4 py-3">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
          Scope
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {SCOPES.map((item) => {
            const disabled =
              (item === "current-file" && !activeFile) ||
              (item === "pr-comments" && !prContext);
            return (
              <button
                key={item}
                type="button"
                disabled={disabled}
                onClick={() => setScope(item)}
                className={[
                  "h-8 rounded-md border px-2 font-mono text-[10px]",
                  scope === item
                    ? "border-[var(--rd-vermillion-line)] bg-[var(--rd-vermillion-bg)] text-[var(--rd-cream)]"
                    : "border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
                  disabled ? "cursor-not-allowed opacity-40" : "",
                ].join(" ")}
              >
                {handoffScopeLabel(item)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-b border-[var(--rd-hair)] px-4 py-3">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
          Format
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <FormatButton
            active={format === "markdown"}
            icon={<FileText className="size-3.5" />}
            label="Markdown"
            onClick={() => setFormat("markdown")}
          />
          <FormatButton
            active={format === "json"}
            icon={<FileJson className="size-3.5" />}
            label="JSON"
            onClick={() => setFormat("json")}
          />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 border-b border-[var(--rd-hair)] px-4 py-3 font-mono text-[10px] text-[var(--rd-pencil)]">
        <Metric label="notes" value={bundle.summary.notes} />
        <Metric label="drafts" value={bundle.summary.reviewInlineDrafts + bundle.summary.threadReplyDrafts} />
        <Metric label="threads" value={bundle.summary.unresolvedPrThreads} />
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--rd-hair)] px-4 py-2">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
            Preview
          </div>
          {copyState === "error" ? (
            <span className="font-mono text-[10px] text-[var(--rd-del)]">
              Clipboard blocked
            </span>
          ) : null}
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-[var(--rd-ink-2)] p-4 font-mono text-[10.5px] leading-5 text-[var(--rd-cream-2)]">
          {output}
        </pre>
      </section>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-4 py-3">
        <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
          {bundle.repo.branch} · {bundle.summary.includedFiles} files
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={() => {
              void copy();
            }}
          >
            {copyState === "copied" ? (
              <Check className="size-3.5" />
            ) : (
              <Clipboard className="size-3.5" />
            )}
            {copyState === "copied" ? "Copied" : "Copy"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function FormatButton({
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
      onClick={onClick}
      className={[
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px]",
        active
          ? "border-[var(--rd-cream-2)] bg-[var(--rd-ink-3)] text-[var(--rd-cream)]"
          : "border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-2 py-1.5">
      <div className="text-[var(--rd-cream)]">{value}</div>
      <div className="uppercase tracking-[0.12em]">{label}</div>
    </div>
  );
}
