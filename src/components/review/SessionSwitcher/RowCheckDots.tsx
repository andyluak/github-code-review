import type { ChecksSummary } from "@/types/github";

export function RowCheckDots({ summary }: { summary: ChecksSummary }) {
  const dot = (filled: boolean, color: "pass" | "pending" | "fail") => (
    <span
      aria-hidden
      className={[
        "inline-block size-1.5 rounded-full",
        filled
          ? color === "fail"
            ? "bg-[var(--rd-vermillion)]"
            : color === "pending"
              ? "bg-[var(--rd-cream-2)]"
              : "bg-[var(--rd-cream)]"
          : "ring-1 ring-[var(--rd-hair-2)] ring-inset",
      ].join(" ")}
    />
  );
  const showPass = summary.state === "PASSING";
  const showPending = summary.state === "PENDING";
  const showFail = summary.state === "FAILING";
  return (
    <span
      className="inline-flex items-center gap-1"
      title={String(summary.state)}
    >
      {dot(showPass, "pass")}
      {dot(showPending, "pending")}
      {dot(showFail, "fail")}
    </span>
  );
}
