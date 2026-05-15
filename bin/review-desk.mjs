#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const SESSION_DIR = ".review-desk/sessions";
const ACTIVE_SESSION_PATH = ".review-desk/active-session.json";
const GLOBAL_ACTIVE_SESSION_PATH = ".review-desk/active-session.json";

main();

function main() {
  const [command, ...rest] = process.argv.slice(2);

  try {
    switch (command) {
      case "session":
        handleSessionCommand(rest);
        break;
      case "create-session":
      case "create":
        createSession(parseArgs(rest));
        break;
      case "activate":
        activateSession(parseArgs(rest));
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
    join(repoRoot, SESSION_DIR, `${timestamp()}-${slug(title)}.review-session.json`);

  writeJson(outputPath, manifest);

  if (args.activate !== false) {
    writeActivePointer(repoRoot, outputPath);
  }

  if (args.json) {
    writeStdout({
      manifestPath: outputPath,
      active: args.activate !== false,
      target: target.request,
      fileOrder: manifest.fileOrder.length,
      excludedPaths: manifest.excludedPaths.length,
    });
  } else {
    console.log(`review-desk session: ${outputPath}`);
    if (args.activate !== false) {
      console.log(`active session: ${join(repoRoot, ACTIVE_SESSION_PATH)}`);
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
  writeActivePointer(repoRoot, absoluteManifestPath);

  if (args.json) {
    writeStdout({
      manifestPath: absoluteManifestPath,
      activeSessionPath: join(repoRoot, ACTIVE_SESSION_PATH),
    });
  } else {
    console.log(`active session: ${absoluteManifestPath}`);
  }
}

function listSessions(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const sessionsDir = join(repoRoot, SESSION_DIR);
  const sessions = existsSync(sessionsDir)
    ? readdirSync(sessionsDir)
        .filter((name) => name.endsWith(".review-session.json"))
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
    return;
  }

  for (const session of sessions) {
    console.log(`${session.updatedAt}  ${session.path}`);
  }
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

function writeActivePointer(repoRoot, manifestPath) {
  const relativeManifestPath = relative(repoRoot, resolve(manifestPath));
  const activePath = join(repoRoot, ACTIVE_SESSION_PATH);
  const pointer = {
    repoRoot,
    manifestPath: relativeManifestPath.startsWith("..")
      ? resolve(manifestPath)
      : relativeManifestPath,
    activatedAt: new Date().toISOString(),
    source: "review-desk-cli",
  };

  mkdirSync(join(repoRoot, ".review-desk"), { recursive: true });
  writeJson(activePath, pointer);

  if (process.env.HOME) {
    writeJson(join(process.env.HOME, GLOBAL_ACTIVE_SESSION_PATH), {
      ...pointer,
      manifestPath: resolve(manifestPath),
    });
  }
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

    const booleanKeys = new Set(["stdin", "json", "activate"]);
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
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function unique(values) {
  return [...new Set(values)];
}

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  review-desk session activate .review-desk/sessions/session.review-session.json
  review-desk session list --repo .

Aliases:
  review-desk create-session --repo . [--base main] [--head feature]
  review-desk activate .review-desk/sessions/session.review-session.json
  review-desk list --repo .

session create writes .review-desk/sessions/*.review-session.json and marks it active.
The desktop app auto-loads the active session for an open repo.`);
}

function fail(message) {
  console.error(`review-desk: ${message}`);
  process.exit(1);
}
