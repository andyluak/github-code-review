# Agent Review Session Manifest

Review Desk can load an agent-created review session from the CLI. Review Desk works without an agent, but Codex, Claude Code, or any local tool can enhance a review by creating an ordered session:

1. Resolve the review target.
2. Inspect the target diff.
3. Decide a review order.
4. Run `review-desk session create`.
5. Review Desk auto-loads the active session for the open repo.

The app renders the order exactly as provided. It validates paths against the selected diff, but it does not infer risk, groups, or review priority.

## Storage

The CLI stores active Review Desk session state in app-owned local storage, not in
the reviewed repository. On macOS the default location is:

```txt
~/Library/Application Support/Review Desk/
```

Each repo gets its own storage folder under:

```txt
repos/<repo-name>-<stable-hash>/
```

`review-desk session create` writes the manifest to that repo storage folder and
updates both the repo-specific active pointer and the global latest-active
pointer. The desktop app checks app storage first and still falls back to legacy
repo-local pointers for old sessions.

Reviewer progress and notes are stored beside the session data:

```txt
repos/<repo-name>-<stable-hash>/workspace-state/<session-id>.json
```

That workspace-state file owns viewed/reviewed status, private notes,
publishable drafts, and inline comments. Browser `localStorage` is only used as
a migration source for older app builds.

`.review-desk/` inside a repo is legacy/export-only state. Use `--output` only
when you explicitly want a portable manifest outside the default app storage.

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
review-desk session activate "/path/to/pr-review.review-session.json"
```

Migrate an old repo-local session into app storage:

```bash
review-desk session migrate --repo . --remove-legacy
```

Inspect and edit the active review queue:

```bash
review-desk session files list --repo . --json
review-desk session files add --repo . --path src/file.ts --group "Core logic" --reason "Review before UI callers"
review-desk session files remove --repo . --path src/generated.ts --reason "Generated noise"
review-desk session files move --repo . --path src/file.ts --before src/other.ts
review-desk session files organize --repo . --path src/file.ts --group "Tests" --reason "Covers the regression"
```

Queue edits create a new active app-data manifest and copy the existing
workspace-state to the new session id, so viewed/reviewed status, private notes,
publishable drafts, and inline comments survive add/remove/reorder operations.

Read active Review Desk notes and file progress:

```bash
review-desk notes list --repo . --json
review-desk notes get --repo . --path src/file.ts --json
```

Write active Review Desk workspace state:

```bash
review-desk notes add --repo . --path src/file.ts --line 42 --body "Check this"
review-desk notes private --repo . --path src/file.ts --body "Scratch note"
review-desk notes draft --repo . --path src/file.ts --body "Publishable review text"
review-desk notes status --repo . --path src/file.ts --status reviewed
```

`notes add` creates inline comments and defaults to private notes on the new
side of the diff. Use `--visibility review` for publishable inline comments,
`--side old` for removed lines, and `--stdin` for multi-line text.

Backwards-compatible aliases still work:

```bash
review-desk create-session --repo . --base main --head feature/my-pr
review-desk activate "/path/to/pr-review.review-session.json"
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
- Use `review-desk session files ...` to add, remove, reorder, or regroup files in an active session.
- Use `review-desk notes ...` to read/write viewed status, private notes, publishable drafts, and inline comments.
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
- Files in `excludedPaths` are removed from the active queue, while their workspace-state can remain available if re-added later.
- `agentNotes` appear in the Inspector's `Agent context` section for that file.
- Missing ordered files, missing note targets, and missing excluded paths are shown as import warnings.
- Private notes and viewed/reviewed status remain local to Review Desk app data.
