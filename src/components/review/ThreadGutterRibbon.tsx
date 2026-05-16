import { useMemo } from "react";
import type { ReviewThread } from "@/types/github";

export function ThreadGutterRibbon({
  threads,
  rowOffsets,
  onPick,
}: {
  threads: ReviewThread[];
  rowOffsets: Record<string, number>;
  onPick: (threadId: string) => void;
}) {
  const dots = useMemo(
    () =>
      threads
        .map((t) => {
          const key = `${t.path}:${t.line ?? t.originalLine ?? 0}:${t.diffSide}`;
          const top = rowOffsets[key];
          if (top === undefined) return null;
          return {
            id: t.id,
            top,
            resolved: t.isResolved,
            outdated: t.isOutdated,
          };
        })
        .filter(Boolean) as {
        id: string;
        top: number;
        resolved: boolean;
        outdated: boolean;
      }[],
    [threads, rowOffsets],
  );
  return (
    <div className="pointer-events-none absolute left-0 top-0 h-full w-1.5">
      {dots.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onPick(d.id)}
          style={{ top: d.top }}
          className={[
            "pointer-events-auto absolute size-1 -translate-x-1/2 rounded-full",
            d.resolved
              ? "bg-[var(--rd-pencil)]"
              : d.outdated
                ? "bg-[var(--rd-cream-2)]"
                : "bg-[var(--rd-vermillion-2)]",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
