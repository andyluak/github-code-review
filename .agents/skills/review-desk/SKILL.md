---
name: review-desk
description: Use when the user wants to create, activate, inspect, or prepare a Review Desk code review session from a Git working tree, branch diff, commit, commit range, or pull request. Also use when an agent should order changed files, add per-file review rationale, or hand off a logical review queue to the Review Desk desktop app.
---

# Review Desk

Review Desk is a local-first desktop code review app. It must work without AI. Agents enhance it by creating ordered review sessions through the `review-desk` CLI.

Use this skill when the user asks for phrases like:

- "create a review session"
- "open this PR/commit/range in Review Desk"
- "order files for review"
- "make an agent review session"
- "prepare this diff for a reviewer"
- "use Review Desk"

## Core Rule

Use the first-class CLI. Do not make the user manage raw manifests unless they explicitly ask for one.

```bash
review-desk session create --repo . --target working-tree --agent codex
review-desk session create --repo . --target branch --base main --head feature/my-pr --agent codex
review-desk session create --repo . --target commit --commit 5315b7c --agent codex
review-desk session create --repo . --target range --from main --to HEAD --agent codex
review-desk session create --repo . --target pr --pr 123 --agent codex
```

The CLI writes:

```txt
.review-desk/sessions/*.review-session.json
.review-desk/active-session.json
```

The desktop app auto-loads the active session for the open repo.

## Workflow

1. Resolve the repo root and review target.
2. Inspect the target diff with Git.
3. Decide a logical reviewer order.
4. Create the Review Desk session with the CLI.
5. Tell the user the session is active and what target it covers.

Prefer a reviewer workflow order, not alphabetical order:

1. Entry points and public contracts
2. Core logic and state/data flow
3. UI/API consumers
4. Tests
5. Config/docs/supporting files

Exclude noisy generated files only when they are actually in the diff.

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

## Validation

After creating a session, prefer a lightweight check:

```bash
review-desk session list --repo .
```

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
