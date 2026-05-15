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

function createSession(args) {
  const repoRoot = gitRoot(args.repo ?? ".");
  const sourceManifest = readSourceManifest(args);
  const baseRef = clean(args.base ?? sourceManifest.baseRef);
  const headRef = clean(args.head ?? sourceManifest.headRef);
  const changedPaths = getChangedPaths(repoRoot, baseRef, headRef);
  const generated = changedPaths.filter(isGeneratedPath);
  const reviewable = changedPaths.filter((path) => !isGeneratedPath(path));
  const title =
    clean(args.title ?? sourceManifest.title) ??
    `Review ${headRef ? `${baseRef ?? "base"}...${headRef}` : "working tree"}`;
  const createdBy = clean(args["created-by"] ?? args.agent ?? sourceManifest.createdBy) ?? "agent";
  const manifest = {
    version: 1,
    repoRoot,
    ...(baseRef ? { baseRef } : {}),
    ...(headRef ? { headRef } : {}),
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

  mkdirSync(resolve(repoRoot, SESSION_DIR), { recursive: true });
  writeJson(outputPath, manifest);

  if (args.activate !== false) {
    writeActivePointer(repoRoot, outputPath);
  }

  if (args.json) {
    writeStdout({
      manifestPath: outputPath,
      active: args.activate !== false,
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

function getChangedPaths(repoRoot, baseRef, headRef) {
  const diffArgs = ["diff", "--name-only", "--find-renames"];
  if (baseRef && headRef) {
    diffArgs.push(`${baseRef}...${headRef}`);
  } else if (baseRef) {
    diffArgs.push(baseRef);
  } else {
    diffArgs.push("HEAD");
  }
  diffArgs.push("--");

  const tracked = git(repoRoot, diffArgs)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (baseRef || headRef) {
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

function gitRoot(path) {
  return git(resolve(path ?? "."), ["rev-parse", "--show-toplevel"]).trim();
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
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
  review-desk create-session --repo . [--base main] [--head feature] [--title "..."]
  review-desk create-session --repo . --stdin < manifest.json
  review-desk create-session --repo . --manifest /tmp/session.json
  review-desk activate .review-desk/sessions/session.review-session.json
  review-desk list --repo .

create-session writes .review-desk/sessions/*.review-session.json and marks it active.
The desktop app auto-loads the active session for an open repo.`);
}

function fail(message) {
  console.error(`review-desk: ${message}`);
  process.exit(1);
}
