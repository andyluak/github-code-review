# Agent Review Session Manifest

Review Desk can load an agent-created review session from the CLI. This is the bridge for Codex, Claude Code, or any local agent:

1. Inspect the PR or local diff.
2. Decide a review order.
3. Run `review-desk create-session`.
4. Review Desk auto-loads the active session for the open repo.

The app renders the order exactly as provided. It does not infer risk, groups, or review priority.

## File Name

The CLI writes session files near the repo:

```txt
.review-desk/sessions/pr-review.review-session.json
```

It also writes:

```txt
.review-desk/active-session.json
```

The desktop app watches this active pointer.

## CLI

Basic working-tree session:

```bash
review-desk create-session --repo . --title "Review working tree" --created-by codex
```

PR-style session:

```bash
review-desk create-session --repo . --base main --head feature/my-pr --title "Review feature/my-pr" --created-by claude
```

Agent-provided order through stdin:

```bash
review-desk create-session --repo . --stdin < /tmp/agent-review-session.json
```

Activate an existing session:

```bash
review-desk activate .review-desk/sessions/pr-review.review-session.json
```

## Manifest Schema

```json
{
  "version": 1,
  "repoRoot": "/absolute/path/to/repo",
  "baseRef": "main",
  "headRef": "feature/my-pr",
  "title": "Review feature/my-pr",
  "createdBy": "codex",
  "fileOrder": [
    {
      "path": "src/api/create-review.ts",
      "group": "Entry points",
      "reason": "Start with the external contract and command path."
    },
    {
      "path": "src/lib/review-order.ts",
      "group": "Core logic",
      "reason": "This owns the ordering behavior used by the UI."
    }
  ],
  "excludedPaths": [
    {
      "path": "pnpm-lock.yaml",
      "reason": "Dependency lockfile noise."
    }
  ],
  "agentNotes": [
    {
      "path": "src/lib/review-order.ts",
      "source": "codex",
      "note": "Pay attention to renamed files and any generated-path filtering."
    }
  ]
}
```

## Rules For Agents

- Use absolute `repoRoot`.
- Use Git refs that exist locally.
- Put every intentionally ordered file in `fileOrder`.
- Preserve review workflow order, not alphabetical order.
- Use short, concrete `reason` text. One sentence is enough.
- Never invent files. If a file is not in the diff, do not include it.
- Put generated or noisy files in `excludedPaths` only when they are actually in the diff.
- Keep groups factual: `Entry points`, `Core logic`, `State/data flow`, `UI consumers`, `Tests`, `Config/docs`.
- If unsure about a file, include it later in the order with an honest reason.

## Review Desk Behavior

- Files in `fileOrder` are shown first, grouped by the supplied `group`.
- Diff files not listed by the agent are appended under `Not ordered by agent`.
- `agentNotes` appear in the Inspector's `Agent context` section for that file.
- Missing ordered files, missing note targets, and missing excluded paths are shown as import warnings.
- Private notes and viewed/reviewed status remain local to Review Desk.
