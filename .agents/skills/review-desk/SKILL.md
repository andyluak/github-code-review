---
name: review-desk
description: Use when the user wants to create, activate, inspect, update, or prepare a Review Desk code review session from a Git working tree, branch diff, commit, commit range, or pull request. Also use when an agent should order changed files, add/remove/reorder review files, add per-file review rationale, extract/get/add Review Desk notes, update viewed/reviewed progress, or hand off a logical review queue to the Review Desk desktop app.
---

# Review Desk

Review Desk is a local-first desktop code review app. It must work without AI. Agents enhance it by creating ordered review sessions through the `review-desk` CLI.

Use this skill when the user asks for phrases like:

- "create a review session"
- "open this PR/commit/range in Review Desk"
- "order files for review"
- "add/remove/reorder files in review"
- "make an agent review session"
- "prepare this diff for a reviewer"
- "get/extract Review Desk notes"
- "add a Review Desk note/comment"
- "mark files viewed or reviewed"
- "generate a review map/diagram"
- "use Review Desk"

## Core Rule

Use the first-class CLI. Do not make the user manage raw manifests or
workspace-state JSON unless they explicitly ask for it or the CLI is missing the
needed operation.

```bash
review-desk session create --repo . --target working-tree --agent codex
review-desk session create --repo . --target branch --base main --head feature/my-pr --agent codex
review-desk session create --repo . --target commit --commit 5315b7c --agent codex
review-desk session create --repo . --target range --from main --to HEAD --agent codex
review-desk session create --repo . --target pr --pr 123 --agent codex
review-desk session create --repo . --target pr --pr 123 --agent codex --with-diagram
```

The CLI writes active session state to Review Desk app data, not to the reviewed repo.
On macOS this is under:

```txt
~/Library/Application Support/Review Desk/
```

The desktop app auto-loads the active session for the open repo from app data.
`.review-desk/` inside a repo is legacy/export-only state; do not create it unless
the user explicitly asks for a portable manifest via `--output`.

Reviewer progress and notes are app-data files too:

```txt
~/Library/Application Support/Review Desk/repos/<repo-key>/workspace-state/<session-id>.json
```

This file owns viewed/reviewed status, private notes, publishable drafts, and
inline comments. Browser `localStorage` is only a legacy migration source.

Review maps are optional app-data artifacts attached to sessions:

```txt
~/Library/Application Support/Review Desk/repos/<repo-key>/diagrams/<session-id>-<scope>.review-diagram.json
```

Do not generate diagrams by default. Use them when the user asks for a map, or
when the review is complex enough that a visual session map is explicitly useful.
The default diagram scope is `session`, which uses the active agent-created
session order/groups/reasons as the source of truth.

Review maps use progressive disclosure. The first view should be a compact
conceptual overview, not the full generated file graph. The CLI keeps generated
file nodes and edges as drilldown metadata, and agents should attach overview
metadata that maps conceptual nodes to session groups or files.

Agents should use the CLI for this state:

```bash
review-desk session files list --repo . --json
review-desk session files add --repo . --path src/file.ts --group "Core logic" --reason "Review this before callers"
review-desk session files remove --repo . --path src/generated.ts --reason "Generated noise"
review-desk session files move --repo . --path src/file.ts --before src/other.ts
review-desk session files organize --repo . --path src/file.ts --group "Tests" --reason "Verify behavior"
review-desk notes list --repo . --json
review-desk notes get --repo . --path src/file.ts --json
review-desk notes add --repo . --path src/file.ts --line 42 --body "Check this"
review-desk notes private --repo . --path src/file.ts --body "Scratch note"
review-desk notes draft --repo . --path src/file.ts --body "Publishable review text"
review-desk notes status --repo . --path src/file.ts --status reviewed
review-desk handoff --repo .
review-desk handoff --repo . --format json
review-desk handoff --repo . --scope current-file --path src/file.ts
review-desk handoff --repo . --scope notes
review-desk handoff --repo . --scope pr-comments
review-desk diagrams create --repo .
review-desk diagrams create --repo . --scope neighbors
review-desk diagrams get --repo .
review-desk diagrams update --repo . --stdin < review-map.mmd
review-desk diagrams update --repo . --format json --stdin < overview.json
review-desk diagrams export --repo . --output review-map.mmd
```

Use `review-desk handoff` when a user wants to pass their Review Desk notes,
drafts, queue, and PR comments to an agent. It reads the active app-data session
and emits markdown by default; use `--format json` for structured automation.
Supported scopes are `session`, `current-file`, `notes`, and `pr-comments`.
Do not launch Codex, Claude, a terminal, or an MCP server unless the user asks
for that separately.

## Workflow

1. Resolve the repo root and review target.
2. Inspect the target diff with Git.
3. Decide a logical reviewer order.
4. Create the Review Desk session with the CLI.
5. If requested, create a review map with `review-desk diagrams create --repo .`.
6. Tell the user the session is active and what target it covers.

Prefer a reviewer workflow order, not alphabetical order:

1. Entry points and public contracts
2. Core logic and state/data flow
3. UI/API consumers
4. Tests
5. Config/docs/supporting files

Exclude noisy generated files only when they are actually in the diff.

For diagrams, create the review session first. A diagram should visualize the
curated session, not rediscover the PR from raw Git state. Use `--with-diagram`
only when the user asks for session creation and a map in one step.

For complex PRs, author a layered map:

1. Use the ordered session groups/files as the file-review source of truth.
2. Write a compact Mermaid overview that names the concepts/data flow a reviewer
   needs first.
3. Attach overview metadata with `review-desk diagrams update --format json --stdin`.
4. Map each overview node to one or more session `groups`, `paths`, or `fileIds`.
5. Avoid showing the full file graph as the first view. Use raw Mermaid-only
   updates only when the user asked for a visual tweak and drilldown metadata is
   not needed.

Overview metadata JSON:

```json
{
  "source": "flowchart LR\n  ui[\"UI\"] --> api[\"API\"]\n",
  "overview": {
    "nodes": [
      {
        "id": "ui",
        "label": "UI surfaces",
        "description": "Routes, forms, tables, and actions",
        "groups": ["01 Entry points", "02 UI consumers"],
        "paths": ["src/App.tsx"]
      }
    ],
    "edges": [
      { "source": "ui", "target": "api", "label": "calls" }
    ]
  }
}
```

## Agent-Provided Order

When you have enough context to improve the order, pass order data through stdin:

```bash
review-desk session create --repo . --target pr --pr 123 --agent codex --stdin < /tmp/review-session.json
```

The stdin JSON should include only the review intelligence:

```json
{
  "title": "Review PR #123",
  "createdBy": "codex",
  "fileOrder": [
    {
      "path": "src/api/create-review.ts",
      "group": "Entry points",
      "reason": "Start with the external contract and command path."
    }
  ],
  "excludedPaths": [
    {
      "path": "pnpm-lock.yaml",
      "reason": "Lockfile noise."
    }
  ],
  "agentNotes": [
    {
      "path": "src/api/create-review.ts",
      "source": "codex",
      "note": "Check request validation before reviewing downstream state updates."
    }
  ]
}
```

The CLI adds repo/target metadata, validates changed paths through Review Desk, writes the manifest, and activates it.

## Target Selection

- Working tree: use `--target working-tree` for uncommitted changes.
- Branch: use `--target branch --base main --head feature/x`.
- Single commit: use `--target commit --commit <sha>`.
- Commit range: use `--target range --from <base> --to <head>`.
- Pull request: use `--target pr --pr <number>` when `gh` can resolve metadata. If needed, add `--base`, `--head`, or `--remote`.

Use local refs that exist. If a PR cannot resolve, inspect `gh pr view` / remotes and explain the missing local data.

## Review Queue Editing

Use `review-desk session files ...` to inspect or change the active review
queue. These commands rewrite the active app-data manifest, activate the new
manifest, and copy the old workspace-state to the new session id so private
notes, inline comments, drafts, and viewed/reviewed status survive.

Common commands:

```bash
# List ordered, unordered, and excluded files for the active session.
review-desk session files list --repo . --json

# Add a changed file to the ordered review queue, or re-include an excluded file.
review-desk session files add --repo . --path src/file.ts --group "Core logic" --reason "Review before UI callers"

# Place the file precisely.
review-desk session files add --repo . --path src/file.ts --after src/entry.ts
review-desk session files move --repo . --path src/file.ts --before src/other.ts
review-desk session files move --repo . --path src/file.ts --index 3

# Change group/reason without moving it.
review-desk session files organize --repo . --path src/file.ts --group "Tests" --reason "Covers the regression"

# Remove a file from the review queue.
review-desk session files remove --repo . --path src/generated.ts --reason "Generated noise"
```

Only files in the active review target diff can be added. If a user asks to add
a file outside the diff, explain that the review target must be recreated or
changed first. Removing a file excludes it from the session but keeps existing
workspace-state so notes can come back if it is re-added.

## Review Notes

Use `review-desk notes ...` for viewed/reviewed state, private notes,
publishable drafts, and inline comments. It resolves the active app-data session
for the repo, maps file paths to Review Desk file ids, and writes the correct
workspace-state file.

Common commands:

```bash
# Extract every touched file state and note for the active session.
review-desk notes list --repo . --json

# Read one file's state and notes.
review-desk notes get --repo . --path src/file.ts --json

# Add an inline private comment on the new side of the diff.
review-desk notes add --repo . --path src/file.ts --line 42 --body "Question here"

# Add a publishable review comment instead of a private note.
review-desk notes add --repo . --path src/file.ts --line 42 --visibility review --body "Blocking issue here"

# Add or replace file-level scratch/private notes or publishable drafts.
review-desk notes private --repo . --path src/file.ts --body "Local scratchpad"
review-desk notes draft --repo . --path src/file.ts --body "Ready to publish"

# Preserve reviewer progress.
review-desk notes status --repo . --path src/file.ts --status viewed
review-desk notes status --repo . --path src/file.ts --status reviewed
```

Use `--stdin` instead of `--body` for multi-line note text. Use `--append` with
`notes private` or `notes draft` when adding to existing file-level text. Inline
comments default to `--side new` and `--visibility private`; pass `--side old`
for removed lines. If a line cannot be mapped to the diff, use
`--diff-position` only when you already know Review Desk's exact rendered diff
position.

The JSON shape returned by `notes list/get` is the stable agent contract:

```json
{
  "repoRoot": "/repo",
  "sessionId": "agent-session-...",
  "workspaceStatePath": ".../workspace-state/agent-session-....json",
  "notes": [
    {
      "fileId": "file-...",
      "path": "src/file.ts",
      "status": "reviewed",
      "privateNote": "",
      "publishableDraft": "",
      "inlineComments": [
        {
          "path": "src/file.ts",
          "startLine": 42,
          "endLine": 42,
          "body": "Question here",
          "visibility": "private"
        }
      ]
    }
  ]
}
```

Only edit `workspace-state/<session-id>.json` directly as a fallback. If you do,
create/keep a top-level object keyed by Review Desk `fileId`, preserve existing
fields, and write atomically.

## Validation

After creating a session, prefer a lightweight check:

```bash
review-desk session list --repo .
```

If an older session already exists under a repo-local `.review-desk/`, migrate it:

```bash
review-desk session migrate --repo . --remove-legacy
```

After changing notes, verify with:

```bash
review-desk notes list --repo . --json
```

After changing the queue, verify with:

```bash
review-desk session files list --repo . --json
```

Do not write review progress or notes into the reviewed repo.

For code changes to Review Desk itself, run the repo checks:

```bash
pnpm build
pnpm test:rust
```

## Output Style

Keep the final response short:

- state the target reviewed
- state that the Review Desk session is active
- mention warnings only if files were missing/excluded unexpectedly
- include the manifest path only when useful

Do not paste the full manifest unless the user asks.
