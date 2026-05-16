import type {
  InlineComment,
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

export type LedgerEntry =
  | {
      kind: "private-file-note";
      id: string;
      fileId: string;
      filePath: string;
      body: string;
    }
  | {
      kind: "private-inline";
      id: string;
      fileId: string;
      filePath: string;
      diffPosition: number;
      side: InlineComment["side"];
      startLine?: number | null;
      endLine?: number | null;
      body: string;
      createdAt: string;
    }
  | {
      kind: "review-inline";
      id: string;
      fileId: string;
      filePath: string;
      diffPosition: number;
      side: InlineComment["side"];
      startLine?: number | null;
      endLine?: number | null;
      body: string;
      createdAt: string;
    };

export type LedgerFilter = "all" | "private" | "review";

export type LedgerGroup = {
  file: ReviewFile;
  entries: LedgerEntry[];
};

export function collectLedger(
  session: ReviewSession,
  workspaceState: ReviewWorkspaceState,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const supportsReviewComments = session.target.kind === "pullRequest";

  for (const file of session.files) {
    const state = workspaceState[file.id];
    if (!state) {
      continue;
    }

    const privateNote = state.privateNote?.trim() ?? "";
    if (privateNote) {
      entries.push({
        kind: "private-file-note",
        id: `${file.id}-private-note`,
        fileId: file.id,
        filePath: file.path,
        body: privateNote,
      });
    }

    for (const comment of state.inlineComments ?? []) {
      if (!supportsReviewComments && comment.visibility === "review") {
        continue;
      }
      entries.push({
        kind: comment.visibility === "private" ? "private-inline" : "review-inline",
        id: comment.id,
        fileId: file.id,
        filePath: file.path,
        diffPosition: comment.endDiffPosition,
        side: comment.side,
        startLine: comment.startLine,
        endLine: comment.endLine,
        body: comment.body,
        createdAt: comment.createdAt,
      });
    }
  }

  return entries;
}

export function filterLedger(
  entries: LedgerEntry[],
  filter: LedgerFilter,
): LedgerEntry[] {
  if (filter === "all") {
    return entries;
  }
  if (filter === "private") {
    return entries.filter(
      (entry) => entry.kind === "private-file-note" || entry.kind === "private-inline",
    );
  }
  return entries.filter((entry) => entry.kind === "review-inline");
}

export function groupLedgerByFile(
  session: ReviewSession,
  entries: LedgerEntry[],
): LedgerGroup[] {
  const groupsByFileId = new Map<string, LedgerGroup>();
  for (const file of session.files) {
    groupsByFileId.set(file.id, { file, entries: [] });
  }

  for (const entry of entries) {
    const bucket = groupsByFileId.get(entry.fileId);
    if (!bucket) {
      continue;
    }
    bucket.entries.push(entry);
  }

  for (const group of groupsByFileId.values()) {
    group.entries.sort((a, b) => {
      const orderA = entryOrder(a);
      const orderB = entryOrder(b);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      if (a.kind === "private-inline" || a.kind === "review-inline") {
        const posA = a.diffPosition;
        const posB =
          b.kind === "private-inline" || b.kind === "review-inline"
            ? b.diffPosition
            : 0;
        return posA - posB;
      }
      return 0;
    });
  }

  return Array.from(groupsByFileId.values()).filter((group) => group.entries.length > 0);
}

function entryOrder(entry: LedgerEntry): number {
  switch (entry.kind) {
    case "private-file-note":
      return 0;
    case "private-inline":
    case "review-inline":
      return 2;
  }
}

export function countByKind(entries: LedgerEntry[]) {
  let priv = 0;
  let review = 0;
  for (const entry of entries) {
    if (entry.kind === "private-file-note" || entry.kind === "private-inline") {
      priv += 1;
    } else {
      review += 1;
    }
  }
  return { total: entries.length, private: priv, review };
}

export function lineRangeLabel(entry: LedgerEntry): string {
  if (entry.kind === "private-file-note") {
    return "File note";
  }
  const side = entry.side === "old" ? "old" : "new";
  if (!entry.startLine && !entry.endLine) {
    return `${side} line`;
  }
  if (entry.startLine === entry.endLine || !entry.endLine) {
    return `${side} line ${entry.startLine}`;
  }
  return `${side} lines ${entry.startLine}-${entry.endLine}`;
}
