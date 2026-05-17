import type { PullRequestContext, ReviewThread } from "@/types/github";
import { normalizeThreadReplyMap } from "@/lib/thread-reply-drafts";
import type {
  InlineComment,
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  SessionFileState,
} from "@/types/review";

export type HandoffScope = "session" | "current-file" | "notes" | "pr-comments";

export type HandoffBundle = {
  version: 1;
  generatedAt: string;
  scope: HandoffScope;
  repo: {
    root: string;
    branch: string;
    headSha: string;
  };
  target: {
    label: string;
    kind: string;
  };
  summary: {
    includedFiles: number;
    excludedFiles: number;
    additions: number;
    deletions: number;
    notes: number;
    privateInlineComments: number;
    reviewInlineDrafts: number;
    threadReplyDrafts: number;
    prThreads: number;
    unresolvedPrThreads: number;
    topLevelPrComments: number;
  };
  currentFile: HandoffFile | null;
  reviewQueue: HandoffFile[];
  notes: HandoffNote[];
  pr: HandoffPullRequest | null;
};

export type HandoffFile = {
  id: string;
  path: string;
  changeKind: string;
  additions: number;
  deletions: number;
  status: string;
  group: string | null;
  reason: string | null;
  agentNotes: string[];
};

export type HandoffNote = {
  fileId: string;
  path: string;
  status: string;
  privateNote: string;
  publishableDraft: string;
  inlineComments: InlineComment[];
  threadReplies: Array<{
    threadId: string;
    draftId: string;
    path: string | null;
    line: number | null;
    body: string;
  }>;
};

export type HandoffPullRequest = {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  author: string;
  labels: string[];
  fetchedAt: string;
  truncated: boolean;
  merge: {
    reviewDecision: string | null;
    mergeStateStatus: string;
    checksState: string;
    blockers: string[];
  };
  threads: Array<{
    id: string;
    path: string;
    startLine: number | null;
    line: number | null;
    isResolved: boolean;
    isOutdated: boolean;
    comments: Array<{
      author: string;
      body: string;
      createdAt: string;
    }>;
  }>;
  topLevelComments: Array<{
    id: string;
    author: string;
    body: string;
    createdAt: string;
  }>;
};

export function buildHandoffBundle({
  session,
  workspaceState,
  prContext,
  activeFile,
  scope,
}: {
  session: ReviewSession;
  workspaceState: ReviewWorkspaceState;
  prContext: PullRequestContext | null;
  activeFile: ReviewFile | null;
  scope: HandoffScope;
}): HandoffBundle {
  const files = selectFilesForScope(session, workspaceState, activeFile, scope);
  const queueFiles = scope === "session" ? session.files : files;
  const threadById = new Map(
    (prContext?.reviewThreads ?? []).map((thread) => [thread.id, thread]),
  );
  const notes = files
    .map((file) => noteForFile(file, workspaceState[file.id], threadById))
    .filter((note) => scope !== "pr-comments" && hasNoteContent(note));
  const pr = prContext ? prForHandoff(prContext, scope, activeFile) : null;
  const summary = countSummary(session, workspaceState, prContext);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    scope,
    repo: {
      root: session.repo.root,
      branch: session.repo.branch,
      headSha: session.repo.headSha,
    },
    target: {
      label: targetLabel(session),
      kind: session.target.kind,
    },
    summary,
    currentFile: activeFile ? fileForHandoff(activeFile, workspaceState[activeFile.id]) : null,
    reviewQueue: scope === "pr-comments"
      ? []
      : queueFiles.map((file) => fileForHandoff(file, workspaceState[file.id])),
    notes,
    pr,
  };
}

export function renderHandoffMarkdown(bundle: HandoffBundle): string {
  const lines: string[] = [
    "# Review Desk Handoff",
    "",
    `Generated: ${bundle.generatedAt}`,
    `Scope: ${bundle.scope}`,
    `Repo: ${bundle.repo.root}`,
    `Branch: ${bundle.repo.branch}`,
    `Target: ${bundle.target.label}`,
    `Head: ${shortSha(bundle.repo.headSha)}`,
    "",
    "## Summary",
    "",
    `- Files: ${bundle.summary.includedFiles} included, ${bundle.summary.excludedFiles} excluded`,
    `- Diff: +${bundle.summary.additions} / -${bundle.summary.deletions}`,
    `- Notes: ${bundle.summary.notes}`,
    `- Inline drafts: ${bundle.summary.reviewInlineDrafts} publishable, ${bundle.summary.privateInlineComments} private`,
    `- PR threads: ${bundle.summary.unresolvedPrThreads} unresolved / ${bundle.summary.prThreads} total`,
  ];

  if (bundle.currentFile) {
    lines.push("", "## Current File", "", renderFileLine(bundle.currentFile));
  }

  if (bundle.reviewQueue.length > 0 && bundle.scope !== "pr-comments") {
    lines.push("", "## Review Queue", "");
    for (const [index, file] of bundle.reviewQueue.entries()) {
      lines.push(`${index + 1}. ${renderFileLine(file)}`);
      if (file.reason) lines.push(`   - Reason: ${file.reason}`);
      for (const note of file.agentNotes) lines.push(`   - Agent note: ${note}`);
    }
  }

  if (bundle.notes.length > 0) {
    lines.push("", "## Reviewer Notes", "");
    for (const note of bundle.notes) {
      lines.push(`### ${note.path}`);
      lines.push(`Status: ${note.status}`);
      if (note.privateNote.trim()) {
        lines.push("", "Private note:", indentBlock(note.privateNote));
      }
      if (note.publishableDraft.trim()) {
        lines.push("", "Publishable draft:", indentBlock(note.publishableDraft));
      }
      for (const comment of note.inlineComments) {
        lines.push(
          "",
          `- ${comment.visibility} inline ${lineLabel(comment)} (${comment.side}): ${comment.body}`,
        );
      }
      for (const reply of note.threadReplies) {
        lines.push(
          "",
          `- Draft reply to ${reply.threadId}${reply.line ? ` at L${reply.line}` : ""}: ${reply.body}`,
        );
      }
      lines.push("");
    }
  }

  if (bundle.pr) {
    lines.push("", "## Pull Request Context", "");
    lines.push(
      `#${bundle.pr.number} ${bundle.pr.title}`,
      `State: ${bundle.pr.state}${bundle.pr.isDraft ? " draft" : ""}`,
      `Author: ${bundle.pr.author}`,
      `URL: ${bundle.pr.url}`,
      `Checks: ${bundle.pr.merge.checksState}`,
      `Review decision: ${bundle.pr.merge.reviewDecision ?? "none"}`,
      `Merge state: ${bundle.pr.merge.mergeStateStatus}`,
    );
    if (bundle.pr.merge.blockers.length > 0) {
      lines.push("", "Merge blockers:");
      for (const blocker of bundle.pr.merge.blockers) lines.push(`- ${blocker}`);
    }
    if (bundle.pr.threads.length > 0) {
      lines.push("", "### Review Threads", "");
      for (const thread of bundle.pr.threads) {
        const state = thread.isResolved ? "resolved" : "unresolved";
        lines.push(`- ${thread.path}:${threadLineLabel(thread)} (${state})`);
        for (const comment of thread.comments) {
          lines.push(`  - ${comment.author}: ${singleLine(comment.body)}`);
        }
      }
    }
    if (bundle.pr.topLevelComments.length > 0) {
      lines.push("", "### Top-Level PR Comments", "");
      for (const comment of bundle.pr.topLevelComments) {
        lines.push(`- ${comment.author}: ${singleLine(comment.body)}`);
      }
    }
  }

  lines.push(
    "",
    "## Agent Instruction",
    "",
    "Use this Review Desk context as reviewer-owned state. Preserve private notes as private, treat publishable drafts as candidate PR comments, and continue from the existing review queue instead of restarting the review.",
  );

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function handoffScopeLabel(scope: HandoffScope): string {
  switch (scope) {
    case "current-file":
      return "Current file";
    case "notes":
      return "Notes";
    case "pr-comments":
      return "PR comments";
    case "session":
    default:
      return "Session";
  }
}

function selectFilesForScope(
  session: ReviewSession,
  workspaceState: ReviewWorkspaceState,
  activeFile: ReviewFile | null,
  scope: HandoffScope,
) {
  if (scope === "current-file") {
    return activeFile ? [activeFile] : [];
  }
  if (scope === "notes") {
    return session.files.filter((file) =>
      hasNoteContent(noteForFile(file, workspaceState[file.id], new Map())),
    );
  }
  return session.files;
}

function fileForHandoff(file: ReviewFile, state?: SessionFileState): HandoffFile {
  return {
    id: file.id,
    path: file.path,
    changeKind: file.changeKind,
    additions: file.additions,
    deletions: file.deletions,
    status: state?.status ?? file.viewedStatus,
    group: file.orderGroup ?? null,
    reason: file.reviewReason ?? null,
    agentNotes: file.agentNotes.map((note) => note.body),
  };
}

function noteForFile(
  file: ReviewFile,
  state: SessionFileState | undefined,
  threadById: Map<string, ReviewThread>,
): HandoffNote {
  const fileState = state as (SessionFileState & { publishableDraft?: string }) | undefined;
  return {
    fileId: file.id,
    path: file.path,
    status: fileState?.status ?? file.viewedStatus,
    privateNote: fileState?.privateNote ?? "",
    publishableDraft: fileState?.publishableDraft ?? "",
    inlineComments: fileState?.inlineComments ?? [],
    threadReplies: Object.entries(normalizeThreadReplyMap(fileState?.threadReplies))
      .flatMap(([threadId, drafts]) => drafts.filter((draft) => draft.body.trim()).map((draft) => {
        const thread = threadById.get(threadId);
        return {
          threadId,
          draftId: draft.id,
          path: thread?.path ?? null,
          line: thread?.line ?? thread?.originalLine ?? null,
          body: draft.body,
        };
      })),
  };
}

function prForHandoff(
  context: PullRequestContext,
  scope: HandoffScope,
  activeFile: ReviewFile | null,
): HandoffPullRequest {
  const activePath = scope === "current-file" ? activeFile?.path : null;
  const threads = context.reviewThreads
    .filter((thread) => !activePath || thread.path === activePath)
    .filter((thread) => scope !== "session" || !thread.isResolved)
    .map((thread) => ({
      id: thread.id,
      path: thread.path,
      startLine: thread.startLine ?? null,
      line: thread.line ?? thread.originalLine ?? null,
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      comments: thread.comments.map((comment) => ({
        author: comment.author,
        body: comment.body,
        createdAt: comment.createdAt,
      })),
    }));

  return {
    number: context.summary.number,
    title: context.summary.title,
    url: context.summary.url,
    state: context.summary.state,
    isDraft: context.summary.isDraft,
    author: context.summary.author.login,
    labels: context.summary.labels,
    fetchedAt: context.fetchedAt,
    truncated: context.truncated,
    merge: {
      reviewDecision: context.summary.reviewDecision,
      mergeStateStatus: context.merge.mergeStateStatus,
      checksState: context.summary.checksSummary.state,
      blockers: context.merge.mergeBlockers,
    },
    threads,
    topLevelComments:
      scope === "current-file"
        ? []
        : context.topLevelComments
            .filter((comment) => comment.body?.trim())
            .map((comment) => ({
              id: comment.id,
              author: comment.actor,
              body: comment.body ?? "",
              createdAt: comment.createdAt,
            })),
  };
}

function countSummary(
  session: ReviewSession,
  workspaceState: ReviewWorkspaceState,
  prContext: PullRequestContext | null,
): HandoffBundle["summary"] {
  let notes = 0;
  let privateInlineComments = 0;
  let reviewInlineDrafts = 0;
  let threadReplyDrafts = 0;

  for (const file of session.files) {
    const note = noteForFile(file, workspaceState[file.id], new Map());
    if (hasNoteContent(note)) notes += 1;
    for (const comment of note.inlineComments) {
      if (comment.visibility === "review") reviewInlineDrafts += 1;
      else privateInlineComments += 1;
    }
    threadReplyDrafts += note.threadReplies.length;
  }

  const threads = prContext?.reviewThreads ?? [];
  return {
    includedFiles: session.summary.includedFiles,
    excludedFiles: session.summary.excludedFiles,
    additions: session.summary.additions,
    deletions: session.summary.deletions,
    notes,
    privateInlineComments,
    reviewInlineDrafts,
    threadReplyDrafts,
    prThreads: threads.length,
    unresolvedPrThreads: threads.filter((thread) => !thread.isResolved).length,
    topLevelPrComments: prContext?.topLevelComments.length ?? 0,
  };
}

function hasNoteContent(note: HandoffNote) {
  return (
    note.status !== "unseen" ||
    Boolean(note.privateNote.trim()) ||
    Boolean(note.publishableDraft.trim()) ||
    note.inlineComments.length > 0 ||
    note.threadReplies.length > 0
  );
}

function targetLabel(session: ReviewSession) {
  switch (session.target.kind) {
    case "pullRequest":
      return session.target.label;
    case "branch":
      return session.target.label;
    case "commit":
      return session.target.label;
    case "commitRange":
      return session.target.label;
    case "workingTree":
    default:
      return session.target.label;
  }
}

function renderFileLine(file: HandoffFile) {
  const group = file.group ? ` [${file.group}]` : "";
  return `${file.path} (${file.changeKind}, +${file.additions}/-${file.deletions}, ${file.status})${group}`;
}

function indentBlock(value: string) {
  return value
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function lineLabel(comment: InlineComment) {
  if (comment.startLine && comment.endLine && comment.startLine !== comment.endLine) {
    return `L${comment.startLine}-L${comment.endLine}`;
  }
  return `L${comment.endLine ?? comment.startLine ?? comment.endDiffPosition}`;
}

function threadLineLabel(thread: {
  startLine?: number | null;
  line?: number | null;
}) {
  if (thread.startLine && thread.line && thread.startLine !== thread.line) {
    return `L${thread.startLine}-L${thread.line}`;
  }
  return `L${thread.line ?? thread.startLine ?? "?"}`;
}

function shortSha(value: string) {
  return value ? value.slice(0, 8) : "";
}

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
