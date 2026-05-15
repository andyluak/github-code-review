# Review Desk

Local-first desktop code review app built with Tauri, Rust, React, TypeScript, Tailwind, and shadcn-style primitives.

## Current Slice

- Opens a local Git repository.
- Builds an ordered review session from the dirty worktree or a base/head diff.
- Excludes generated noise such as lockfiles, generated folders, target output, and Tauri icon assets.
- Groups files into a review workflow.
- Shows a side-by-side diff canvas.
- Tracks viewed and reviewed file status.
- Keeps private self-review notes separate from publishable review drafts.

## Commands

```bash
pnpm install
pnpm desktop
```

Build checks:

```bash
pnpm build
pnpm test:rust
pnpm desktop:build
```
