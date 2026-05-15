import type { ChangeKind, ViewedStatus } from "@/types/review";

export function statusTone(status: ViewedStatus) {
  switch (status) {
    case "reviewed":
      return "border-[var(--rd-accent-border)] bg-[var(--rd-accent-soft)] text-[var(--rd-accent-strong)]";
    case "viewed":
      return "border-[var(--rd-sage-border)] bg-[var(--rd-sage-soft)] text-[var(--rd-sage)]";
    case "changedSinceReviewed":
    case "changedSinceViewed":
      return "border-[var(--rd-clay-border)] bg-[var(--rd-clay-soft)] text-[var(--rd-clay)]";
    case "unseen":
      return "border-[var(--rd-border)] bg-[var(--rd-bg-soft)] text-[var(--rd-faint)]";
  }
}

export function changeTone(changeKind: ChangeKind) {
  switch (changeKind) {
    case "added":
      return "text-[var(--rd-sage)]";
    case "deleted":
      return "text-[var(--rd-clay)]";
    case "renamed":
      return "text-[var(--rd-accent)]";
    case "modified":
      return "text-[var(--rd-muted)]";
  }
}
