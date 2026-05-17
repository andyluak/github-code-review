import type { ReviewThread, ThreadComment } from "@/types/github";

export function threadCommentAuthorLabel(
  comment: ThreadComment | null | undefined,
  fallback = "unknown",
): string {
  if (!comment) return fallback;
  if (comment.viewerDidAuthor) return "me";
  return comment.author || fallback;
}

export function threadLineLabel(
  thread: ReviewThread,
  fallback = "?",
): string {
  const end = thread.line ?? thread.originalLine;
  const start = thread.startLine;
  if (start !== null && start !== undefined && end !== null && end !== undefined) {
    return start !== end ? `L${start}-L${end}` : `L${end}`;
  }
  if (end !== null && end !== undefined) return `L${end}`;
  return `L${fallback}`;
}

export function threadJumpLine(thread: ReviewThread): number {
  return thread.startLine ?? thread.line ?? thread.originalLine ?? 0;
}
