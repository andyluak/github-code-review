#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const LEGACY_SESSION_DIR = ".review-desk/sessions";
const LEGACY_ACTIVE_SESSION_PATH = ".review-desk/active-session.json";
const SESSION_FILE_SUFFIX = ".review-session.json";

main();

function main() {
  const [command, ...rest] = process.argv.slice(2);

  try {
    switch (command) {
      case "session":
        handleSessionCommand(rest);
        break;
      case "notes":
      case "note":
        handleNotesCommand(rest);
        break;
      case "create-session":
      case "create":
        createSession(parseArgs(rest));
        break;
      case "activate":
        activateSession(parseArgs(rest));
        break;
      case "migrate":
        migrateSession(parseArgs(rest));
        break;
      case "list":
        listSessions(parseArgs(rest));
        break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        break;
      default:
        fail(`Unknown command: ${command}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function handleNotesCommand(rawArgs) {
  const [subcommand, ...rest] = rawArgs;

  switch (subcommand) {
    case "list":
    case "export":
      listNotes(parseArgs(rest));
      break;
    case "get":
      getNotes(parseArgs(rest));
      break;
    case "add":
    case "add-inline":
      addInlineNote(parseArgs(rest));
      break;
    case "private":
    case "set-private":
      setTextNote(parseArgs(rest), "privateNote");
      break;
    case "draft":
    case "set-draft":
      setTextNote(parseArgs(rest), "publishableDraft");
      break;
    case "status":
    case "set-status":
      setFileStatus(parseArgs(rest));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      fail(`Unknown notes command: ${subcommand}`);
  }
}

function handleSessionCommand(rawArgs) {
  const [subcommand, ...rest] = rawArgs;

  switch (subcommand) {
    case "create":
    case "new":
      createSession(parseArgs(rest));
      break;
    case "activate":
      activateSession(parseArgs(rest));
      break;
    case "migrate":
      migrateSession(parseArgs(rest));
      break;
    case "files":
    case "file":
      handleSessionFilesCommand(rest);
      break;
    case "list":
      listSessions(parseArgs(rest));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      fail(`Unknown session command: ${subcommand}`);
  }
}

function handleSessionFilesCommand(rawArgs) {
  const [subcommand, ...rest] = rawArgs;

  switch (subcommand) {
    case "list":
      listSessionFiles(parseArgs(rest));
      break;
    case "add":
      addSessionFile(parseArgs(rest));
      break;
    case "remove":
    case "exclude":
      removeSessionFile(parseArgs(rest));
      break;
    case "move":
      moveSessionFile(parseArgs(rest));
      break;
    case "organize":
    case "update":
      organizeSessionFile(parseArgs(rest));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      fail(`Unknown session files command: ${subcommand}`);
  }
}

function createSession(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const sourceManifest = readSourceManifest(args);
  const target = resolveReviewTarget(repoRoot, args, sourceManifest);
  const changedPaths = getChangedPaths(repoRoot, target);
  const generated = changedPaths.filter(isGeneratedPath);
  const reviewable = changedPaths.filter((path) => !isGeneratedPath(path));
  const title =
    clean(args.title ?? sourceManifest.title) ??
    `Review ${target.label}`;
  const createdBy = clean(args["created-by"] ?? args.agent ?? sourceManifest.createdBy) ?? "agent";
  const manifest = {
    version: 1,
    repoRoot,
    target: target.request,
    ...(target.baseRef ? { baseRef: target.baseRef } : {}),
    ...(target.headRef ? { headRef: target.headRef } : {}),
    title,
    createdBy,
    fileOrder:
      sourceManifest.fileOrder?.length > 0
        ? sourceManifest.fileOrder
        : buildStarterOrder(reviewable),
    excludedPaths: mergeExcludedPaths(sourceManifest.excludedPaths, generated),
    agentNotes: sourceManifest.agentNotes ?? [],
  };
  const outputPath =
    args.output ??
    join(repoStorage(repoRoot).sessionsDir, `${timestamp()}-${slug(title)}${SESSION_FILE_SUFFIX}`);

  writeJson(outputPath, manifest);

  let activePath = null;
  if (args.activate !== false) {
    activePath = writeActivePointer(repoRoot, outputPath);
  }

  if (args.json) {
    writeStdout({
      manifestPath: resolve(outputPath),
      activeSessionPath: activePath,
      active: args.activate !== false,
      target: target.request,
      fileOrder: manifest.fileOrder.length,
      excludedPaths: manifest.excludedPaths.length,
    });
  } else {
    console.log(`review-desk session: ${resolve(outputPath)}`);
    if (args.activate !== false) {
      console.log(`active session: ${activePath}`);
    }
  }
}

function activateSession(args) {
  const manifestPath = args._[0] ?? args.manifest;
  if (!manifestPath) {
    fail("Usage: review-desk activate <manifest-path>");
  }

  const absoluteManifestPath = resolve(manifestPath);
  const manifest = readJson(absoluteManifestPath);
  const repoRoot = gitRoot(args.repo ?? manifest.repoRoot);
  const activePath = writeActivePointer(repoRoot, absoluteManifestPath);

  if (args.json) {
    writeStdout({
      manifestPath: absoluteManifestPath,
      activeSessionPath: activePath,
    });
  } else {
    console.log(`active session: ${absoluteManifestPath}`);
  }
}

function migrateSession(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const legacyPointerPath = join(repoRoot, LEGACY_ACTIVE_SESSION_PATH);

  if (!existsSync(legacyPointerPath) && !args.manifest) {
    fail(`No legacy active session found at ${legacyPointerPath}`);
  }

  const legacyPointer = existsSync(legacyPointerPath) ? readJson(legacyPointerPath) : {};
  const sourceManifestPath = resolveManifestPath(
    repoRoot,
    args.manifest ?? legacyPointer.manifestPath,
  );

  if (!sourceManifestPath || !existsSync(sourceManifestPath)) {
    fail(`Legacy review session manifest not found: ${sourceManifestPath}`);
  }

  const targetManifestPath = join(repoStorage(repoRoot).sessionsDir, basename(sourceManifestPath));
  if (resolve(sourceManifestPath) !== resolve(targetManifestPath)) {
    copyFileAtomic(sourceManifestPath, targetManifestPath);
  }
  const activePath = writeActivePointer(repoRoot, targetManifestPath);

  let removedLegacy = false;
  if (args["remove-legacy"]) {
    removeLegacySessionFiles(repoRoot, legacyPointerPath, sourceManifestPath);
    removedLegacy = true;
  }

  if (args.json) {
    writeStdout({
      repoRoot,
      manifestPath: resolve(targetManifestPath),
      activeSessionPath: activePath,
      removedLegacy,
    });
    return;
  }

  console.log(`migrated session: ${resolve(targetManifestPath)}`);
  console.log(`active session: ${activePath}`);
  if (removedLegacy) {
    console.log(`removed legacy session files from ${join(repoRoot, ".review-desk")}`);
  }
}

function listSessions(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const sessionsDir = args.legacy ? join(repoRoot, LEGACY_SESSION_DIR) : repoStorage(repoRoot).sessionsDir;
  const sessions = existsSync(sessionsDir)
    ? readdirSync(sessionsDir)
        .filter((name) => name.endsWith(SESSION_FILE_SUFFIX))
        .map((name) => {
          const path = join(sessionsDir, name);
          const stats = statSync(path);
          return { path, updatedAt: stats.mtime.toISOString() };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];

  if (args.json) {
    writeStdout({ sessions });
    return;
  }

  if (sessions.length === 0) {
    console.log("No review sessions.");
    if (!args.legacy && existsSync(join(repoRoot, LEGACY_SESSION_DIR))) {
      console.log("Legacy repo-local sessions exist. Run `review-desk session migrate --repo .` to move them.");
    }
    return;
  }

  for (const session of sessions) {
    console.log(`${session.updatedAt}  ${session.path}`);
  }
}

function listSessionFiles(args) {
  const context = loadNotesContext(args);
  const files = sessionFileEntries(context);

  if (args.json) {
    writeStdout({
      repoRoot: context.repoRoot,
      sessionId: context.sessionId,
      manifestPath: context.manifestPath,
      files,
    });
    return;
  }

  if (files.length === 0) {
    console.log("No review files.");
    return;
  }

  for (const file of files) {
    const marker = file.excluded ? "excluded" : file.ordered ? "ordered" : "unordered";
    const group = file.group ? `  ${file.group}` : "";
    console.log(`${file.path}  ${marker}${group}`);
    if (file.reason) {
      console.log(`  ${oneLine(file.reason)}`);
    }
  }
}

function addSessionFile(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  assertPathInSessionTarget(context, path);

  const manifest = cloneManifest(context.manifest);
  const existing = findFileOrderEntry(manifest, path);
  const entry = {
    path,
    group: clean(args.group) ?? existing?.group ?? groupForPath(path),
    reason: clean(args.reason) ?? existing?.reason ?? reasonForPath(path),
  };
  manifest.excludedPaths = removeManifestPath(manifest.excludedPaths, path);
  manifest.fileOrder = insertFileOrderEntry(manifest.fileOrder, entry, args);

  writeSessionEdit(context, manifest, {
    action: existing ? "updated" : "added",
    path,
  }, args);
}

function removeSessionFile(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const manifest = cloneManifest(context.manifest);
  const reason = clean(args.reason) ?? "Excluded from review by review-desk CLI.";

  manifest.fileOrder = removeManifestPath(manifest.fileOrder, path);
  manifest.agentNotes = removeManifestPath(manifest.agentNotes, path);
  manifest.excludedPaths = upsertManifestPath(manifest.excludedPaths, {
    path,
    reason,
  });

  writeSessionEdit(context, manifest, {
    action: "removed",
    path,
  }, args);
}

function moveSessionFile(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const manifest = cloneManifest(context.manifest);
  const existing = findFileOrderEntry(manifest, path);
  if (!existing) {
    fail(`File is not ordered in the active session: ${path}`);
  }

  const entry = {
    ...existing,
    ...(clean(args.group) ? { group: clean(args.group) } : {}),
    ...(clean(args.reason) ? { reason: clean(args.reason) } : {}),
  };
  manifest.fileOrder = insertFileOrderEntry(manifest.fileOrder, entry, args);

  writeSessionEdit(context, manifest, {
    action: "moved",
    path,
  }, args);
}

function organizeSessionFile(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const manifest = cloneManifest(context.manifest);
  const existing = findFileOrderEntry(manifest, path);
  if (!existing) {
    fail(`File is not ordered in the active session: ${path}`);
  }

  manifest.fileOrder = manifest.fileOrder.map((entry) =>
    sameRepoPath(entry.path, path)
      ? {
          ...existing,
          path,
          group: clean(args.group) ?? existing.group,
          reason: clean(args.reason) ?? existing.reason,
        }
      : entry,
  );

  writeSessionEdit(context, manifest, {
    action: "organized",
    path,
  }, args);
}

function listNotes(args) {
  const context = loadNotesContext(args);
  const entries = noteEntries(context, { includeAll: Boolean(args.all) });

  if (args.json) {
    writeStdout({
      repoRoot: context.repoRoot,
      sessionId: context.sessionId,
      manifestPath: context.manifestPath,
      workspaceStatePath: context.workspaceStatePath,
      notes: entries,
    });
    return;
  }

  if (entries.length === 0) {
    console.log("No review notes.");
    return;
  }

  for (const entry of entries) {
    console.log(`${entry.path ?? entry.fileId}  ${entry.status}`);
    if (entry.privateNote) {
      console.log(`  private: ${oneLine(entry.privateNote)}`);
    }
    if (entry.publishableDraft) {
      console.log(`  draft: ${oneLine(entry.publishableDraft)}`);
    }
    for (const comment of entry.inlineComments) {
      const lineLabel = comment.startLine === comment.endLine
        ? `line ${comment.startLine ?? comment.endDiffPosition}`
        : `lines ${comment.startLine ?? comment.startDiffPosition}-${comment.endLine ?? comment.endDiffPosition}`;
      console.log(`  ${comment.visibility} ${lineLabel}: ${oneLine(comment.body)}`);
    }
  }
}

function getNotes(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const file = resolveReviewFile(context, path);
  const state = {
    ...defaultFileState(),
    ...context.workspaceState[file.id],
  };
  const entry = noteEntry(file.id, file.path, state);

  if (args.json) {
    writeStdout({
      repoRoot: context.repoRoot,
      sessionId: context.sessionId,
      manifestPath: context.manifestPath,
      workspaceStatePath: context.workspaceStatePath,
      note: entry,
    });
    return;
  }

  console.log(`${entry.path}  ${entry.status}`);
  if (entry.privateNote) {
    console.log(`private: ${entry.privateNote}`);
  }
  if (entry.publishableDraft) {
    console.log(`draft: ${entry.publishableDraft}`);
  }
  if (entry.inlineComments.length === 0) {
    console.log("No inline comments.");
    return;
  }
  for (const comment of entry.inlineComments) {
    const lineLabel = comment.startLine === comment.endLine
      ? `line ${comment.startLine ?? comment.endDiffPosition}`
      : `lines ${comment.startLine ?? comment.startDiffPosition}-${comment.endLine ?? comment.endDiffPosition}`;
    console.log(`${comment.visibility} ${lineLabel}: ${comment.body}`);
  }
}

function addInlineNote(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const body = readBodyArg(args);
  const visibility = normalizeVisibility(args.visibility ?? args.v ?? "private");
  const side = normalizeSide(args.side ?? "new");
  const startLine = coerceRequiredNumber(args.line ?? args["start-line"], "line");
  const endLine = coerceNumber(args["end-line"]) ?? startLine;
  const file = resolveReviewFile(context, path);
  const target = resolveCommentTarget(context, file.path, side, startLine, endLine, args);
  const now = new Date().toISOString();
  const comment = {
    id: `comment-${Date.now()}-${randomBytes(6).toString("hex")}`,
    fileId: file.id,
    path: file.path,
    side,
    startDiffPosition: target.startDiffPosition,
    endDiffPosition: target.endDiffPosition,
    startLine,
    endLine,
    body,
    visibility,
    createdAt: now,
    updatedAt: now,
  };

  const previous = {
    ...defaultFileState(),
    ...context.workspaceState[file.id],
  };
  context.workspaceState[file.id] = {
    ...previous,
    inlineComments: [...(previous.inlineComments ?? []), comment],
  };
  writeJson(context.workspaceStatePath, context.workspaceState);

  if (args.json) {
    writeStdout({
      repoRoot: context.repoRoot,
      sessionId: context.sessionId,
      workspaceStatePath: context.workspaceStatePath,
      comment,
    });
    return;
  }

  console.log(`added ${visibility} note: ${file.path}:${startLine}`);
}

function setTextNote(args, field) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const body = readBodyArg(args);
  const file = resolveReviewFile(context, path);
  const previous = {
    ...defaultFileState(),
    ...context.workspaceState[file.id],
  };
  const nextBody = args.append && previous[field]
    ? `${previous[field]}\n${body}`
    : body;

  context.workspaceState[file.id] = {
    ...previous,
    [field]: nextBody,
  };
  writeJson(context.workspaceStatePath, context.workspaceState);

  if (args.json) {
    writeStdout({
      repoRoot: context.repoRoot,
      sessionId: context.sessionId,
      workspaceStatePath: context.workspaceStatePath,
      file: noteEntry(file.id, file.path, context.workspaceState[file.id]),
    });
    return;
  }

  console.log(`updated ${field === "privateNote" ? "private note" : "draft"}: ${file.path}`);
}

function setFileStatus(args) {
  const context = loadNotesContext(args);
  const path = normalizeRepoRelativePath(context.repoRoot, required(args.path ?? args._[0], "file path"));
  const status = normalizeStatus(required(args.status ?? args._[1], "status"));
  const file = resolveReviewFile(context, path);
  const previous = {
    ...defaultFileState(),
    ...context.workspaceState[file.id],
  };

  context.workspaceState[file.id] = {
    ...previous,
    status,
  };
  writeJson(context.workspaceStatePath, context.workspaceState);

  if (args.json) {
    writeStdout({
      repoRoot: context.repoRoot,
      sessionId: context.sessionId,
      workspaceStatePath: context.workspaceStatePath,
      file: noteEntry(file.id, file.path, context.workspaceState[file.id]),
    });
    return;
  }

  console.log(`marked ${file.path} ${status}`);
}

function readSourceManifest(args) {
  if (args.stdin) {
    return JSON.parse(readFileSync(0, "utf8"));
  }
  if (args.manifest) {
    return readJson(resolve(args.manifest));
  }
  return {};
}

function resolveReviewTarget(repoRoot, args, sourceManifest) {
  const cliTarget = clean(args.target ?? args.t);

  if (cliTarget) {
    return resolveTargetRequest(repoRoot, targetRequestFromArgs(cliTarget, args));
  }

  if (sourceManifest.target) {
    return resolveTargetRequest(repoRoot, sourceManifest.target);
  }

  const baseRef = clean(args.base ?? sourceManifest.baseRef);
  const headRef = clean(args.head ?? sourceManifest.headRef);

  if (baseRef && headRef) {
    return resolveTargetRequest(repoRoot, {
      kind: "branch",
      baseRef,
      headRef,
    });
  }

  if (baseRef) {
    return resolveTargetRequest(repoRoot, {
      kind: "branch",
      baseRef,
      headRef: "WORKTREE",
    });
  }

  return resolveTargetRequest(repoRoot, { kind: "workingTree" });
}

function targetRequestFromArgs(rawKind, args) {
  const kind = normalizeTargetKind(rawKind);

  switch (kind) {
    case "workingTree":
      return { kind };
    case "branch":
      return {
        kind,
        baseRef: required(args.base, "base ref"),
        headRef: required(args.head, "head ref"),
      };
    case "commit":
      return {
        kind,
        commit: required(args.commit ?? args.sha ?? args._[0], "commit"),
      };
    case "commitRange":
      return {
        kind,
        fromRef: required(args.from ?? args["from-ref"] ?? args.base ?? args._[0], "from ref"),
        toRef: required(args.to ?? args["to-ref"] ?? args.head ?? args._[1], "to ref"),
      };
    case "pullRequest": {
      const rawPr = clean(args.pr ?? args.number ?? args._[0]);
      const url = clean(args.url ?? (rawPr?.startsWith("http") ? rawPr : undefined));
      return {
        kind,
        remote: clean(args.remote) ?? null,
        number: rawPr && !rawPr.startsWith("http") ? parsePrNumber(rawPr) : null,
        url: url ?? null,
        baseRef: clean(args.base) ?? null,
        headRef: clean(args.head) ?? null,
      };
    }
  }
}

function normalizeTargetKind(value) {
  switch (String(value).trim()) {
    case "working-tree":
    case "workingTree":
    case "worktree":
    case "wt":
      return "workingTree";
    case "branch":
    case "branches":
      return "branch";
    case "commit":
      return "commit";
    case "commit-range":
    case "commitRange":
    case "range":
      return "commitRange";
    case "pull-request":
    case "pullRequest":
    case "pr":
      return "pullRequest";
    default:
      fail(`Unknown review target: ${value}`);
  }
}

function resolveTargetRequest(repoRoot, request) {
  switch (request.kind) {
    case "workingTree":
      return {
        request: { kind: "workingTree" },
        diffTarget: "HEAD",
        includeUntracked: true,
        baseRef: null,
        headRef: null,
        label: "working tree",
      };
    case "branch": {
      const baseRef = required(request.baseRef, "base ref");
      const rawHeadRef = required(request.headRef, "head ref");
      const isWorktree = isWorktreeRef(rawHeadRef);
      const headRef = isWorktree ? "WORKTREE" : rawHeadRef;
      return {
        request: { kind: "branch", baseRef, headRef },
        diffTarget: isWorktree ? baseRef : `${baseRef}...${headRef}`,
        includeUntracked: isWorktree,
        baseRef,
        headRef: isWorktree ? null : headRef,
        label: isWorktree ? `${baseRef} -> working tree` : `${baseRef}...${headRef}`,
      };
    }
    case "commit": {
      const commit = required(request.commit, "commit");
      const baseRef = singleCommitBase(repoRoot, commit);
      return {
        request: { kind: "commit", commit },
        diffTarget: `${baseRef}..${commit}`,
        includeUntracked: false,
        baseRef,
        headRef: commit,
        label: `${commit}^..${commit}`,
      };
    }
    case "commitRange": {
      const fromRef = required(request.fromRef, "from ref");
      const toRef = required(request.toRef, "to ref");
      return {
        request: { kind: "commitRange", fromRef, toRef },
        diffTarget: `${fromRef}..${toRef}`,
        includeUntracked: false,
        baseRef: fromRef,
        headRef: toRef,
        label: `${fromRef}..${toRef}`,
      };
    }
    case "pullRequest":
      return resolvePullRequestTarget(repoRoot, request);
    default:
      fail(`Unsupported manifest target kind: ${request.kind}`);
  }
}

function resolvePullRequestTarget(repoRoot, request) {
  const remote = clean(request.remote) ?? defaultRemoteName(repoRoot) ?? "origin";
  const url = clean(request.url);
  const requestedNumber = coerceNumber(request.number) ?? parsePrNumber(url ?? "");
  const metadataSelector = url ?? (requestedNumber ? String(requestedNumber) : null);
  const metadata = metadataSelector ? tryGhPrView(repoRoot, metadataSelector) : null;
  const number = requestedNumber ?? coerceNumber(metadata?.number);
  const baseRef = clean(request.baseRef) ?? clean(metadata?.baseRefName);
  const prUrl = url ?? clean(metadata?.url);

  if (!baseRef) {
    fail("Pull request target needs --base, a PR number, or a PR URL that gh can resolve.");
  }

  const fetchedHeadRef = number ? tryFetchPullRequestHead(repoRoot, remote, number) : null;
  const headRef =
    fetchedHeadRef ??
    clean(request.headRef) ??
    clean(metadata?.headRefOid);

  if (!headRef) {
    fail("Pull request target needs --head, a PR number, or a PR URL that gh can resolve.");
  }

  const baseForDiff = bestBaseRef(repoRoot, remote, baseRef);

  return {
    request: {
      kind: "pullRequest",
      remote,
      number: number ?? null,
      url: prUrl ?? null,
      baseRef,
      headRef: clean(request.headRef) ?? clean(metadata?.headRefOid) ?? headRef,
    },
    diffTarget: `${baseForDiff}...${headRef}`,
    includeUntracked: false,
    baseRef: baseForDiff,
    headRef,
    label: number ? `PR #${number}: ${baseForDiff}...${headRef}` : `PR: ${baseForDiff}...${headRef}`,
  };
}

function getChangedPaths(repoRoot, target) {
  const diffArgs = ["diff", "--name-only", "--find-renames"];
  diffArgs.push(target.diffTarget ?? "HEAD");
  diffArgs.push("--");

  const tracked = git(repoRoot, diffArgs)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!target.includeUntracked) {
    return unique(tracked);
  }

  const untracked = git(repoRoot, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return unique([...tracked, ...untracked]);
}

function buildStarterOrder(paths) {
  return [...paths]
    .sort((a, b) => orderWeight(a) - orderWeight(b) || a.localeCompare(b))
    .map((path) => ({
      path,
      group: groupForPath(path),
      reason: reasonForPath(path),
    }));
}

function groupForPath(path) {
  if (path === "package.json" || path.includes("tauri.conf") || path.endsWith("main.tsx")) {
    return "Entry points and app bootstrap";
  }
  if (path.startsWith("src-tauri/")) {
    return "Native backend and Git session engine";
  }
  if (path === "src/App.tsx" || path.startsWith("src/types/") || path.startsWith("src/lib/")) {
    return "Session contract and state";
  }
  if (path.startsWith("src/components/review/")) {
    return "Review workflow UI";
  }
  if (path.startsWith("src/components/ui/") || path === "src/index.css") {
    return "Design system primitives";
  }
  if (path.startsWith("docs/") || path.endsWith(".md")) {
    return "Docs";
  }
  return "Project config and support files";
}

function reasonForPath(path) {
  if (path === "src-tauri/src/review.rs") {
    return "Core backend path for Git refs, diff parsing, and agent session import.";
  }
  if (path === "src/App.tsx") {
    return "Top-level workflow state for repo loading, session creation, and active agent sessions.";
  }
  if (path.startsWith("src/components/review/")) {
    return "User-facing review workflow surface.";
  }
  if (path.startsWith("src/lib/") || path.startsWith("src/types/")) {
    return "Shared session contract or persistence helper.";
  }
  return "Review after the core flow to verify support behavior.";
}

function orderWeight(path) {
  const group = groupForPath(path);
  return [
    "Entry points and app bootstrap",
    "Native backend and Git session engine",
    "Session contract and state",
    "Review workflow UI",
    "Design system primitives",
    "Docs",
    "Project config and support files",
  ].indexOf(group);
}

function mergeExcludedPaths(existing = [], generated = []) {
  const byPath = new Map();
  for (const item of existing) {
    if (item?.path) {
      byPath.set(item.path, item);
    }
  }
  for (const path of generated) {
    if (!byPath.has(path)) {
      byPath.set(path, {
        path,
        reason: "Generated or noisy path excluded by review-desk CLI.",
      });
    }
  }
  return [...byPath.values()];
}

function isGeneratedPath(path) {
  const lower = path.toLowerCase();
  return (
    lower === "pnpm-lock.yaml" ||
    lower === "package-lock.json" ||
    lower === "yarn.lock" ||
    lower === "src-tauri/cargo.lock" ||
    lower.includes("node_modules/") ||
    lower.includes("/gen/") ||
    lower.includes("/generated/") ||
    lower.includes("src-tauri/target/") ||
    lower.startsWith("src-tauri/icons/") ||
    lower.startsWith(".review-desk/")
  );
}

function sessionFileEntries(context) {
  const changedPaths = getChangedPaths(context.repoRoot, context.target).map((path) =>
    normalizeRepoRelativePath(context.repoRoot, path),
  );
  const changedPathSet = new Set(changedPaths);
  const excludedByPath = new Map(
    (context.manifest.excludedPaths ?? []).map((entry) => [
      normalizeRepoRelativePath(context.repoRoot, entry.path),
      entry,
    ]),
  );
  const ordered = [];
  const seen = new Set();

  for (const entry of context.manifest.fileOrder ?? []) {
    const path = normalizeRepoRelativePath(context.repoRoot, entry.path);
    seen.add(path);
    ordered.push({
      path,
      ordered: true,
      excluded: excludedByPath.has(path),
      missing: !changedPathSet.has(path),
      group: entry.group ?? null,
      reason: entry.reason ?? excludedByPath.get(path)?.reason ?? null,
    });
  }

  const unordered = changedPaths
    .filter((path) => !seen.has(path) && !excludedByPath.has(path))
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({
      path,
      ordered: false,
      excluded: false,
      missing: false,
      group: null,
      reason: null,
    }));

  const excluded = [...excludedByPath.entries()]
    .filter(([path]) => !seen.has(path))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, entry]) => ({
      path,
      ordered: false,
      excluded: true,
      missing: !changedPathSet.has(path),
      group: null,
      reason: entry.reason ?? null,
    }));

  return [...ordered, ...unordered, ...excluded];
}

function assertPathInSessionTarget(context, path) {
  const changedPaths = new Set(
    getChangedPaths(context.repoRoot, context.target).map((changedPath) =>
      normalizeRepoRelativePath(context.repoRoot, changedPath),
    ),
  );
  if (!changedPaths.has(path)) {
    fail(`File is not in the active review target diff: ${path}`);
  }
}

function cloneManifest(manifest) {
  return {
    version: manifest.version ?? 1,
    repoRoot: manifest.repoRoot,
    target: manifest.target,
    ...(manifest.baseRef ? { baseRef: manifest.baseRef } : {}),
    ...(manifest.headRef ? { headRef: manifest.headRef } : {}),
    title: manifest.title,
    createdBy: manifest.createdBy,
    fileOrder: [...(manifest.fileOrder ?? [])],
    excludedPaths: [...(manifest.excludedPaths ?? [])],
    agentNotes: [...(manifest.agentNotes ?? [])],
  };
}

function findFileOrderEntry(manifest, path) {
  return (manifest.fileOrder ?? []).find((entry) =>
    sameRepoPath(entry.path, path),
  );
}

function insertFileOrderEntry(fileOrder = [], entry, args) {
  const nextOrder = removeManifestPath(fileOrder, entry.path);
  const positionCount = [args.before, args.after, args.index].filter(Boolean).length;
  if (positionCount > 1) {
    fail("Use only one of --before, --after, or --index");
  }

  let insertAt = nextOrder.length;
  if (args.before) {
    const beforePath = cleanPositionPath(args.before);
    insertAt = nextOrder.findIndex((item) => sameRepoPath(item.path, beforePath));
    if (insertAt < 0) {
      fail(`--before file is not ordered: ${beforePath}`);
    }
  } else if (args.after) {
    const afterPath = cleanPositionPath(args.after);
    const afterIndex = nextOrder.findIndex((item) => sameRepoPath(item.path, afterPath));
    if (afterIndex < 0) {
      fail(`--after file is not ordered: ${afterPath}`);
    }
    insertAt = afterIndex + 1;
  } else if (args.index) {
    const requestedIndex = coerceRequiredNumber(args.index, "index");
    if (requestedIndex < 1 || requestedIndex > nextOrder.length + 1) {
      fail(`--index must be between 1 and ${nextOrder.length + 1}`);
    }
    insertAt = requestedIndex - 1;
  }

  nextOrder.splice(insertAt, 0, entry);
  return nextOrder;
}

function removeManifestPath(entries = [], path) {
  return entries.filter((entry) => !sameRepoPath(entry.path, path));
}

function upsertManifestPath(entries = [], entry) {
  return [...removeManifestPath(entries, entry.path), entry];
}

function cleanPositionPath(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function sameRepoPath(left, right) {
  return cleanPositionPath(left) === cleanPositionPath(right);
}

function writeSessionEdit(context, manifest, summary, args) {
  manifest.repoRoot = context.repoRoot;
  manifest.fileOrder = manifest.fileOrder ?? [];
  manifest.excludedPaths = manifest.excludedPaths ?? [];
  manifest.agentNotes = manifest.agentNotes ?? [];

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const target = resolveReviewTarget(context.repoRoot, {}, manifest);
  const nextSessionId = manifestSessionId(
    context.repoRoot,
    target.diffTarget ?? "HEAD",
    contentHash(manifestContent),
  );
  const manifestPath = join(
    repoStorage(context.repoRoot).sessionsDir,
    `${timestamp()}-${slug(manifest.title ?? "review-session")}-${randomBytes(3).toString("hex")}${SESSION_FILE_SUFFIX}`,
  );
  writeFileTextAtomic(manifestPath, manifestContent);
  const activeSessionPath = writeActivePointer(context.repoRoot, manifestPath);
  const workspaceStatePath = copyWorkspaceStateForSession(context, nextSessionId);

  if (args.json) {
    writeStdout({
      ...summary,
      repoRoot: context.repoRoot,
      manifestPath: resolve(manifestPath),
      activeSessionPath,
      previousSessionId: context.sessionId,
      sessionId: nextSessionId,
      workspaceStatePath,
      fileOrder: manifest.fileOrder.length,
      excludedPaths: manifest.excludedPaths.length,
    });
    return;
  }

  console.log(`${summary.action} file: ${summary.path}`);
  console.log(`active session: ${activeSessionPath}`);
}

function copyWorkspaceStateForSession(context, nextSessionId) {
  const nextPath = join(
    repoStorage(context.repoRoot).root,
    "workspace-state",
    `${nextSessionId}.json`,
  );

  if (context.sessionId === nextSessionId) {
    return nextPath;
  }

  const existingState = existsSync(nextPath) ? readJson(nextPath) : {};
  const mergedState = {
    ...existingState,
    ...context.workspaceState,
  };

  if (Object.keys(mergedState).length > 0) {
    writeJson(nextPath, mergedState);
  }

  return nextPath;
}

function loadNotesContext(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const manifestPath = resolveNotesManifestPath(repoRoot, args);
  const manifestContent = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestContent);
  const target = resolveReviewTarget(repoRoot, {}, manifest);
  const sessionId =
    clean(args.session) ??
    manifestSessionId(repoRoot, target.diffTarget ?? "HEAD", contentHash(manifestContent));
  const storage = repoStorage(repoRoot);
  const workspaceStatePath = join(storage.root, "workspace-state", `${sessionId}.json`);
  const workspaceState = existsSync(workspaceStatePath) ? readJson(workspaceStatePath) : {};
  const files = buildReviewFileIndex(repoRoot, target, manifest, workspaceState);

  return {
    repoRoot,
    manifestPath,
    manifest,
    target,
    sessionId,
    workspaceStatePath,
    workspaceState,
    files,
  };
}

function resolveNotesManifestPath(repoRoot, args) {
  const manifestPath = clean(args.manifest);
  if (manifestPath) {
    const resolved = resolveManifestPath(repoRoot, manifestPath);
    if (!resolved || !existsSync(resolved)) {
      fail(`Review session manifest not found: ${resolved}`);
    }
    return resolved;
  }

  const pointer = readActivePointer(repoRoot);
  const resolved = resolveManifestPath(repoRoot, pointer.manifestPath);
  if (!resolved || !existsSync(resolved)) {
    fail(`Active review session manifest not found: ${resolved}`);
  }
  return resolved;
}

function readActivePointer(repoRoot) {
  const storage = repoStorage(repoRoot);
  const candidates = [
    storage.activeSessionPath,
    join(repoRoot, LEGACY_ACTIVE_SESSION_PATH),
    globalActiveSessionPath(),
    join(homedir(), LEGACY_ACTIVE_SESSION_PATH),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }
    const pointer = readJson(path);
    if (!pointer.manifestPath) {
      continue;
    }
    if (pointer.repoRoot && resolve(pointer.repoRoot) !== repoRoot) {
      continue;
    }
    return pointer;
  }

  fail(`No active Review Desk session found for ${repoRoot}`);
}

function buildReviewFileIndex(repoRoot, target, manifest, workspaceState) {
  const paths = unique([
    ...getChangedPaths(repoRoot, target),
    ...(manifest.fileOrder ?? []).map((file) => file.path).filter(Boolean),
    ...Object.values(workspaceState).flatMap((state) =>
      (state?.inlineComments ?? []).map((comment) => comment.path).filter(Boolean),
    ),
  ]);
  const byId = new Map();
  const byPath = new Map();

  for (const path of paths) {
    const normalizedPath = normalizeRepoRelativePath(repoRoot, path);
    const file = {
      id: fileId(normalizedPath),
      path: normalizedPath,
    };
    byId.set(file.id, file);
    byPath.set(normalizedPath, file);
  }

  return { byId, byPath };
}

function noteEntries(context, options = {}) {
  const entries = [];
  const seenIds = new Set();

  for (const [fileId, file] of context.files.byId.entries()) {
    const state = context.workspaceState[fileId];
    if (!state && !options.includeAll) {
      continue;
    }
    const entry = noteEntry(fileId, file.path, {
      ...defaultFileState(),
      ...state,
    });
    if (options.includeAll || hasFileStateContent(entry)) {
      entries.push(entry);
      seenIds.add(fileId);
    }
  }

  for (const [fileId, state] of Object.entries(context.workspaceState)) {
    if (seenIds.has(fileId)) {
      continue;
    }
    const commentPath = (state?.inlineComments ?? []).find((comment) => comment.path)?.path;
    const entry = noteEntry(fileId, commentPath ?? null, {
      ...defaultFileState(),
      ...state,
    });
    if (options.includeAll || hasFileStateContent(entry)) {
      entries.push(entry);
    }
  }

  return entries.sort((a, b) => (a.path ?? a.fileId).localeCompare(b.path ?? b.fileId));
}

function noteEntry(fileId, path, state) {
  return {
    fileId,
    path,
    status: state.status ?? "unseen",
    privateNote: state.privateNote ?? "",
    publishableDraft: state.publishableDraft ?? "",
    inlineComments: state.inlineComments ?? [],
  };
}

function hasFileStateContent(entry) {
  return (
    entry.status !== "unseen" ||
    Boolean(entry.privateNote?.trim()) ||
    Boolean(entry.publishableDraft?.trim()) ||
    entry.inlineComments.length > 0
  );
}

function defaultFileState() {
  return {
    status: "unseen",
    privateNote: "",
    publishableDraft: "",
    inlineComments: [],
  };
}

function resolveReviewFile(context, path) {
  const file =
    context.files.byPath.get(path) ??
    context.files.byId.get(fileId(path)) ??
    { id: fileId(path), path };

  return file;
}

function resolveCommentTarget(context, path, side, startLine, endLine, args) {
  const explicitStart = coerceNumber(args["diff-position"] ?? args["start-diff-position"]);
  const explicitEnd = coerceNumber(args["end-diff-position"]) ?? explicitStart;
  if (explicitStart != null && explicitEnd != null) {
    return {
      startDiffPosition: explicitStart,
      endDiffPosition: explicitEnd,
    };
  }

  const anchors = diffAnchorsForPath(context.repoRoot, context.target, path);
  const startAnchor = anchors.find(
    (anchor) => anchor.side === side && anchor.lineNumber === startLine,
  );
  const endAnchor = anchors.find(
    (anchor) => anchor.side === side && anchor.lineNumber === endLine,
  );

  if (!startAnchor || !endAnchor) {
    fail(
      `Could not map ${path}:${startLine}${endLine !== startLine ? `-${endLine}` : ""} to a diff line. Use --diff-position if you need an exact manual anchor.`,
    );
  }

  return {
    startDiffPosition: Math.min(startAnchor.diffPosition, endAnchor.diffPosition),
    endDiffPosition: Math.max(startAnchor.diffPosition, endAnchor.diffPosition),
  };
}

function diffAnchorsForPath(repoRoot, target, path) {
  const diffArgs = [
    "diff",
    "--no-color",
    "--find-renames",
    "--diff-algorithm=histogram",
    "--unified=10",
    "--inter-hunk-context=3",
  ];
  diffArgs.push(target.diffTarget ?? "HEAD");
  diffArgs.push("--", path);

  const patch = git(repoRoot, diffArgs);
  if (patch.trim()) {
    return parseDiffAnchors(patch);
  }

  if (target.includeUntracked && existsSync(join(repoRoot, path))) {
    const lineCount = readFileSync(join(repoRoot, path), "utf8").split("\n").length;
    return Array.from({ length: lineCount }, (_, index) => ({
      diffPosition: index + 1,
      side: "new",
      lineNumber: index + 1,
    }));
  }

  return [];
}

function parseDiffAnchors(patch) {
  const anchors = [];
  let hunkIndex = -1;
  let oldLine = 0;
  let newLine = 0;
  let diffPosition = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      hunkIndex += 1;
      const parsed = parseHunkHeader(line);
      oldLine = parsed.oldStart;
      newLine = parsed.newStart;
      diffPosition = 0;
      continue;
    }

    if (hunkIndex < 0 || line.startsWith("\\") || line === "") {
      continue;
    }

    const marker = line[0];
    if (!["+", "-", " "].includes(marker)) {
      continue;
    }

    diffPosition += 1;
    const renderedPosition = hunkIndex * 100000 + diffPosition;

    if (marker === "+") {
      anchors.push({
        diffPosition: renderedPosition,
        side: "new",
        lineNumber: newLine,
      });
      newLine += 1;
      continue;
    }

    if (marker === "-") {
      anchors.push({
        diffPosition: renderedPosition,
        side: "old",
        lineNumber: oldLine,
      });
      oldLine += 1;
      continue;
    }

    anchors.push({
      diffPosition: renderedPosition,
      side: "new",
      lineNumber: newLine,
    });
    anchors.push({
      diffPosition: renderedPosition,
      side: "old",
      lineNumber: oldLine,
    });
    oldLine += 1;
    newLine += 1;
  }

  return anchors;
}

function parseHunkHeader(header) {
  const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) {
    return { oldStart: 0, newStart: 0 };
  }
  return {
    oldStart: Number(match[1]),
    newStart: Number(match[2]),
  };
}

function normalizeRepoRelativePath(repoRoot, path) {
  if (isAbsolute(path)) {
    const relativePath = relative(repoRoot, path);
    if (relativePath.startsWith("..")) {
      fail(`Path is outside repo: ${path}`);
    }
    return relativePath.replaceAll("\\", "/");
  }
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function readBodyArg(args) {
  if (args.stdin) {
    return readFileSync(0, "utf8").replace(/\n$/, "");
  }
  return required(args.body ?? args.message ?? args.note ?? args.text, "note body");
}

function normalizeVisibility(value) {
  const normalized = String(value).trim();
  if (normalized === "private" || normalized === "review") {
    return normalized;
  }
  fail("Note visibility must be private or review");
}

function normalizeSide(value) {
  const normalized = String(value).trim();
  if (normalized === "old" || normalized === "new") {
    return normalized;
  }
  fail("Note side must be old or new");
}

function normalizeStatus(value) {
  const normalized = String(value).trim();
  if (
    [
      "unseen",
      "viewed",
      "reviewed",
      "changedSinceViewed",
      "changedSinceReviewed",
    ].includes(normalized)
  ) {
    return normalized;
  }
  fail("Status must be unseen, viewed, reviewed, changedSinceViewed, or changedSinceReviewed");
}

function contentHash(value) {
  return `patch-${rustHashStrings([value])}`;
}

function manifestSessionId(repoRoot, diffTarget, manifestIdentity) {
  return `agent-session-${rustHashStrings([repoRoot, diffTarget, manifestIdentity])}`;
}

function fileId(path) {
  return `file-${rustHashStrings([path])}`;
}

function rustHashStrings(values) {
  const bytes = [];
  for (const value of values) {
    bytes.push(...Buffer.from(String(value), "utf8"), 0xff);
  }
  return sipHash13(bytes);
}

function sipHash13(bytes) {
  const mask = (1n << 64n) - 1n;
  let v0 = 0x736f6d6570736575n;
  let v1 = 0x646f72616e646f6dn;
  let v2 = 0x6c7967656e657261n;
  let v3 = 0x7465646279746573n;

  function rotateLeft(value, bits) {
    return ((value << BigInt(bits)) | (value >> BigInt(64 - bits))) & mask;
  }

  function round() {
    v0 = (v0 + v1) & mask;
    v1 = rotateLeft(v1, 13);
    v1 ^= v0;
    v0 = rotateLeft(v0, 32);
    v2 = (v2 + v3) & mask;
    v3 = rotateLeft(v3, 16);
    v3 ^= v2;
    v0 = (v0 + v3) & mask;
    v3 = rotateLeft(v3, 21);
    v3 ^= v0;
    v2 = (v2 + v1) & mask;
    v1 = rotateLeft(v1, 17);
    v1 ^= v2;
    v2 = rotateLeft(v2, 32);
  }

  let index = 0;
  for (; index + 8 <= bytes.length; index += 8) {
    let word = 0n;
    for (let offset = 0; offset < 8; offset += 1) {
      word |= BigInt(bytes[index + offset]) << (8n * BigInt(offset));
    }
    v3 ^= word;
    round();
    v0 ^= word;
  }

  let finalWord = BigInt(bytes.length) << 56n;
  for (let offset = 0; index + offset < bytes.length; offset += 1) {
    finalWord |= BigInt(bytes[index + offset]) << (8n * BigInt(offset));
  }
  finalWord &= mask;

  v3 ^= finalWord;
  round();
  v0 ^= finalWord;
  v2 ^= 0xffn;
  round();
  round();
  round();

  return ((v0 ^ v1 ^ v2 ^ v3) & mask).toString(16);
}

function writeActivePointer(repoRoot, manifestPath) {
  const storage = repoStorage(repoRoot);
  const activePath = storage.activeSessionPath;
  const pointer = {
    storageVersion: 2,
    repoKey: storage.repoKey,
    repoRoot,
    manifestPath: resolve(manifestPath),
    activatedAt: new Date().toISOString(),
    source: "review-desk-cli",
  };

  writeJson(activePath, pointer);
  writeJson(globalActiveSessionPath(), pointer);
  return activePath;
}

function repoStorage(repoRoot) {
  const repoKey = repoStorageKey(repoRoot);
  const root = join(reviewDeskDataDir(), "repos", repoKey);
  return {
    repoKey,
    root,
    sessionsDir: join(root, "sessions"),
    activeSessionPath: join(root, "active-session.json"),
  };
}

function repoStorageKey(repoRoot) {
  const normalizedRepoRoot = resolve(repoRoot);
  return `${slug(basename(normalizedRepoRoot))}-${fnv1a64(normalizedRepoRoot)}`;
}

function reviewDeskDataDir() {
  if (clean(process.env.REVIEW_DESK_DATA_DIR)) {
    return resolve(process.env.REVIEW_DESK_DATA_DIR);
  }

  const home = homedir();
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "Review Desk");
  }
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Review Desk");
  }
  return join(process.env.XDG_STATE_HOME ?? join(home, ".local", "state"), "review-desk");
}

function globalActiveSessionPath() {
  return join(reviewDeskDataDir(), "active-session.json");
}

function resolveManifestPath(repoRoot, manifestPath) {
  if (!manifestPath) {
    return null;
  }
  return isAbsolute(manifestPath) ? manifestPath : join(repoRoot, manifestPath);
}

function copyFileAtomic(sourcePath, targetPath) {
  const resolvedTargetPath = resolve(targetPath);
  mkdirSync(dirname(resolvedTargetPath), { recursive: true });
  const tempPath = join(
    dirname(resolvedTargetPath),
    `.${basename(resolvedTargetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  copyFileSync(sourcePath, tempPath);
  renameSync(tempPath, resolvedTargetPath);
}

function removeLegacySessionFiles(repoRoot, legacyPointerPath, sourceManifestPath) {
  rmSync(legacyPointerPath, { force: true });
  removeLegacyGlobalPointer(repoRoot, sourceManifestPath);

  const legacyRoot = resolve(join(repoRoot, ".review-desk"));
  const resolvedManifest = resolve(sourceManifestPath);
  if (resolvedManifest.startsWith(`${legacyRoot}/`)) {
    rmSync(resolvedManifest, { force: true });
  }

  removeIfEmpty(join(repoRoot, LEGACY_SESSION_DIR));
  removeIfEmpty(legacyRoot);
}

function removeLegacyGlobalPointer(repoRoot, sourceManifestPath) {
  const pointerPath = join(homedir(), LEGACY_ACTIVE_SESSION_PATH);
  if (!existsSync(pointerPath)) {
    return;
  }

  try {
    const pointer = readJson(pointerPath);
    const pointerManifest = resolveManifestPath(repoRoot, pointer.manifestPath);
    if (
      pointer.repoRoot === repoRoot ||
      (pointerManifest && resolve(pointerManifest) === resolve(sourceManifestPath))
    ) {
      rmSync(pointerPath, { force: true });
      removeIfEmpty(dirname(pointerPath));
    }
  } catch {
    // Leave malformed legacy global state alone; the app data pointer has already been written.
  }
}

function removeIfEmpty(path) {
  try {
    rmdirSync(path);
  } catch {
    // Directory may contain other exported sessions or user files.
  }
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(value, "utf8")) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function parseArgs(rawArgs) {
  const args = { _: [], activate: true };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (rawKey === "no-activate") {
      args.activate = false;
      continue;
    }

    const booleanKeys = new Set([
      "stdin",
      "json",
      "activate",
      "legacy",
      "remove-legacy",
      "all",
      "append",
    ]);
    if (booleanKeys.has(rawKey)) {
      args[rawKey] = true;
      continue;
    }

    const value = inlineValue ?? rawArgs[index + 1];
    if (value == null || value.startsWith("--")) {
      fail(`Missing value for --${rawKey}`);
    }
    args[rawKey] = value;
    if (inlineValue == null) {
      index += 1;
    }
  }
  return args;
}

function required(value, label) {
  const cleaned = clean(value);
  if (!cleaned) {
    fail(`Missing ${label}`);
  }
  return cleaned;
}

function isWorktreeRef(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "worktree" || normalized === "working-tree" || normalized === "working tree";
}

function singleCommitBase(repoRoot, commit) {
  try {
    return git(repoRoot, ["rev-parse", "--verify", `${commit}^`]).trim();
  } catch {
    return "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  }
}

function defaultRemoteName(repoRoot) {
  return listRemotes(repoRoot)[0]?.name;
}

function listRemotes(repoRoot) {
  return git(repoRoot, ["remote", "-v"])
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 3 && parts[2].includes("fetch"))
    .filter((parts, index, rows) => rows.findIndex((row) => row[0] === parts[0]) === index)
    .map((parts) => ({ name: parts[0], url: parts[1] }));
}

function bestBaseRef(repoRoot, remote, baseRef) {
  const remoteBase = `${remote}/${baseRef}`;
  return gitRefExists(repoRoot, remoteBase) ? remoteBase : baseRef;
}

function gitRefExists(repoRoot, ref) {
  try {
    git(repoRoot, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

function tryGhPrView(repoRoot, selector) {
  try {
    return JSON.parse(
      command(repoRoot, "gh", [
        "pr",
        "view",
        selector,
        "--json",
        "number,title,baseRefName,headRefName,headRefOid,url,state",
      ]),
    );
  } catch {
    return null;
  }
}

function tryFetchPullRequestHead(repoRoot, remote, number) {
  try {
    const localRef = `refs/remotes/review-desk/pr-${number}`;
    git(repoRoot, ["fetch", remote, `pull/${number}/head:${localRef}`]);
    return localRef;
  } catch {
    return null;
  }
}

function parsePrNumber(value) {
  const cleaned = clean(value)?.replace(/\/$/, "");
  if (!cleaned) {
    return null;
  }
  if (/^\d+$/.test(cleaned)) {
    return Number(cleaned);
  }
  const match = cleaned.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function coerceNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function coerceRequiredNumber(value, label) {
  const number = coerceNumber(value);
  if (number == null) {
    fail(`Missing ${label}`);
  }
  return number;
}

function gitRoot(path) {
  return git(resolve(path ?? "."), ["rev-parse", "--show-toplevel"]).trim();
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function command(repoRoot, commandName, args) {
  return execFileSync(commandName, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFileTextAtomic(path, value) {
  const targetPath = resolve(path);
  mkdirSync(dirname(targetPath), { recursive: true });
  const tempPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  writeFileSync(tempPath, value);
  renameSync(tempPath, targetPath);
}

function unique(values) {
  return [...new Set(values)];
}

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
}

function slug(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || basename(process.cwd())
  );
}

function writeStdout(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`review-desk

Usage:
  review-desk session create --repo . --target working-tree --agent codex
  review-desk session create --repo . --target branch --base main --head feature
  review-desk session create --repo . --target commit --commit 5315b7c
  review-desk session create --repo . --target range --from main --to HEAD
  review-desk session create --repo . --target pr --pr 123
  review-desk session create --repo . --stdin < manifest.json
  review-desk session activate /path/to/session.review-session.json
  review-desk session migrate --repo . [--remove-legacy]
  review-desk session list --repo .
  review-desk session files list --repo . [--json]
  review-desk session files add --repo . --path src/file.ts --group "Core logic" --reason "..."
  review-desk session files remove --repo . --path src/file.ts --reason "Noise"
  review-desk session files move --repo . --path src/file.ts --before other.ts
  review-desk session files organize --repo . --path src/file.ts --group "Tests" --reason "..."
  review-desk notes list --repo . [--json]
  review-desk notes get --repo . --path src/file.ts [--json]
  review-desk notes add --repo . --path src/file.ts --line 42 --body "Check this"
  review-desk notes private --repo . --path src/file.ts --body "Scratch note"
  review-desk notes draft --repo . --path src/file.ts --body "Publishable review text"
  review-desk notes status --repo . --path src/file.ts --status reviewed

Aliases:
  review-desk create-session --repo . [--base main] [--head feature]
  review-desk activate /path/to/session.review-session.json
  review-desk list --repo .

session create writes to Review Desk app data and marks it active.
Use --output only when you explicitly want to export a manifest elsewhere.
The desktop app auto-loads the active session for an open repo.`);
}

function fail(message) {
  console.error(`review-desk: ${message}`);
  process.exit(1);
}
