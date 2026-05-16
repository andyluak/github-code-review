import { useState } from "react";
import { MarkdownView } from "@/components/review/MarkdownView";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
};

export function MarkdownTextarea({
  value,
  onChange,
  placeholder,
  rows = 6,
  ariaLabel,
}: Props) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  return (
    <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)]">
      <div className="flex items-center gap-2 border-b border-[var(--rd-hair)] px-2.5 py-1 font-mono text-[10px] text-[var(--rd-pencil)]">
        <button
          type="button"
          onClick={() => setMode("write")}
          className={
            mode === "write"
              ? "rounded bg-[var(--rd-ink-3)] px-2 py-0.5 text-[var(--rd-cream)]"
              : "px-2 py-0.5 hover:text-[var(--rd-cream)]"
          }
        >
          write
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={
            mode === "preview"
              ? "rounded bg-[var(--rd-ink-3)] px-2 py-0.5 text-[var(--rd-cream)]"
              : "px-2 py-0.5 hover:text-[var(--rd-cream)]"
          }
        >
          preview
        </button>
        <span className="ml-auto select-none text-[var(--rd-graphite)]">
          B · I · ` · &lt;/&gt;
        </span>
      </div>
      {mode === "write" ? (
        <textarea
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={placeholder ?? "Add a summary…"}
          rows={rows}
          className="block w-full resize-none border-0 bg-transparent px-3 py-2 text-[12px] leading-5 text-[var(--rd-cream)] outline-none placeholder:text-[var(--rd-graphite)]"
        />
      ) : (
        <MarkdownView className="min-h-[64px] px-3 py-2 font-sans">
          {value || "*Nothing to preview.*"}
        </MarkdownView>
      )}
    </div>
  );
}
