import type { ThreadReplyDraft, ThreadReplyDraftMap } from "@/types/review";

export function createThreadReplyDraft(body: string): ThreadReplyDraft {
  const now = new Date().toISOString();
  return {
    id: createDraftId(),
    body,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeThreadReplyDrafts(value: unknown): ThreadReplyDraft[] {
  if (typeof value === "string") {
    return value.trim() ? [legacyThreadReplyDraft(value)] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return item.trim() ? [legacyThreadReplyDraft(item)] : [];
    }
    if (!item || typeof item !== "object") {
      return [];
    }

    const draft = item as Partial<ThreadReplyDraft>;
    if (typeof draft.body !== "string" || !draft.body.trim()) {
      return [];
    }

    return [
      {
        id:
          typeof draft.id === "string" && draft.id.trim()
            ? draft.id
            : `legacy-${hashString(draft.body)}`,
        body: draft.body,
        createdAt:
          typeof draft.createdAt === "string" ? draft.createdAt : "legacy",
        updatedAt:
          typeof draft.updatedAt === "string" ? draft.updatedAt : "legacy",
      },
    ];
  });
}

export function normalizeThreadReplyMap(value: unknown): ThreadReplyDraftMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const out: ThreadReplyDraftMap = {};
  for (const [threadId, drafts] of Object.entries(value)) {
    const normalized = normalizeThreadReplyDrafts(drafts);
    if (normalized.length > 0) {
      out[threadId] = normalized;
    }
  }
  return out;
}

export function mergeThreadReplyDraftMaps(
  recovered: unknown,
  current: unknown,
): ThreadReplyDraftMap {
  const out = normalizeThreadReplyMap(recovered);
  for (const [threadId, drafts] of Object.entries(normalizeThreadReplyMap(current))) {
    const existing = out[threadId] ?? [];
    const nextById = new Map(existing.map((draft) => [draft.id, draft]));
    for (const draft of drafts) {
      nextById.set(draft.id, draft);
    }
    out[threadId] = Array.from(nextById.values());
  }
  return out;
}

export function countThreadReplyDrafts(value: unknown): number {
  let count = 0;
  for (const drafts of Object.values(normalizeThreadReplyMap(value))) {
    count += drafts.length;
  }
  return count;
}

export function hasThreadReplyDrafts(value: unknown): boolean {
  return countThreadReplyDrafts(value) > 0;
}

function legacyThreadReplyDraft(body: string): ThreadReplyDraft {
  return {
    id: `legacy-${hashString(body)}`,
    body,
    createdAt: "legacy",
    updatedAt: "legacy",
  };
}

function createDraftId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `reply-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}
