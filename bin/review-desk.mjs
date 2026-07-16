#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
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
const DIAGRAM_FILE_SUFFIX = ".review-diagram.json";
const DIAGRAM_ANALYZER_VERSION = 2;
const MAX_DIAGRAM_NODES = 80;
const MAX_DIAGRAM_EDGES = 200;
const MAX_AST_FILE_BYTES = 256 * 1024;
const MAX_NEIGHBOR_NODES = 30;
const require = createRequire(import.meta.url);
let TsMorphProject = null;

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
      case "handoff":
        createHandoff(parseArgs(rest));
        break;
      case "diagrams":
      case "diagram":
        handleDiagramsCommand(rest);
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

function handleDiagramsCommand(rawArgs) {
  const [subcommand, ...rest] = rawArgs;

  switch (subcommand) {
    case "create":
    case "new":
      createDiagram(parseArgs(rest));
      break;
    case "list":
      listDiagrams(parseArgs(rest));
      break;
    case "get":
    case "show":
      getDiagram(parseArgs(rest));
      break;
    case "export":
      exportDiagram(parseArgs(rest));
      break;
    case "update":
    case "set":
      updateDiagram(parseArgs(rest));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      fail(`Unknown diagrams command: ${subcommand}`);
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
  const result = createSessionManifest(args);
  let diagramResult = null;

  if (args["with-diagram"]) {
    diagramResult = createDiagramFromArgs(
      {
        ...args,
        repo: result.repoRoot,
        manifest: result.manifestPath,
        scope: args.scope ?? "session",
      },
      { emit: false },
    );
  }

  if (args.json) {
    writeStdout({
      manifestPath: result.manifestPath,
      activeSessionPath: result.activeSessionPath,
      active: result.active,
      target: result.target.request,
      fileOrder: result.manifest.fileOrder.length,
      excludedPaths: result.manifest.excludedPaths.length,
      ...(diagramResult
        ? {
            diagram: {
              id: diagramResult.diagram.id,
              path: diagramResult.path,
              cached: diagramResult.cached,
              scope: diagramResult.diagram.scope,
              nodes: diagramResult.diagram.stats.nodes,
              edges: diagramResult.diagram.stats.edges,
            },
          }
        : {}),
    });
  } else {
    console.log(`review-desk session: ${result.manifestPath}`);
    if (result.active) {
      console.log(`active session: ${result.activeSessionPath}`);
    }
    if (diagramResult) {
      console.log(
        `${diagramResult.cached ? "diagram cached" : "diagram created"}: ${diagramResult.path}`,
      );
    }
  }
}

function createSessionManifest(args) {
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

  return {
    repoRoot,
    manifest,
    manifestPath: resolve(outputPath),
    activeSessionPath: activePath,
    active: args.activate !== false,
    target,
  };
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
  const entry = noteEntry(file.id, file.path, state, {
    includeReviewArtifacts: supportsReviewComments(context),
  });

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
  if (visibility === "review" && !supportsReviewComments(context)) {
    fail("Review-visibility inline comments are only available for pull request review sessions.");
  }
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
  if (field === "publishableDraft" && !supportsReviewComments(context)) {
    fail("Publishable drafts are only available for pull request review sessions.");
  }
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
      file: noteEntry(file.id, file.path, context.workspaceState[file.id], {
        includeReviewArtifacts: supportsReviewComments(context),
      }),
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
      file: noteEntry(file.id, file.path, context.workspaceState[file.id], {
        includeReviewArtifacts: supportsReviewComments(context),
      }),
    });
    return;
  }

  console.log(`marked ${file.path} ${status}`);
}

function createHandoff(args) {
  const context = loadNotesContext(args);
  const scope = normalizeHandoffScope(args.scope ?? "session");
  const format = normalizeHandoffFormat(args.format ?? (args.json ? "json" : "markdown"));
  const currentPath = clean(args.path ?? args.file);
  const pr = loadPullRequestHandoffContext(context, args);
  const bundle = buildHandoffBundle(context, scope, currentPath, pr);
  const output = format === "json"
    ? `${JSON.stringify(bundle, null, 2)}\n`
    : renderHandoffMarkdown(bundle);
  const outputPath = clean(args.output ?? args.out);

  if (outputPath) {
    writeFileTextAtomic(outputPath, output);
    if (args.json) {
      writeStdout({
        repoRoot: context.repoRoot,
        sessionId: context.sessionId,
        outputPath: resolve(outputPath),
        format,
        scope,
      });
    } else {
      console.log(`handoff exported: ${resolve(outputPath)}`);
    }
    return;
  }

  process.stdout.write(output);
}

function normalizeHandoffScope(value) {
  switch (String(value).trim()) {
    case "session":
    case "all":
      return "session";
    case "current-file":
    case "file":
    case "current":
      return "current-file";
    case "notes":
    case "review-notes":
      return "notes";
    case "pr-comments":
    case "comments":
    case "threads":
      return "pr-comments";
    default:
      fail("Handoff scope must be session, current-file, notes, or pr-comments");
  }
}

function normalizeHandoffFormat(value) {
  switch (String(value).trim()) {
    case "markdown":
    case "md":
      return "markdown";
    case "json":
      return "json";
    default:
      fail("Handoff format must be markdown or json");
  }
}

function buildHandoffBundle(context, scope, currentPath, pr) {
  const files = sessionFileEntries(context);
  const requestedPath = currentPath
    ? normalizeRepoRelativePath(context.repoRoot, currentPath)
    : null;
  if (scope === "current-file" && !requestedPath) {
    fail("Handoff scope current-file requires --path");
  }
  const selectedFiles = selectHandoffFiles(context, files, scope, requestedPath);
  const notes = selectedFiles
    .map((file) => noteForHandoffFile(context, file, pr))
    .map((note) => scope === "notes" ? privateHandoffNoteOnly(note) : note)
    .filter((note) => scope !== "pr-comments" && hasHandoffNoteContent(note));
  const summary = handoffSummary(context, files, pr, scope);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    scope,
    repo: {
      root: context.repoRoot,
      branch: safeGitValue(context.repoRoot, ["branch", "--show-current"]),
      headSha: safeGitValue(context.repoRoot, ["rev-parse", "HEAD"]),
    },
    target: {
      label: context.target.label,
      kind: context.target.request.kind,
      request: context.target.request,
    },
    session: {
      id: context.sessionId,
      manifestPath: context.manifestPath,
      workspaceStatePath: context.workspaceStatePath,
      title: context.manifest.title ?? null,
      createdBy: context.manifest.createdBy ?? null,
    },
    summary,
    currentFile: requestedPath && scope !== "notes"
      ? fileHandoffEntry(context, files.find((file) => sameRepoPath(file.path, requestedPath)) ?? { path: requestedPath })
      : null,
    reviewQueue: scope === "pr-comments" || scope === "notes"
      ? []
      : (scope === "session" ? files : selectedFiles).map((file) => fileHandoffEntry(context, file)),
    notes,
    pr: pr && scope !== "notes" ? filterPrHandoffContext(pr, scope, requestedPath) : null,
  };
}

function selectHandoffFiles(context, files, scope, requestedPath) {
  if (scope === "current-file") {
    return [files.find((file) => sameRepoPath(file.path, requestedPath)) ?? { path: requestedPath }];
  }
  if (scope === "notes") {
    return files.filter((file) =>
      hasPrivateHandoffNoteContent(noteForHandoffFile(context, file, null)),
    );
  }
  return files;
}

function fileHandoffEntry(context, file) {
  const path = normalizeRepoRelativePath(context.repoRoot, file.path);
  const resolved = context.files.byPath.get(path) ?? { id: fileId(path), path };
  const state = {
    ...defaultFileState(),
    ...context.workspaceState[resolved.id],
  };
  return {
    fileId: resolved.id,
    path,
    status: state.status,
    ordered: Boolean(file.ordered),
    excluded: Boolean(file.excluded),
    missing: Boolean(file.missing),
    group: file.group ?? null,
    reason: file.reason ?? null,
  };
}

function noteForHandoffFile(context, file, pr) {
  const path = normalizeRepoRelativePath(context.repoRoot, file.path);
  const resolved = context.files.byPath.get(path) ?? { id: fileId(path), path };
  const state = {
    ...defaultFileState(),
    ...context.workspaceState[resolved.id],
  };
  const threadById = new Map((pr?.threads ?? []).map((thread) => [thread.id, thread]));
  return {
    fileId: resolved.id,
    path,
    status: state.status,
    privateNote: state.privateNote ?? "",
    publishableDraft: state.publishableDraft ?? "",
    inlineComments: state.inlineComments ?? [],
    threadReplies: Object.entries(state.threadReplies ?? {})
      .filter(([, body]) => String(body).trim())
      .map(([threadId, body]) => {
        const thread = threadById.get(threadId);
        return {
          threadId,
          path: thread?.path ?? null,
          line: thread?.line ?? thread?.originalLine ?? null,
          body,
        };
      }),
  };
}

function hasHandoffNoteContent(note) {
  return (
    Boolean(note.privateNote?.trim()) ||
    Boolean(note.publishableDraft?.trim()) ||
    (note.inlineComments ?? []).some((comment) => Boolean(comment.body?.trim())) ||
    (note.threadReplies ?? []).length > 0
  );
}

function hasPrivateHandoffNoteContent(note) {
  return (
    Boolean(note.privateNote?.trim()) ||
    (note.inlineComments ?? []).some(
      (comment) => comment.visibility === "private" && Boolean(comment.body?.trim()),
    )
  );
}

function privateHandoffNoteOnly(note) {
  return {
    fileId: note.fileId,
    path: note.path,
    privateNote: note.privateNote ?? "",
    publishableDraft: "",
    inlineComments: (note.inlineComments ?? []).filter(
      (comment) => comment.visibility === "private" && Boolean(comment.body?.trim()),
    ),
    threadReplies: [],
  };
}

function handoffSummary(context, files, pr, scope) {
  const diff = diffSummary(context.repoRoot, context.target);
  const notes = files
    .map((file) => noteForHandoffFile(context, file, pr))
    .filter((note) =>
      scope === "notes" ? hasPrivateHandoffNoteContent(note) : hasHandoffNoteContent(note),
    );
  let privateInlineComments = 0;
  let reviewInlineDrafts = 0;
  let threadReplyDrafts = 0;
  for (const note of notes) {
    for (const comment of note.inlineComments ?? []) {
      if (scope === "notes") {
        if (comment.visibility === "private" && comment.body?.trim()) {
          privateInlineComments += 1;
        }
        continue;
      }
      if (comment.visibility === "review") {
        reviewInlineDrafts += 1;
      } else {
        privateInlineComments += 1;
      }
    }
    if (scope !== "notes") {
      threadReplyDrafts += note.threadReplies.length;
    }
  }

  return {
    includedFiles: files.filter((file) => !file.excluded && !file.missing).length,
    excludedFiles: files.filter((file) => file.excluded).length,
    additions: diff.additions,
    deletions: diff.deletions,
    notes: notes.length,
    privateInlineComments,
    reviewInlineDrafts,
    threadReplyDrafts,
    prThreads: scope === "notes" ? 0 : pr?.threads.length ?? 0,
    unresolvedPrThreads: scope === "notes"
      ? 0
      : pr?.threads.filter((thread) => !thread.isResolved).length ?? 0,
    topLevelPrComments: scope === "notes" ? 0 : pr?.topLevelComments.length ?? 0,
    warnings: scope === "notes" || !pr?.warning ? [] : [pr.warning],
  };
}

function diffSummary(repoRoot, target) {
  try {
    const output = git(repoRoot, ["diff", "--numstat", "--find-renames", target.diffTarget ?? "HEAD", "--"]);
    let additions = 0;
    let deletions = 0;
    for (const line of output.split("\n")) {
      const [rawAdditions, rawDeletions] = line.trim().split(/\s+/);
      additions += Number(rawAdditions) || 0;
      deletions += Number(rawDeletions) || 0;
    }
    return { additions, deletions };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

function renderHandoffMarkdown(bundle) {
  if (bundle.scope === "notes") {
    return renderPrivateNotesMarkdown(bundle);
  }

  const lines = [
    "# Review Desk Handoff",
    "",
    `Generated: ${bundle.generatedAt}`,
    `Scope: ${bundle.scope}`,
    `Repo: ${bundle.repo.root}`,
    `Branch: ${bundle.repo.branch || "(detached)"}`,
    `Target: ${bundle.target.label}`,
    `Head: ${bundle.repo.headSha.slice(0, 8)}`,
    "",
    "## Summary",
    "",
    `- Files: ${bundle.summary.includedFiles} included, ${bundle.summary.excludedFiles} excluded`,
    `- Diff: +${bundle.summary.additions} / -${bundle.summary.deletions}`,
    `- Notes: ${bundle.summary.notes}`,
    `- Inline drafts: ${bundle.summary.reviewInlineDrafts} publishable, ${bundle.summary.privateInlineComments} private`,
    `- PR threads: ${bundle.summary.unresolvedPrThreads} unresolved / ${bundle.summary.prThreads} total`,
  ];

  for (const warning of bundle.summary.warnings ?? []) {
    lines.push(`- Warning: ${warning}`);
  }

  if (bundle.currentFile) {
    lines.push("", "## Current File", "", handoffFileLine(bundle.currentFile));
  }

  if (bundle.reviewQueue.length > 0) {
    lines.push("", "## Review Queue", "");
    for (const [index, file] of bundle.reviewQueue.entries()) {
      lines.push(`${index + 1}. ${handoffFileLine(file)}`);
      if (file.reason) {
        lines.push(`   - Reason: ${file.reason}`);
      }
    }
  }

  if (bundle.notes.length > 0) {
    lines.push("", "## Reviewer Notes", "");
    for (const note of bundle.notes) {
      lines.push(`### ${note.path}`);
      if (note.status) {
        lines.push(`Status: ${note.status}`);
      }
      if (note.privateNote.trim()) {
        lines.push("", "Private note:", quoteBlock(note.privateNote));
      }
      if (note.publishableDraft.trim()) {
        lines.push("", "Publishable draft:", quoteBlock(note.publishableDraft));
      }
      for (const comment of note.inlineComments) {
        lines.push(
          "",
          `- ${comment.visibility} inline ${handoffLineLabel(comment)} (${comment.side}): ${comment.body}`,
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
    );
    if (bundle.pr.threads.length > 0) {
      lines.push("", "### Review Threads", "");
      for (const thread of bundle.pr.threads) {
        lines.push(`- ${thread.path}${thread.line ? `:L${thread.line}` : ""} (${thread.isResolved ? "resolved" : "unresolved"})`);
        for (const comment of thread.comments) {
          lines.push(`  - ${comment.author}: ${oneLine(comment.body)}`);
        }
      }
    }
    if (bundle.pr.topLevelComments.length > 0) {
      lines.push("", "### Top-Level PR Comments", "");
      for (const comment of bundle.pr.topLevelComments) {
        lines.push(`- ${comment.author}: ${oneLine(comment.body)}`);
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

function renderPrivateNotesMarkdown(bundle) {
  const lines = ["# Review Desk Private Notes"];

  if (bundle.notes.length === 0) {
    lines.push("", "No private notes.");
    return `${lines.join("\n")}\n`;
  }

  for (const note of bundle.notes) {
    lines.push("", `## ${note.path}`);
    if (note.privateNote.trim()) {
      lines.push("", quoteBlock(note.privateNote));
    }
    for (const comment of note.inlineComments ?? []) {
      lines.push("", `- ${handoffLineLabel(comment)} (${comment.side}): ${comment.body}`);
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function handoffFileLine(file) {
  const flags = [
    file.status,
    file.ordered ? "ordered" : "unordered",
    file.excluded ? "excluded" : null,
    file.missing ? "missing" : null,
    file.group,
  ].filter(Boolean);
  return `${file.path} (${flags.join(", ")})`;
}

function handoffLineLabel(comment) {
  if (comment.startLine && comment.endLine && comment.startLine !== comment.endLine) {
    return `L${comment.startLine}-L${comment.endLine}`;
  }
  return `L${comment.endLine ?? comment.startLine ?? comment.endDiffPosition}`;
}

function quoteBlock(value) {
  return String(value)
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

const PR_HANDOFF_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title url state isDraft reviewDecision mergeStateStatus
      author { login }
      labels(first: 30) { nodes { name } }
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 50) {
            nodes {
              id body createdAt
              author { login }
            }
          }
        }
      }
      comments(first: 100) {
        nodes {
          id body createdAt
          author { login }
        }
      }
    }
  }
}
`;

function loadPullRequestHandoffContext(context, args) {
  if (args["skip-pr-context"] || context.target.request.kind !== "pullRequest") {
    return null;
  }
  const number = coerceNumber(context.target.request.number) ?? parsePrNumber(context.target.request.url ?? "");
  if (!number) {
    return null;
  }
  const repo = githubRepoForRemote(context.repoRoot, context.target.request.remote);
  if (!repo) {
    return {
      warning: "Could not infer GitHub owner/repo from git remote.",
      number,
      title: "",
      url: context.target.request.url ?? "",
      state: "",
      isDraft: false,
      author: "",
      labels: [],
      threads: [],
      topLevelComments: [],
    };
  }

  try {
    const body = command(context.repoRoot, "gh", [
      "api",
      "graphql",
      "-f",
      `query=${PR_HANDOFF_QUERY}`,
      "-F",
      `owner=${repo.owner}`,
      "-F",
      `repo=${repo.name}`,
      "-F",
      `number=${number}`,
    ]);
    const pr = JSON.parse(body)?.data?.repository?.pullRequest;
    if (!pr) {
      return null;
    }
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      isDraft: Boolean(pr.isDraft),
      reviewDecision: pr.reviewDecision ?? null,
      mergeStateStatus: pr.mergeStateStatus ?? null,
      author: pr.author?.login ?? "",
      labels: (pr.labels?.nodes ?? []).map((label) => label.name).filter(Boolean),
      threads: (pr.reviewThreads?.nodes ?? []).map((thread) => ({
        id: thread.id,
        path: thread.path,
        line: thread.line ?? thread.originalLine ?? null,
        originalLine: thread.originalLine ?? null,
        isResolved: Boolean(thread.isResolved),
        isOutdated: Boolean(thread.isOutdated),
        comments: (thread.comments?.nodes ?? []).map((comment) => ({
          id: comment.id,
          author: comment.author?.login ?? "unknown",
          body: comment.body ?? "",
          createdAt: comment.createdAt ?? "",
        })),
      })),
      topLevelComments: (pr.comments?.nodes ?? []).map((comment) => ({
        id: comment.id,
        author: comment.author?.login ?? "unknown",
        body: comment.body ?? "",
        createdAt: comment.createdAt ?? "",
      })),
    };
  } catch (error) {
    return {
      warning: `Could not load PR comments through gh: ${error instanceof Error ? error.message : String(error)}`,
      number,
      title: "",
      url: context.target.request.url ?? "",
      state: "",
      isDraft: false,
      author: "",
      labels: [],
      threads: [],
      topLevelComments: [],
    };
  }
}

function filterPrHandoffContext(pr, scope, requestedPath) {
  const threads = pr.threads
    .filter((thread) => !requestedPath || sameRepoPath(thread.path, requestedPath))
    .filter((thread) => scope !== "session" || !thread.isResolved);
  return {
    ...pr,
    threads,
    topLevelComments: requestedPath ? [] : pr.topLevelComments,
  };
}

function githubRepoForRemote(repoRoot, remoteName) {
  const remotes = listRemotes(repoRoot);
  const remote =
    remotes.find((candidate) => candidate.name === remoteName) ??
    remotes.find((candidate) => candidate.name === "origin") ??
    remotes[0];
  if (!remote) {
    return null;
  }
  return parseGithubRemote(remote.url);
}

function parseGithubRemote(url) {
  const cleaned = String(url).trim().replace(/\.git$/, "");
  const match =
    cleaned.match(/github\.com[:/]([^/]+)\/([^/]+)$/) ??
    cleaned.match(/[:/]([^/:]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return { owner: match[1], name: match[2] };
}

function safeGitValue(repoRoot, args) {
  try {
    return git(repoRoot, args).trim();
  } catch {
    return "";
  }
}

function createDiagram(args) {
  const result = createDiagramFromArgs(args, { emit: true });
  return result;
}

function createDiagramFromArgs(args, options = {}) {
  const context = loadDiagramContext(args);
  const scope = normalizeDiagramScope(args.scope ?? "session");
  const diagramPath = diagramPathForSession(context.repoRoot, context.sessionId, scope);
  const existing = existsSync(diagramPath) ? readJson(diagramPath) : null;
  const snapshotHash = diagramSnapshotHash(context, scope);

  if (
    existing &&
    !args.force &&
    existing.snapshotHash === snapshotHash &&
    existing.analyzerVersion === DIAGRAM_ANALYZER_VERSION
  ) {
    if (options.emit !== false) {
      emitDiagramResult(existing, diagramPath, true, args);
    }
    return { diagram: existing, path: diagramPath, cached: true };
  }

  const diagram = buildReviewDiagram(context, scope, snapshotHash, existing);
  writeJson(diagramPath, diagram);

  if (options.emit !== false) {
    emitDiagramResult(diagram, diagramPath, false, args);
  }

  return { diagram, path: diagramPath, cached: false };
}

function listDiagrams(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const diagrams = listDiagramRecords(repoRoot).map((record) => ({
    id: record.diagram.id,
    sessionId: record.diagram.sessionId,
    kind: record.diagram.kind,
    scope: record.diagram.scope,
    targetLabel: record.diagram.targetLabel,
    updatedAt: record.diagram.updatedAt,
    path: record.path,
    nodes: record.diagram.stats?.nodes ?? record.diagram.nodes?.length ?? 0,
    edges: record.diagram.stats?.edges ?? record.diagram.edges?.length ?? 0,
  }));

  if (args.json) {
    writeStdout({ repoRoot, diagrams });
    return;
  }

  if (diagrams.length === 0) {
    console.log("No review diagrams.");
    return;
  }

  for (const diagram of diagrams) {
    console.log(
      `${diagram.updatedAt}  ${diagram.scope}  ${diagram.nodes} nodes  ${diagram.path}`,
    );
  }
}

function getDiagram(args) {
  const { diagram, path } = loadDiagramByArgs(args);

  if (args.json) {
    writeStdout({ path, diagram });
    return;
  }

  console.log(diagram.source);
}

function exportDiagram(args) {
  const { diagram, path } = loadDiagramByArgs(args);
  const output = clean(args.output ?? args.out);

  if (args.json && !output) {
    writeStdout({ path, diagram });
    return;
  }

  const contents = args.format === "json"
    ? `${JSON.stringify(diagram, null, 2)}\n`
    : `${diagram.source.trimEnd()}\n`;

  if (output) {
    writeFileTextAtomic(output, contents);
    if (args.json) {
      writeStdout({ sourcePath: path, outputPath: resolve(output) });
    } else {
      console.log(`exported diagram: ${resolve(output)}`);
    }
    return;
  }

  process.stdout.write(contents);
}

function updateDiagram(args) {
  const { diagram, path } = loadDiagramByArgs(args);
  const update = readDiagramUpdateArg(args);
  const source = update.source ?? clean(update.overview?.source) ?? diagram.source;
  const now = new Date().toISOString();
  const warnings = (diagram.warnings ?? []).filter(
    (warning) => warning.code !== "manual-source-edit" && warning.code !== "manual-overview-source",
  );
  if (!update.metadata) {
    warnings.push({
      code: "manual-overview-source",
      message: "Overview Mermaid source was manually edited; drilldown metadata was preserved.",
    });
  }
  const overview = update.overview
    ? {
        version: 1,
        ...(diagram.overview ?? {}),
        ...update.overview,
        source,
        nodes: update.overview.nodes?.length
          ? normalizeOverviewNodes(update.overview.nodes)
          : normalizeOverviewNodes(diagram.overview?.nodes ?? []),
        edges: update.overview.edges?.length
          ? normalizeOverviewEdges(update.overview.edges)
          : normalizeOverviewEdges(diagram.overview?.edges ?? []),
        updatedAt: now,
      }
    : diagram.overview
      ? {
          ...diagram.overview,
          source,
          updatedAt: now,
        }
      : undefined;
  const next = {
    ...diagram,
    source,
    ...(overview ? { overview } : {}),
    warnings,
    updatedAt: now,
  };

  writeJson(path, next);

  if (args.json) {
    writeStdout({ path, diagram: next });
    return;
  }

  console.log(`updated diagram: ${path}`);
}

function readDiagramUpdateArg(args) {
  const raw = readDiagramSourceArg(args);
  const trimmed = raw.trim();
  const metadata =
    Boolean(args.metadata ?? args["overview-json"]) ||
    args.format === "json" ||
    trimmed.startsWith("{");

  if (!metadata) {
    return { source: raw, overview: null, metadata: false };
  }

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    fail(`Failed to parse diagram metadata JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const overviewPayload = payload.overview ?? payload;
  return {
    source: clean(payload.source ?? payload.mermaid ?? overviewPayload.source),
    overview: {
      ...overviewPayload,
      source: clean(overviewPayload.source ?? payload.source ?? payload.mermaid) ?? undefined,
      nodes: normalizeOverviewNodes(overviewPayload.nodes ?? []),
      edges: normalizeOverviewEdges(overviewPayload.edges ?? []),
    },
    metadata: true,
  };
}

function loadDiagramContext(args) {
  if (hasExplicitTargetArgs(args) && !clean(args.manifest)) {
    const created = createSessionManifest({
      ...args,
      json: false,
      activate: args.activate !== false,
    });
    return loadNotesContext({
      ...args,
      repo: created.repoRoot,
      manifest: created.manifestPath,
    });
  }

  return loadNotesContext(args);
}

function hasExplicitTargetArgs(args) {
  return Boolean(
    clean(args.target ?? args.t) ||
      clean(args.base) ||
      clean(args.head) ||
      clean(args.commit ?? args.sha) ||
      clean(args.from ?? args["from-ref"]) ||
      clean(args.to ?? args["to-ref"]) ||
      clean(args.pr ?? args.number ?? args.url),
  );
}

function normalizeDiagramScope(value) {
  const scope = String(value).trim();
  if (scope === "session" || scope === "neighbors" || scope === "deep") {
    return scope;
  }
  fail("Diagram scope must be session, neighbors, or deep");
}

function buildReviewDiagram(context, scope, snapshotHash, previous) {
  const now = new Date().toISOString();
  const warnings = [];
  const sessionEntries = sessionFileEntries(context)
    .filter((entry) => !entry.excluded && !entry.missing)
    .map((entry, index) => ({
      ...entry,
      order: index + 1,
      source: "session",
    }));
  const initialPaths = sessionEntries.map((entry) => entry.path);
  const relations = collectImportRelations(context.repoRoot, initialPaths, scope, warnings);
  const entries = [...sessionEntries];
  const seenPaths = new Set(entries.map((entry) => entry.path));

  if (scope !== "session") {
    for (const path of relations.neighborPaths.slice(0, MAX_NEIGHBOR_NODES)) {
      if (seenPaths.has(path) || isGeneratedPath(path)) {
        continue;
      }
      entries.push({
        path,
        ordered: false,
        excluded: false,
        missing: false,
        group: "External context",
        reason: "Directly imported by a session file.",
        order: entries.length + 1,
        source: "neighbor",
      });
      seenPaths.add(path);
    }
    if (relations.neighborPaths.length > MAX_NEIGHBOR_NODES) {
      warnings.push({
        code: "neighbor-cap",
        message: `Collapsed ${relations.neighborPaths.length - MAX_NEIGHBOR_NODES} neighbor files beyond the diagram cap.`,
      });
    }
  }

  if (scope === "deep") {
    warnings.push({
      code: "deep-v1",
      message: "Deep scope currently uses capped neighbor expansion; broader agent-authored context can be layered into the Mermaid source.",
    });
  }

  const visibleEntries = entries.slice(0, MAX_DIAGRAM_NODES - 1);
  const overflowEntries = entries.slice(MAX_DIAGRAM_NODES - 1);
  if (overflowEntries.length > 0) {
    warnings.push({
      code: "node-cap",
      message: `Collapsed ${overflowEntries.length} files beyond the ${MAX_DIAGRAM_NODES} node cap.`,
    });
  }

  const nodes = visibleEntries.map((entry, index) => diagramNodeForEntry(entry, index));
  if (overflowEntries.length > 0) {
    nodes.push({
      id: `n${nodes.length}`,
      label: `${overflowEntries.length} more files`,
      group: "Collapsed",
      kind: "collapsed",
      collapsed: true,
      order: nodes.length + 1,
      fileId: null,
      path: null,
      reason: "Large session collapsed for readability.",
    });
  }

  const pathToNode = new Map(nodes.filter((node) => node.path).map((node) => [node.path, node]));
  const edges = buildDiagramEdges(nodes, pathToNode, relations.edges, warnings);
  const overview = buildDiagramOverview(context, nodes, edges, previous);
  const source = clean(overview.source) ?? renderMermaidOverviewMap(context, overview);

  return {
    version: 1,
    analyzerVersion: DIAGRAM_ANALYZER_VERSION,
    id: `diagram-${rustHashStrings([context.sessionId, scope])}`,
    sessionId: context.sessionId,
    repoRoot: context.repoRoot,
    kind: "reviewMap",
    scope,
    format: "mermaid",
    source,
    overview,
    targetLabel: context.target.label,
    target: context.target.request,
    snapshotHash,
    nodes,
    edges,
    warnings,
    stats: {
      files: sessionEntries.length,
      nodes: nodes.length,
      edges: edges.length,
      collapsedFiles: overflowEntries.length,
      skippedLargeFiles: warnings.filter((warning) => warning.code === "large-file").length,
    },
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

function diagramNodeForEntry(entry, index) {
  return {
    id: `n${index}`,
    fileId: fileId(entry.path),
    path: entry.path,
    label: `${entry.order}. ${compactDiagramPath(entry.path)}`,
    group: clean(entry.group) ?? (entry.ordered ? "Ordered by agent" : "Not ordered by agent"),
    kind: diagramNodeKind(entry.path, entry.source),
    collapsed: false,
    order: entry.order,
    reason: clean(entry.reason) ?? null,
  };
}

function diagramNodeKind(path, source) {
  if (source === "neighbor") {
    return "neighbor";
  }
  const lower = path.toLowerCase();
  if (/\.(test|spec)\.[tj]sx?$/.test(lower) || lower.includes("__tests__/")) {
    return "test";
  }
  if (lower.endsWith(".md") || lower.startsWith("docs/")) {
    return "doc";
  }
  if (
    lower.endsWith(".json") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".yaml") ||
    lower.includes("config")
  ) {
    return "config";
  }
  return "file";
}

function collectImportRelations(repoRoot, paths, scope, warnings) {
  const edges = [];
  const neighborPaths = [];
  const sessionPathSet = new Set(paths);
  const tsPaths = paths.filter(isTsLikePath);

  if (tsPaths.length === 0) {
    return { edges, neighborPaths };
  }

  let project = null;
  try {
    const Project = getTsMorphProject();
    const tsconfig = findTsConfig(repoRoot);
    project = tsconfig
      ? new Project({ tsConfigFilePath: tsconfig, skipAddingFilesFromTsConfig: true })
      : new Project({ skipAddingFilesFromTsConfig: true });
  } catch (error) {
    warnings.push({
      code: "ts-project",
      message: `TypeScript project setup failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return collectRegexImportRelations(repoRoot, paths, scope, warnings);
  }

  for (const path of tsPaths) {
    const fullPath = join(repoRoot, path);
    if (!existsSync(fullPath)) {
      continue;
    }
    if (statSync(fullPath).size > MAX_AST_FILE_BYTES) {
      warnings.push({
        code: "large-file",
        path,
        message: "Skipped AST import analysis for a large file.",
      });
      continue;
    }

    try {
      const sourceFile =
        project.getSourceFile(fullPath) ?? project.addSourceFileAtPath(fullPath);
      for (const declaration of sourceFile.getImportDeclarations()) {
        const specifier = declaration.getModuleSpecifierValue();
        const resolvedPath =
          declaration.getModuleSpecifierSourceFile()?.getFilePath() ??
          resolveImportCandidate(repoRoot, path, specifier);
        if (resolvedPath && !isPathInside(repoRoot, resolvedPath)) {
          continue;
        }
        const repoPath = resolvedPath ? normalizeRepoRelativePath(repoRoot, resolvedPath) : null;
        if (!repoPath || isGeneratedPath(repoPath)) {
          continue;
        }
        if (sessionPathSet.has(repoPath)) {
          edges.push({
            sourcePath: path,
            targetPath: repoPath,
            kind: "import",
            label: "imports",
          });
        } else if (scope !== "session") {
          neighborPaths.push(repoPath);
          edges.push({
            sourcePath: path,
            targetPath: repoPath,
            kind: "import",
            label: "imports",
          });
        }
      }
    } catch (error) {
      warnings.push({
        code: "ts-file",
        path,
        message: `TypeScript import analysis failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    edges: dedupeRelationEdges(edges),
    neighborPaths: unique(neighborPaths),
  };
}

function collectRegexImportRelations(repoRoot, paths, scope, warnings) {
  const edges = [];
  const neighborPaths = [];
  const sessionPathSet = new Set(paths);

  for (const path of paths.filter(isTsLikePath)) {
    const fullPath = join(repoRoot, path);
    if (!existsSync(fullPath) || statSync(fullPath).size > MAX_AST_FILE_BYTES) {
      continue;
    }
    const source = readFileSync(fullPath, "utf8");
    const imports = source.matchAll(/\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g);
    for (const match of imports) {
      const resolved = resolveImportCandidate(repoRoot, path, match[1]);
      if (!resolved) {
        continue;
      }
      const repoPath = normalizeRepoRelativePath(repoRoot, resolved);
      if (sessionPathSet.has(repoPath)) {
        edges.push({ sourcePath: path, targetPath: repoPath, kind: "import", label: "imports" });
      } else if (scope !== "session") {
        neighborPaths.push(repoPath);
      }
    }
  }

  warnings.push({
    code: "regex-imports",
    message: "Fell back to regex import analysis because TypeScript project setup failed.",
  });
  return { edges: dedupeRelationEdges(edges), neighborPaths: unique(neighborPaths) };
}

function buildDiagramEdges(nodes, pathToNode, importRelations, warnings) {
  const edges = [];
  const sessionNodes = nodes.filter((node) => node.path && node.kind !== "neighbor");

  for (let index = 1; index < sessionNodes.length; index += 1) {
    edges.push({
      id: `e${edges.length}`,
      source: sessionNodes[index - 1].id,
      target: sessionNodes[index].id,
      sourcePath: sessionNodes[index - 1].path,
      targetPath: sessionNodes[index].path,
      kind: "reviewOrder",
      label: "next",
    });
  }

  for (const relation of importRelations) {
    const source = pathToNode.get(relation.sourcePath);
    const target = pathToNode.get(relation.targetPath);
    if (!source || !target || source.id === target.id) {
      continue;
    }
    edges.push({
      id: `e${edges.length}`,
      source: source.id,
      target: target.id,
      sourcePath: source.path,
      targetPath: target.path,
      kind: relation.kind,
      label: relation.label,
    });
  }

  for (const edge of testToSourceEdges(nodes, pathToNode)) {
    edges.push({
      id: `e${edges.length}`,
      ...edge,
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const edge of edges) {
    const key = `${edge.source}:${edge.target}:${edge.kind}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ ...edge, id: `e${deduped.length}` });
  }

  if (deduped.length > MAX_DIAGRAM_EDGES) {
    warnings.push({
      code: "edge-cap",
      message: `Collapsed ${deduped.length - MAX_DIAGRAM_EDGES} edges beyond the ${MAX_DIAGRAM_EDGES} edge cap.`,
    });
  }

  return deduped.slice(0, MAX_DIAGRAM_EDGES);
}

function testToSourceEdges(nodes, pathToNode) {
  const edges = [];
  const sourceNodes = nodes.filter((node) => node.path && node.kind !== "test");

  for (const testNode of nodes.filter((node) => node.kind === "test" && node.path)) {
    const baseName = basename(testNode.path)
      .replace(/\.(test|spec)\.[tj]sx?$/i, "")
      .replace(/\.[tj]sx?$/i, "");
    const match = sourceNodes.find((node) => {
      const candidate = basename(node.path)
        .replace(/\.[tj]sx?$/i, "");
      return candidate === baseName;
    });
    if (match && pathToNode.has(match.path)) {
      edges.push({
        source: testNode.id,
        target: match.id,
        sourcePath: testNode.path,
        targetPath: match.path,
        kind: "test",
        label: "tests",
      });
    }
  }

  return edges;
}

function renderMermaidReviewMap(context, nodes, edges, warnings) {
  const lines = [
    "flowchart LR",
    `  %% Review Desk diagram for ${context.target.label}`,
  ];
  const groups = groupDiagramNodes(nodes);

  for (const group of groups) {
    lines.push(`  subgraph ${group.id}["${mermaidText(group.title)}"]`);
    for (const node of group.nodes) {
      lines.push(`    ${node.id}["${mermaidText(node.label)}"]`);
    }
    lines.push("  end");
  }

  for (const edge of edges) {
    const arrow = edge.kind === "reviewOrder" ? "-.->" : "-->";
    lines.push(`  ${edge.source} ${arrow}|${mermaidText(edge.label)}| ${edge.target}`);
  }

  if (warnings.length > 0) {
    lines.push(`  warn["${mermaidText(`${warnings.length} generation warnings`)}"]`);
  }

  lines.push(
    "  classDef file fill:#1f1d1a,stroke:#a39e92,color:#f4efe2;",
    "  classDef test fill:#18251f,stroke:#6fa27e,color:#f4efe2;",
    "  classDef config fill:#202336,stroke:#8794cc,color:#f4efe2;",
    "  classDef doc fill:#27231d,stroke:#c6a15b,color:#f4efe2;",
    "  classDef neighbor fill:#231f28,stroke:#b894d8,color:#f4efe2;",
    "  classDef collapsed fill:#321f1a,stroke:#d65a31,color:#f4efe2;",
  );

  for (const node of nodes) {
    lines.push(`  class ${node.id} ${node.kind};`);
  }

  return `${lines.join("\n")}\n`;
}

function groupDiagramNodes(nodes) {
  const groups = [];
  const byTitle = new Map();
  for (const node of nodes) {
    const title = node.group || "Review files";
    let group = byTitle.get(title);
    if (!group) {
      group = {
        id: `g${groups.length}`,
        title,
        nodes: [],
      };
      groups.push(group);
      byTitle.set(title, group);
    }
    group.nodes.push(node);
  }
  return groups;
}

function buildDiagramOverview(context, nodes, edges, previous) {
  const generated = generatedDiagramOverview(context, nodes, edges);
  const previousOverview = previous?.overview && typeof previous.overview === "object"
    ? previous.overview
    : null;
  const manuallyEditedSource = previous?.warnings?.some(
    (warning) => warning.code === "manual-source-edit" || warning.code === "manual-overview-source",
  )
    ? clean(previous?.source)
    : null;
  const source = clean(previousOverview?.source) ?? manuallyEditedSource ?? generated.source;
  const previousNodes = Array.isArray(previousOverview?.nodes)
    ? normalizeOverviewNodes(previousOverview.nodes)
    : [];
  const previousEdges = Array.isArray(previousOverview?.edges)
    ? normalizeOverviewEdges(previousOverview.edges)
    : [];

  return {
    version: 1,
    source,
    nodes: previousNodes.length > 0 ? previousNodes : generated.nodes,
    edges: previousEdges.length > 0 ? previousEdges : generated.edges,
    generatedAt: previousOverview?.generatedAt ?? new Date().toISOString(),
  };
}

function generatedDiagramOverview(context, nodes, edges) {
  const fileNodes = nodes.filter((node) => node.path && !node.collapsed);
  const groups = groupDiagramNodes(fileNodes);
  const overviewNodes = groups.map((group, index) => {
    const paths = group.nodes.map((node) => node.path).filter(Boolean);
    const testCount = group.nodes.filter((node) => node.kind === "test").length;
    const label = `${group.title}\n${paths.length} files${testCount ? `, ${testCount} tests` : ""}`;
    return {
      id: `group-${index + 1}`,
      label,
      description: group.title,
      kind: "group",
      groups: [group.title],
      paths,
      fileIds: group.nodes.map((node) => node.fileId).filter(Boolean),
    };
  });
  const groupByNodeId = new Map();
  for (const group of groups) {
    for (const node of group.nodes) {
      groupByNodeId.set(node.id, group.title);
    }
  }
  const overviewNodeByGroup = new Map(
    overviewNodes.flatMap((node) => node.groups.map((group) => [group, node.id])),
  );
  const edgeCounts = new Map();

  for (const edge of edges) {
    const sourceGroup = groupByNodeId.get(edge.source);
    const targetGroup = groupByNodeId.get(edge.target);
    if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) {
      continue;
    }
    const source = overviewNodeByGroup.get(sourceGroup);
    const target = overviewNodeByGroup.get(targetGroup);
    if (!source || !target) {
      continue;
    }
    const key = `${source}->${target}`;
    const current = edgeCounts.get(key) ?? {
      source,
      target,
      count: 0,
      kinds: new Set(),
    };
    current.count += 1;
    current.kinds.add(edge.kind);
    edgeCounts.set(key, current);
  }

  const overviewEdges = [...edgeCounts.values()].map((edge, index) => ({
    id: `overview-edge-${index + 1}`,
    source: edge.source,
    target: edge.target,
    label: overviewEdgeLabel(edge),
  }));
  const overview = {
    version: 1,
    source: "",
    nodes: overviewNodes,
    edges: overviewEdges,
    generatedAt: new Date().toISOString(),
  };
  overview.source = renderMermaidOverviewMap(context, overview);
  return overview;
}

function overviewEdgeLabel(edge) {
  if (edge.kinds.has("import")) {
    return edge.count > 1 ? `${edge.count} imports` : "imports";
  }
  if (edge.kinds.has("test")) {
    return edge.count > 1 ? `${edge.count} tests` : "tests";
  }
  return "review flow";
}

function normalizeOverviewNodes(nodes) {
  const seen = new Set();
  const normalized = [];
  for (const node of nodes) {
    const id = clean(node?.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      label: clean(node.label) ?? id,
      description: clean(node.description) ?? null,
      kind: clean(node.kind) ?? "concept",
      groups: normalizeStringList(node.groups),
      paths: normalizeStringList(node.paths),
      fileIds: normalizeStringList(node.fileIds),
    });
  }
  return normalized;
}

function normalizeOverviewEdges(edges) {
  const normalized = [];
  for (const edge of edges) {
    const source = clean(edge?.source);
    const target = clean(edge?.target);
    if (!source || !target || source === target) {
      continue;
    }
    normalized.push({
      id: clean(edge.id) ?? `overview-edge-${normalized.length + 1}`,
      source,
      target,
      label: clean(edge.label) ?? "",
    });
  }
  return normalized;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => clean(item)).filter(Boolean);
}

function renderMermaidOverviewMap(context, overview) {
  const lines = [
    "flowchart LR",
    `  %% Review Desk overview for ${context.target.label}`,
  ];
  const nodeIdMap = new Map();

  for (const node of overview.nodes ?? []) {
    const id = mermaidNodeId(node.id, nodeIdMap);
    lines.push(`  ${id}["${mermaidText(node.label)}"]`);
  }

  for (const edge of overview.edges ?? []) {
    const source = nodeIdMap.get(edge.source);
    const target = nodeIdMap.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const label = clean(edge.label);
    lines.push(label ? `  ${source} -->|${mermaidText(label)}| ${target}` : `  ${source} --> ${target}`);
  }

  lines.push(
    "  classDef concept fill:#1f2633,stroke:#8fb3ff,color:#f8fafc;",
    "  classDef group fill:#13271f,stroke:#6ee7b7,color:#f8fafc;",
  );

  for (const node of overview.nodes ?? []) {
    const id = nodeIdMap.get(node.id);
    if (id) {
      lines.push(`  class ${id} ${node.kind === "group" ? "group" : "concept"};`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function mermaidNodeId(id, existing) {
  const base = String(id)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^([^a-zA-Z_])/, "_$1")
    .slice(0, 60) || "node";
  let next = base;
  let suffix = 2;
  while ([...existing.values()].includes(next)) {
    next = `${base}_${suffix}`;
    suffix += 1;
  }
  existing.set(id, next);
  return next;
}

function diagramSnapshotHash(context, scope) {
  const entries = sessionFileEntries(context)
    .map((entry) => [
      entry.path,
      entry.group ?? "",
      entry.reason ?? "",
      entry.ordered ? "ordered" : "unordered",
      entry.excluded ? "excluded" : "included",
      entry.missing ? "missing" : "present",
    ].join(":"))
    .join("\n");
  return `diagram-snapshot-${rustHashStrings([
    context.repoRoot,
    context.sessionId,
    context.target.diffTarget ?? "HEAD",
    scope,
    JSON.stringify(context.manifest),
    entries,
  ])}`;
}

function emitDiagramResult(diagram, path, cached, args) {
  if (args.json) {
    writeStdout({
      path,
      cached,
      diagram,
    });
    return;
  }

  console.log(`${cached ? "diagram cached" : "diagram created"}: ${path}`);
}

function loadDiagramByArgs(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const path = resolveDiagramPath(repoRoot, args);
  const diagram = readJson(path);
  return { diagram, path };
}

function resolveDiagramPath(repoRoot, args) {
  const explicit = clean(args.id ?? args.diagram ?? args._?.[0]);
  const records = listDiagramRecords(repoRoot);

  if (explicit && explicit !== "active") {
    if (explicit.includes("/") || explicit.endsWith(DIAGRAM_FILE_SUFFIX)) {
      const resolved = resolve(explicit);
      if (!existsSync(resolved)) {
        fail(`Review diagram not found: ${resolved}`);
      }
      return resolved;
    }

    const byId = records.find((record) => record.diagram.id === explicit);
    if (!byId) {
      fail(`Review diagram not found: ${explicit}`);
    }
    return byId.path;
  }

  const context = loadNotesContext(args);
  const scope = normalizeDiagramScope(args.scope ?? "session");
  const exactPath = diagramPathForSession(repoRoot, context.sessionId, scope);
  if (existsSync(exactPath)) {
    return exactPath;
  }

  const latestForSession = records.find(
    (record) => record.diagram.sessionId === context.sessionId,
  );
  if (latestForSession) {
    return latestForSession.path;
  }

  fail(`No review diagram found for active session ${context.sessionId}`);
}

function listDiagramRecords(repoRoot) {
  const diagramsDir = repoStorage(repoRoot).diagramsDir;
  if (!existsSync(diagramsDir)) {
    return [];
  }

  return readdirSync(diagramsDir)
    .filter((name) => name.endsWith(DIAGRAM_FILE_SUFFIX))
    .map((name) => {
      const path = join(diagramsDir, name);
      try {
        return { path, diagram: readJson(path) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) =>
      String(b.diagram.updatedAt ?? "").localeCompare(String(a.diagram.updatedAt ?? "")),
    );
}

function diagramPathForSession(repoRoot, sessionId, scope) {
  return join(repoStorage(repoRoot).diagramsDir, `${sessionId}-${scope}${DIAGRAM_FILE_SUFFIX}`);
}

function readDiagramSourceArg(args) {
  if (args.stdin) {
    return readFileSync(0, "utf8").replace(/\n$/, "");
  }
  if (args.source) {
    return readFileSync(resolve(args.source), "utf8");
  }
  return required(args.body ?? args.text ?? args.mermaid, "diagram source");
}

function isTsLikePath(path) {
  return /\.[cm]?[tj]sx?$/.test(path);
}

function getTsMorphProject() {
  if (!TsMorphProject) {
    TsMorphProject = require("ts-morph").Project;
  }
  return TsMorphProject;
}

function findTsConfig(repoRoot) {
  const tsconfig = join(repoRoot, "tsconfig.json");
  return existsSync(tsconfig) ? tsconfig : null;
}

function resolveImportCandidate(repoRoot, sourcePath, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const base = resolve(dirname(join(repoRoot, sourcePath)), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function isPathInside(root, path) {
  const relativePath = relative(resolve(root), resolve(path));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function dedupeRelationEdges(edges) {
  const seen = new Set();
  const next = [];
  for (const edge of edges) {
    const key = `${edge.sourcePath}:${edge.targetPath}:${edge.kind}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(edge);
  }
  return next;
}

function compactDiagramPath(path) {
  const parts = path.split("/");
  if (parts.length <= 3) {
    return path;
  }
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

function mermaidText(value) {
  return String(value)
    .replace(/\\/g, "/")
    .replace(/"/g, "'")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/[{}]/g, "")
    .replace(/[|]/g, "/")
    .replace(/\s+/g, " ")
    .trim();
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
      const diffTarget = isWorktree
        ? git(repoRoot, ["merge-base", baseRef, "HEAD"]).trim()
        : `${baseRef}...${headRef}`;
      return {
        request: { kind: "branch", baseRef, headRef },
        diffTarget,
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
  const includeReviewArtifacts = supportsReviewComments(context);

  for (const [fileId, file] of context.files.byId.entries()) {
    const state = context.workspaceState[fileId];
    if (!state && !options.includeAll) {
      continue;
    }
    const entry = noteEntry(fileId, file.path, {
      ...defaultFileState(),
      ...state,
    }, { includeReviewArtifacts });
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
    }, { includeReviewArtifacts });
    if (options.includeAll || hasFileStateContent(entry)) {
      entries.push(entry);
    }
  }

  return entries.sort((a, b) => (a.path ?? a.fileId).localeCompare(b.path ?? b.fileId));
}

function noteEntry(fileId, path, state, options = {}) {
  const inlineComments = state.inlineComments ?? [];
  const includeReviewArtifacts = options.includeReviewArtifacts !== false;
  return {
    fileId,
    path,
    status: state.status ?? "unseen",
    privateNote: state.privateNote ?? "",
    publishableDraft: includeReviewArtifacts ? state.publishableDraft ?? "" : "",
    inlineComments: includeReviewArtifacts
      ? inlineComments
      : inlineComments.filter((comment) => comment.visibility === "private"),
  };
}

function supportsReviewComments(context) {
  return context.target?.request?.kind === "pullRequest";
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
    diagramsDir: join(root, "diagrams"),
    activeSessionPath: join(root, "active-session.json"),
  };
}

function repoStorageKey(repoRoot) {
  const identityRoot = repoIdentityRoot(repoRoot);
  return `${slug(basename(identityRoot))}-${fnv1a64(identityRoot)}`;
}

function repoIdentityRoot(repoRoot) {
  const normalizedRepoRoot = realpathSync(resolve(repoRoot));
  const dotGit = join(normalizedRepoRoot, ".git");
  if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) {
    return normalizedRepoRoot;
  }

  const pointer = readFileSync(dotGit, "utf8").trim();
  const match = pointer.match(/^gitdir:\s*(.+)$/);
  if (!match) {
    return normalizedRepoRoot;
  }

  const gitDir = resolve(normalizedRepoRoot, match[1]);
  const commonDirFile = join(gitDir, "commondir");
  if (!existsSync(commonDirFile)) {
    return normalizedRepoRoot;
  }

  const commonDir = resolve(gitDir, readFileSync(commonDirFile, "utf8").trim());
  return basename(commonDir) === ".git" ? dirname(commonDir) : normalizedRepoRoot;
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
      "with-diagram",
      "force",
      "all",
      "append",
      "skip-pr-context",
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
    timeout: 15_000,
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
  review-desk session create --repo . --target pr --pr 123 --with-diagram
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
  review-desk notes draft --repo . --path src/file.ts --body "Publishable PR review text"
  review-desk notes status --repo . --path src/file.ts --status reviewed
  review-desk handoff --repo . [--scope session|current-file|notes|pr-comments] [--format markdown|json]
  review-desk handoff --repo . --scope current-file --path src/file.ts
  review-desk diagrams create --repo . [--scope session|neighbors|deep]
  review-desk diagrams create --repo . --target commit --commit 5315b7c
  review-desk diagrams list --repo . [--json]
  review-desk diagrams get --repo . [--json]
  review-desk diagrams export --repo . --output review-map.mmd
  review-desk diagrams update --repo . --stdin < review-map.mmd
  review-desk diagrams update --repo . --format json --stdin < overview.json

Aliases:
  review-desk create-session --repo . [--base main] [--head feature]
  review-desk activate /path/to/session.review-session.json
  review-desk list --repo .

session create writes to Review Desk app data and marks it active.
diagrams create uses the active review session by default and writes to app data.
Use --output only when you explicitly want to export a manifest elsewhere.
The desktop app auto-loads the active session for an open repo.
Publishable drafts and --visibility review are only available for pull request sessions.`);
}

function fail(message) {
  console.error(`review-desk: ${message}`);
  process.exit(1);
}
