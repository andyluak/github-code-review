# Agent Review Session Manifest

Review Desk can load an agent-created review session from the CLI. Review Desk works without an agent, but Codex, Claude Code, or any local tool can enhance a review by creating an ordered session:

1. Resolve the review target.
2. Inspect the target diff.
3. Decide a review order.
4. Run `review-desk session create`.
5. Review Desk auto-loads the active session for the open repo.

The app renders the order exactly as provided. It validates paths against the selected diff, but it does not infer risk, groups, or review priority.

## File Name

The CLI writes session files near the repo:

```txt
.review-desk/sessions/pr-review.review-session.json
```

It also writes:

```txt
.review-desk/active-session.json
```

The desktop app checks this pointer and can load that manifest for the open repo.

## CLI

Working-tree session:

```bash
review-desk session create --repo . --target working-tree --title "Review working tree" --agent codex
```

Branch session:

```bash
review-desk session create --repo . --target branch --base main --head feature/my-pr --agent claude
```

Single-commit session:

```bash
review-desk session create --repo . --target commit --commit 5315b7c --agent codex
```

Commit-range session:

```bash
review-desk session create --repo . --target range --from main --to HEAD --agent codex
```

Pull-request session:

```bash
review-desk session create --repo . --target pr --pr 123 --agent claude
```

Agent-provided order through stdin:

```bash
review-desk session create --repo . --target pr --pr 123 --stdin < /tmp/agent-review-session.json
```

Activate an existing session:

```bash
review-desk session activate .review-desk/sessions/pr-review.review-session.json
```

Backwards-compatible aliases still work:

```bash
review-desk create-session --repo . --base main --head feature/my-pr
review-desk activate .review-desk/sessions/pr-review.review-session.json
review-desk list --repo .
```

## Manifest Schema

```json
{
  "version": 1,
  "repoRoot": "/absolute/path/to/repo",
  "target": {
    "kind": "branch",
    "baseRef": "main",
    "headRef": "feature/my-pr"
  },
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

`target` is the preferred field. `baseRef` and `headRef` remain for older manifests and older app builds.

Supported targets:

```json
{ "kind": "workingTree" }
{ "kind": "branch", "baseRef": "main", "headRef": "feature/my-pr" }
{ "kind": "commit", "commit": "5315b7c" }
{ "kind": "commitRange", "fromRef": "main", "toRef": "HEAD" }
{ "kind": "pullRequest", "remote": "origin", "number": 123, "baseRef": "main" }
```

## Rules For Agents

- Use absolute `repoRoot`.
- Use `target` for the actual review target.
- Use Git refs that exist locally. PR targets may use `gh` and `git fetch` to resolve the head ref.
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
