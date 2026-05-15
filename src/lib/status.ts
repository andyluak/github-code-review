import type { ChangeKind, ViewedStatus } from "@/types/review";

export function statusTone(status: ViewedStatus) {
  switch (status) {
    case "reviewed":
      return "border-[var(--rd-vermillion-line)] bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]";
    case "viewed":
      return "border-[var(--rd-hair-2)] bg-[var(--rd-ink-3)] text-[var(--rd-cream-2)]";
    case "changedSinceReviewed":
    case "changedSinceViewed":
      return "border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] text-[var(--rd-del)]";
    case "unseen":
      return "border-[var(--rd-hair)] bg-transparent text-[var(--rd-graphite)]";
  }
}

export function changeTone(changeKind: ChangeKind) {
  switch (changeKind) {
    case "added":
      return "text-[var(--rd-add)]";
    case "deleted":
      return "text-[var(--rd-del)]";
    case "renamed":
      return "text-[var(--rd-vermillion-2)]";
    case "modified":
      return "text-[var(--rd-graphite)]";
  }
}
