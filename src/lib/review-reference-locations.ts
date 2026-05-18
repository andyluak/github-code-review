import type {
  ReviewReferenceLookupRequest,
  ReviewReferenceSourceLocation,
  ReviewReferenceTarget,
} from "@/types/references";
import type { ReviewFile, ReviewSession } from "@/types/review";

export type ReviewReferenceDiffIndex = {
  fileByPath: Map<string, ReviewFile>;
  orderByFileId: Map<string, number>;
  diffPositionByPathLine: Map<string, number>;
};

export function buildReviewReferenceDiffIndex(
  session: ReviewSession | null,
): ReviewReferenceDiffIndex {
  const fileByPath = new Map<string, ReviewFile>();
  const orderByFileId = new Map<string, number>();
  const diffPositionByPathLine = new Map<string, number>();

  for (const [fileIndex, file] of (session?.files ?? []).entries()) {
    fileByPath.set(file.path, file);
    orderByFileId.set(file.id, fileIndex);
    for (const [hunkIndex, hunk] of file.hunks.entries()) {
      for (const [lineIndex, line] of hunk.lines.entries()) {
        if (line.newLine === null || line.newLine === undefined) {
          continue;
        }
        const diffPosition =
          hunkIndex * 100000 + (line.diffPosition ?? lineIndex + 1);
        diffPositionByPathLine.set(
          referenceLineKey(file.path, line.newLine),
          diffPosition,
        );
      }
    }
  }

  return {
    fileByPath,
    orderByFileId,
    diffPositionByPathLine,
  };
}

export function mapReviewReferenceTargets({
  index,
  origin,
  references,
}: {
  index: ReviewReferenceDiffIndex;
  origin: ReviewReferenceLookupRequest;
  references: ReviewReferenceSourceLocation[];
}): ReviewReferenceTarget[] {
  const seen = new Set<string>();
  const targets: ReviewReferenceTarget[] = [];

  for (const reference of references) {
    const file = index.fileByPath.get(reference.path);
    if (!file) {
      continue;
    }
    const key = `${reference.path}:${reference.lineNumber}:${reference.column}:${reference.length}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const isOrigin =
      reference.path === origin.path &&
      reference.lineNumber === origin.lineNumber &&
      reference.column === origin.column;
    if (isOrigin) {
      continue;
    }
    targets.push({
      ...reference,
      fileId: file.id,
      diffPosition:
        index.diffPositionByPathLine.get(
          referenceLineKey(reference.path, reference.lineNumber),
        ) ?? null,
      isOrigin,
    });
  }

  return targets.sort((left, right) => {
    const leftOrder = index.orderByFileId.get(left.fileId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = index.orderByFileId.get(right.fileId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (left.lineNumber !== right.lineNumber) {
      return left.lineNumber - right.lineNumber;
    }
    return left.column - right.column;
  });
}

function referenceLineKey(path: string, lineNumber: number) {
  return `${path}\u0000${lineNumber}`;
}
