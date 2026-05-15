# Atelier Redesign + Ledger View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Review Desk's muddy gold/tobacco visual system with the "Atelier" design (ink/cream surfaces, single vermillion accent, editorial serif headlines, proper diff colors) and add two functional improvements: a session-progress beacon in the CommandBar, a split/unified diff view toggle, and a **Ledger** view in the Inspector that surfaces every private note + review comment across the session with click-to-jump-to-line.

**Architecture:** Pure frontend work — no Rust, no Tauri command, no type changes. Replaces CSS tokens in `src/index.css`, swaps `@fontsource-variable/geist` for Instrument Serif + Inter + JetBrains Mono, then redesigns each component in `src/components/review/`. Adds two hooks (`use-diff-view-mode`, ledger-collection logic stays in a `src/lib/ledger.ts` helper) and wires a global jump-target through `App.tsx`.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@tailwindcss/vite`), Radix UI primitives, Tauri 2, Vite 7. Fonts via `@fontsource` packages.

**Test strategy:** There is no React test infrastructure in this repo — only `pnpm test:rust`. Verification per task: `pnpm build` (TS + Vite production build) plus a visual check via `pnpm dev` at `http://localhost:1420`. Final task uses `pnpm desktop` for the Tauri shell.

---

## File map

| File | Action | Responsibility after change |
|---|---|---|
| `package.json` | Modify | Swap font deps |
| `src/index.css` | Modify | New tokens, font imports, atmosphere |
| `src/lib/status.ts` | Modify | Map status/change to new token names |
| `src/lib/ledger.ts` | Create | Aggregate notes/drafts/inline comments across files |
| `src/hooks/use-diff-view-mode.ts` | Create | Persisted `"split"` / `"unified"` |
| `src/components/review/CommandBar.tsx` | Modify | Three-zone bar + Session Progress Beacon (demotes stale) |
| `src/components/review/ReviewRail.tsx` | Modify | Numbered manuscript rail, per-group numbering for agent order |
| `src/components/review/DiffCanvas.tsx` | Modify | View toggle, unified renderer, row anchors for jump-to-line |
| `src/components/review/Inspector.tsx` | Modify | Accordion sections, basket footer, **Ledger view** |
| `src/components/review/EmptyState.tsx` | Modify | Editorial cover page |
| `src/App.tsx` | Modify | Diff view shortcut, jump-target state, Inspector mode state |
| `docs/agent-review-session.md` | Modify | Replace "Agent tab" → "Agent section" |

---

## Task 1: Foundation — fonts and design tokens

**Files:**
- Modify: `package.json` (dependencies block)
- Modify: `src/index.css` (entire file)
- Modify: `src/lib/status.ts`

- [ ] **Step 1.1: Swap font packages**

Run:
```bash
pnpm remove @fontsource-variable/geist
pnpm add @fontsource-variable/inter @fontsource-variable/jetbrains-mono @fontsource/instrument-serif
```
Expected: `package.json` shows the three new packages; lockfile updates without errors.

- [ ] **Step 1.2: Replace `src/index.css` with the Atelier token system**

Open `src/index.css` and replace its entire content with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
@import "@fontsource/instrument-serif/400.css";
@import "@fontsource/instrument-serif/400-italic.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-display: 'Instrument Serif', ui-serif, Georgia, serif;
    --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace;
    --font-heading: var(--font-sans);
    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar: var(--sidebar);
    --color-chart-5: var(--chart-5);
    --color-chart-4: var(--chart-4);
    --color-chart-3: var(--chart-3);
    --color-chart-2: var(--chart-2);
    --color-chart-1: var(--chart-1);
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);
    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
    --app-font-scale: 1;

    /* Atelier surfaces */
    --rd-ink: #0a0a0c;
    --rd-ink-2: #111114;
    --rd-ink-3: #17171b;
    --rd-ink-4: #1f1f24;

    /* Type colors */
    --rd-cream: #ece6d8;
    --rd-cream-2: #c8c1b3;
    --rd-graphite: #8a8478;
    --rd-pencil: #5a564e;

    /* Single accent */
    --rd-vermillion: #ff4f3f;
    --rd-vermillion-2: #ff7361;
    --rd-vermillion-bg: rgba(255, 79, 63, 0.10);
    --rd-vermillion-line: rgba(255, 79, 63, 0.55);

    /* Diff colors */
    --rd-add: #34c779;
    --rd-add-bg: rgba(52, 199, 121, 0.08);
    --rd-add-line: rgba(52, 199, 121, 0.45);
    --rd-del: #e0524f;
    --rd-del-bg: rgba(224, 82, 79, 0.08);
    --rd-del-line: rgba(224, 82, 79, 0.45);

    /* Hairlines */
    --rd-hair: rgba(236, 230, 216, 0.06);
    --rd-hair-2: rgba(236, 230, 216, 0.12);
    --rd-hair-3: rgba(236, 230, 216, 0.20);

    /* shadcn baseline (kept for any unmodified shadcn primitives) */
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --radius: 0.5rem;
    --sidebar: oklch(0.985 0 0);
    --sidebar-foreground: oklch(0.145 0 0);
    --sidebar-primary: oklch(0.205 0 0);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.97 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.708 0 0);
}

.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.488 0.243 264.376);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  button:not(:disabled), [role="button"]:not(:disabled) {
    cursor: pointer;
  }
  html {
    @apply font-sans;
  }
}

html,
body,
#root {
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

html {
  font-size: calc(16px * var(--app-font-scale));
}

body {
  margin: 0;
  background: var(--rd-ink);
  color: var(--rd-cream);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::selection {
  background: var(--rd-vermillion-bg);
  color: var(--rd-cream);
}

* {
  scrollbar-width: thin;
  scrollbar-color: rgba(236, 230, 216, 0.10) transparent;
}

/* Functional transitions only — 120ms. */
button,
input,
textarea,
[role="button"] {
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out,
    color 120ms ease-out,
    opacity 120ms ease-out;
}

/* Jump-to-line flash — single 200ms outline pulse, no layout shift */
@keyframes rd-jump-flash {
  0%   { outline-color: var(--rd-vermillion); }
  100% { outline-color: transparent; }
}

.rd-jump-flash {
  outline: 2px solid var(--rd-vermillion);
  outline-offset: -2px;
  animation: rd-jump-flash 800ms ease-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  button,
  input,
  textarea,
  [role="button"] {
    transition: none;
  }
  .rd-jump-flash {
    animation: none;
    outline: 2px solid var(--rd-vermillion);
  }
}

.rd-app {
  background:
    radial-gradient(circle at 14% 0%, rgba(255, 79, 63, 0.05), transparent 38%),
    var(--rd-ink);
  color: var(--rd-cream);
}

.rd-hair {
  border-color: var(--rd-hair);
}

.rd-hair-2 {
  border-color: var(--rd-hair-2);
}

.rd-surface {
  background: var(--rd-ink-2);
}

.rd-surface-raised {
  background: var(--rd-ink-3);
}

.rd-display {
  font-family: var(--font-display);
  font-weight: 400;
  letter-spacing: -0.01em;
}

.rd-display-italic {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
}

.rd-mono {
  font-family: var(--font-mono);
  font-feature-settings: "calt" 0;
}
```

- [ ] **Step 1.3: Update `src/lib/status.ts` to use new tokens**

Replace `src/lib/status.ts` with:

```ts
import type { ChangeKind, ViewedStatus } from "@/types/review";

export function statusTone(status: ViewedStatus) {
  switch (status) {
    case "reviewed":
      return "border-[var(--rd-vermillion-line)] bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]";
    case "viewed":
      return "border-[var(--rd-hair-2)] bg-[var(--rd-ink-3)] text-[var(--rd-cream-2)]";
    case "changedSinceReviewed":
    case "changedSinceViewed":
      return "border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] text-[var(--rd-del)]";
    case "unseen":
      return "border-[var(--rd-hair)] bg-transparent text-[var(--rd-graphite)]";
  }
}

export function changeTone(changeKind: ChangeKind) {
  switch (changeKind) {
    case "added":
      return "text-[var(--rd-add)]";
    case "deleted":
      return "text-[var(--rd-del)]";
    case "renamed":
      return "text-[var(--rd-vermillion-2)]";
    case "modified":
      return "text-[var(--rd-graphite)]";
  }
}
```

- [ ] **Step 1.4: Type-check**

```bash
pnpm build
```
Expected: TypeScript compiles. Vite emits `dist/` without errors. Old `--rd-bg`, `--rd-panel-2`, etc. tokens are still referenced by un-touched components but, being CSS custom properties, they simply resolve to inherit/initial — the build itself must succeed. The app will look broken in the browser until later tasks land.

- [ ] **Step 1.5: Commit**

```bash
git add package.json pnpm-lock.yaml src/index.css src/lib/status.ts
git commit -m "redesign: introduce Atelier design tokens + editorial fonts"
```

---

## Task 2: Diff view mode hook

**Files:**
- Create: `src/hooks/use-diff-view-mode.ts`

- [ ] **Step 2.1: Create the hook**

Create `src/hooks/use-diff-view-mode.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

export type DiffViewMode = "split" | "unified";

const STORAGE_KEY = "rd:diffViewMode";
const DEFAULT_MODE: DiffViewMode = "split";

function readStoredMode(): DiffViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_MODE;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "unified" || raw === "split" ? raw : DEFAULT_MODE;
}

export function useDiffViewMode(): [DiffViewMode, (next: DiffViewMode) => void, () => void] {
  const [mode, setModeState] = useState<DiffViewMode>(readStoredMode);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      setModeState(readStoredMode());
    }
    function onCustom() {
      setModeState(readStoredMode());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("rd:diff-view-mode-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rd:diff-view-mode-change", onCustom);
    };
  }, []);

  const setMode = useCallback((next: DiffViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("rd:diff-view-mode-change"));
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    const next: DiffViewMode = readStoredMode() === "split" ? "unified" : "split";
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("rd:diff-view-mode-change"));
    setModeState(next);
  }, []);

  return [mode, setMode, toggleMode];
}
```

- [ ] **Step 2.2: Type-check + commit**

```bash
pnpm build
```
Expected: builds cleanly.

```bash
git add src/hooks/use-diff-view-mode.ts
git commit -m "feat: add persisted diff view mode hook"
```

---

## Task 3: Ledger helper

Pure-function aggregator. Lives in `src/lib/ledger.ts` so both the Inspector and any future surfaces (e.g. command palette) can consume it.

**Files:**
- Create: `src/lib/ledger.ts`

- [ ] **Step 3.1: Create `src/lib/ledger.ts`**

```ts
import type {
  InlineComment,
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
} from "@/types/review";

export type LedgerEntry =
  | {
      kind: "private-file-note";
      id: string;
      fileId: string;
      filePath: string;
      body: string;
    }
  | {
      kind: "public-file-draft";
      id: string;
      fileId: string;
      filePath: string;
      body: string;
    }
  | {
      kind: "private-inline";
      id: string;
      fileId: string;
      filePath: string;
      diffPosition: number;
      side: InlineComment["side"];
      startLine?: number | null;
      endLine?: number | null;
      body: string;
      createdAt: string;
    }
  | {
      kind: "review-inline";
      id: string;
      fileId: string;
      filePath: string;
      diffPosition: number;
      side: InlineComment["side"];
      startLine?: number | null;
      endLine?: number | null;
      body: string;
      createdAt: string;
    };

export type LedgerFilter = "all" | "private" | "review";

export type LedgerGroup = {
  file: ReviewFile;
  entries: LedgerEntry[];
};

export function collectLedger(
  session: ReviewSession,
  workspaceState: ReviewWorkspaceState,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const file of session.files) {
    const state = workspaceState[file.id];
    if (!state) {
      continue;
    }

    const privateNote = state.privateNote?.trim() ?? "";
    if (privateNote) {
      entries.push({
        kind: "private-file-note",
        id: `${file.id}-private-note`,
        fileId: file.id,
        filePath: file.path,
        body: privateNote,
      });
    }

    const draft = state.publishableDraft?.trim() ?? "";
    if (draft) {
      entries.push({
        kind: "public-file-draft",
        id: `${file.id}-public-draft`,
        fileId: file.id,
        filePath: file.path,
        body: draft,
      });
    }

    for (const comment of state.inlineComments ?? []) {
      entries.push({
        kind: comment.visibility === "private" ? "private-inline" : "review-inline",
        id: comment.id,
        fileId: file.id,
        filePath: file.path,
        diffPosition: comment.endDiffPosition,
        side: comment.side,
        startLine: comment.startLine,
        endLine: comment.endLine,
        body: comment.body,
        createdAt: comment.createdAt,
      });
    }
  }

  return entries;
}

export function filterLedger(
  entries: LedgerEntry[],
  filter: LedgerFilter,
): LedgerEntry[] {
  if (filter === "all") {
    return entries;
  }
  if (filter === "private") {
    return entries.filter(
      (entry) => entry.kind === "private-file-note" || entry.kind === "private-inline",
    );
  }
  return entries.filter(
    (entry) => entry.kind === "public-file-draft" || entry.kind === "review-inline",
  );
}

export function groupLedgerByFile(
  session: ReviewSession,
  entries: LedgerEntry[],
): LedgerGroup[] {
  const groupsByFileId = new Map<string, LedgerGroup>();
  for (const file of session.files) {
    groupsByFileId.set(file.id, { file, entries: [] });
  }

  for (const entry of entries) {
    const bucket = groupsByFileId.get(entry.fileId);
    if (!bucket) {
      continue;
    }
    bucket.entries.push(entry);
  }

  // Sort entries within each file: file-level first, then inline by diff position
  for (const group of groupsByFileId.values()) {
    group.entries.sort((a, b) => {
      const orderA = entryOrder(a);
      const orderB = entryOrder(b);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      if (a.kind === "private-inline" || a.kind === "review-inline") {
        const posA = a.diffPosition;
        const posB =
          b.kind === "private-inline" || b.kind === "review-inline"
            ? b.diffPosition
            : 0;
        return posA - posB;
      }
      return 0;
    });
  }

  return Array.from(groupsByFileId.values()).filter((group) => group.entries.length > 0);
}

function entryOrder(entry: LedgerEntry): number {
  switch (entry.kind) {
    case "private-file-note":
      return 0;
    case "public-file-draft":
      return 1;
    case "private-inline":
    case "review-inline":
      return 2;
  }
}

export function countByKind(entries: LedgerEntry[]) {
  let priv = 0;
  let review = 0;
  for (const entry of entries) {
    if (entry.kind === "private-file-note" || entry.kind === "private-inline") {
      priv += 1;
    } else {
      review += 1;
    }
  }
  return { total: entries.length, private: priv, review };
}

export function lineRangeLabel(entry: LedgerEntry): string {
  if (entry.kind === "private-file-note") {
    return "File note";
  }
  if (entry.kind === "public-file-draft") {
    return "File draft";
  }
  const side = entry.side === "old" ? "old" : "new";
  if (!entry.startLine && !entry.endLine) {
    return `${side} line`;
  }
  if (entry.startLine === entry.endLine || !entry.endLine) {
    return `${side} line ${entry.startLine}`;
  }
  return `${side} lines ${entry.startLine}-${entry.endLine}`;
}
```

- [ ] **Step 3.2: Type-check + commit**

```bash
pnpm build
```
Expected: builds cleanly. Hook isn't consumed yet.

```bash
git add src/lib/ledger.ts
git commit -m "feat: add ledger aggregator for cross-file notes and comments"
```

---

## Task 4: Jump-target wiring in `App.tsx`

Plumbing first, before the components that consume it. Adds a `jumpTarget` state passed down to `DiffCanvas` (for scroll-to-line) and a `jumpToNote` callback passed to the Inspector. Also adds the inspector view mode (`"file" | "ledger"`).

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 4.1: Add the new state, callback, and prop pass-through**

In `src/App.tsx`, add this import alongside the existing `@/hooks` import:

```tsx
import { useDiffViewMode } from "@/hooks/use-diff-view-mode";
```

Add a new type at the top of the file (after the existing imports, before `function App()`):

```tsx
type JumpTarget = {
  fileId: string;
  diffPosition?: number;
  expandSection?: "private" | "draft";
  requestedAt: number;
};

type InspectorMode = "file" | "ledger";
```

Inside `App()`, immediately after the existing `const { fontZoom, resetFontZoom } = useFontZoom();` line, add:

```tsx
const [, , toggleDiffViewMode] = useDiffViewMode();
const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
const [inspectorMode, setInspectorMode] = useState<InspectorMode>("file");
```

Add a `jumpToNote` callback near the other callbacks (e.g. after `selectFile`):

```tsx
const jumpToNote = useCallback(
  (target: { fileId: string; diffPosition?: number; expandSection?: "private" | "draft" }) => {
    setInspectorMode("file");
    if (target.fileId !== activeFileId) {
      // The existing useEffect that depends on activeFileId will advance unseen → viewed.
      setActiveFileId(target.fileId);
    }
    setJumpTarget({ ...target, requestedAt: Date.now() });
  },
  [activeFileId],
);

const handleScrollHandled = useCallback(() => setJumpTarget(null), []);
```

Add the global `Cmd/Ctrl + \` keyboard listener inside a new `useEffect` (place it near the other effects):

```tsx
useEffect(() => {
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const isEditing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    if (!isEditing && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === "\\") {
      event.preventDefault();
      toggleDiffViewMode();
      return;
    }

    if (!isEditing && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "j") {
      event.preventDefault();
      setInspectorMode((current) => (current === "ledger" ? "file" : "ledger"));
    }
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [toggleDiffViewMode]);
```

Now update the `<CommandBar>` JSX block (around the original line ~455) to pass `workspaceState`:

```tsx
<CommandBar
  repoPath={repoPath}
  baseRef={baseRef}
  headRef={headRef}
  isLoading={isLoading}
  session={session}
  workspaceState={workspaceState}
  fontZoom={fontZoom}
  repoRefs={repoRefs}
  recentRepos={recentRepos}
  reviewHistory={reviewHistory}
  isRefsLoading={isRefsLoading}
  onResetFontZoom={resetFontZoom}
  onRepoPathChange={(value) => {
    setRepoPath(value);
    setRepoRefs(null);
  }}
  onBaseRefChange={setBaseRef}
  onHeadRefChange={setHeadRef}
  onPickRepo={pickRepo}
  onSelectRecentRepo={openRepoPath}
  onSelectReviewHistory={resumeReview}
  onRefreshRefs={refreshRefs}
  onImportAgentSession={importAgentSession}
  onCreateSession={createSession}
/>
```

Update the `<DiffCanvas>` block to pass the new props:

```tsx
<DiffCanvas
  file={activeFile}
  fileState={activeFileState}
  jumpTarget={jumpTarget}
  onScrollHandled={handleScrollHandled}
  onMarkViewed={markActiveViewed}
  onMarkReviewed={markActiveReviewed}
  onSaveInlineComment={saveInlineComment}
  onDeleteInlineComment={deleteInlineComment}
/>
```

Update the `<Inspector>` block to pass the new props:

```tsx
<Inspector
  session={session}
  file={activeFile}
  fileState={activeFileState}
  workspaceState={workspaceState}
  mode={inspectorMode}
  onModeChange={setInspectorMode}
  onJumpToNote={jumpToNote}
  onPatchFileState={patchFileState}
  onMarkViewed={markActiveViewed}
  onMarkReviewed={markActiveReviewed}
/>
```

- [ ] **Step 4.2: Type-check**

```bash
pnpm build
```
Expected: this WILL fail with TS errors — `DiffCanvas` doesn't yet accept `jumpTarget` / `onScrollHandled`, `Inspector` doesn't yet accept `mode` / `onModeChange` / `onJumpToNote`, `CommandBar` doesn't yet accept `workspaceState`. **Do not commit yet.** Subsequent tasks fix the props on each consumer. Move on to Task 5 to fix the CommandBar contract first.

---

## Task 5: CommandBar redesign + Session Progress Beacon (demotes stale)

Three zones: repo crumb (left), beacon (center), actions (right). The beacon **demotes** `changedSinceReviewed` / `changedSinceViewed` files back to the unseen tint and excludes them from the reviewed/viewed counts.

**Files:**
- Modify: `src/components/review/CommandBar.tsx`

- [ ] **Step 5.1: Replace `CommandBar.tsx`**

Replace the entire contents with:

```tsx
import {
  Bot,
  ChevronDown,
  FolderOpen,
  GitBranch,
  History,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { compactPath } from "@/lib/format";
import type {
  GitRef,
  GitRefKind,
  RecentRepo,
  RepoRefs,
  ReviewHistoryItem,
  ReviewSession,
  ReviewWorkspaceState,
  ViewedStatus,
} from "@/types/review";

type CommandBarProps = {
  repoPath: string;
  baseRef: string;
  headRef: string;
  repoRefs: RepoRefs | null;
  recentRepos: RecentRepo[];
  reviewHistory: ReviewHistoryItem[];
  isLoading: boolean;
  isRefsLoading: boolean;
  session: ReviewSession | null;
  workspaceState: ReviewWorkspaceState;
  fontZoom: number;
  onResetFontZoom: () => void;
  onRepoPathChange: (value: string) => void;
  onBaseRefChange: (value: string) => void;
  onHeadRefChange: (value: string) => void;
  onPickRepo: () => void;
  onSelectRecentRepo: (path: string) => void;
  onSelectReviewHistory: (item: ReviewHistoryItem) => void;
  onRefreshRefs: () => void;
  onImportAgentSession: () => void;
  onCreateSession: () => void;
};

export function CommandBar({
  repoPath,
  baseRef,
  headRef,
  repoRefs,
  recentRepos,
  reviewHistory,
  isLoading,
  isRefsLoading,
  session,
  workspaceState,
  fontZoom,
  onResetFontZoom,
  onRepoPathChange,
  onBaseRefChange,
  onHeadRefChange,
  onPickRepo,
  onSelectRecentRepo,
  onSelectReviewHistory,
  onRefreshRefs,
  onImportAgentSession,
  onCreateSession,
}: CommandBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className="rd-display text-base leading-none text-[var(--rd-vermillion)]">◆</span>
          <span className="text-[13px] font-semibold tracking-tight text-[var(--rd-cream)]">
            Review Desk
          </span>
        </div>

        <span className="h-4 w-px bg-[var(--rd-hair-2)]" aria-hidden />

        <div className="relative flex min-w-0 items-center">
          <FolderOpen className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--rd-pencil)]" />
          <Input
            value={repoPath}
            onChange={(event) => onRepoPathChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRefreshRefs();
              }
            }}
            placeholder="Choose a local repository"
            className="h-7 w-[280px] rounded-md border-[var(--rd-hair)] bg-[var(--rd-ink-2)] pl-7 font-mono text-[12px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              onClick={onPickRepo}
              aria-label="Open repository"
            >
              <FolderOpen className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open local repository</TooltipContent>
        </Tooltip>

        <RecentReposMenu repos={recentRepos} onSelectRepo={onSelectRecentRepo} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              disabled={!repoPath || isRefsLoading}
              onClick={onRefreshRefs}
              aria-label="Refresh refs"
            >
              <RefreshCw className={`size-3.5 ${isRefsLoading ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh Git refs</TooltipContent>
        </Tooltip>

        <div className="hidden items-center gap-1.5 xl:flex">
          <RefPicker
            label="base"
            value={baseRef}
            refs={repoRefs?.refs ?? []}
            disabled={!repoRefs || isRefsLoading}
            emptyLabel="Working tree"
            onChange={onBaseRefChange}
          />
          <RefPicker
            label="head"
            value={headRef}
            refs={repoRefs?.refs ?? []}
            disabled={!repoRefs || isRefsLoading}
            emptyLabel="Working tree"
            onChange={onHeadRefChange}
          />
        </div>
      </div>

      <div className="mx-2 flex min-w-0 flex-1 justify-center">
        <SessionProgressBeacon session={session} workspaceState={workspaceState} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-md bg-[var(--rd-cream)] px-3 text-[12px] font-medium text-[var(--rd-ink)] hover:bg-white"
          disabled={!repoPath || isLoading}
          onClick={onCreateSession}
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : session ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {session ? "Refresh" : "Create Session"}
        </Button>

        <ReviewHistoryMenu history={reviewHistory} onSelectReview={onSelectReviewHistory} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden h-7 rounded-md px-2 text-[12px] text-[var(--rd-cream-2)] hover:bg-[var(--rd-vermillion-bg)] hover:text-[var(--rd-vermillion-2)] lg:inline-flex"
              disabled={isLoading}
              onClick={onImportAgentSession}
            >
              <Bot className="size-3.5" />
              Agent
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import an agent review manifest</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md px-2 font-mono text-[11px] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              onClick={onResetFontZoom}
            >
              {Math.round(fontZoom * 100)}%
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cmd/Ctrl + plus, minus, or 0</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function effectiveStatus(status: ViewedStatus): ViewedStatus {
  // Beacon demote: any "stale" file falls back to unseen for visualisation + counts.
  if (status === "changedSinceReviewed" || status === "changedSinceViewed") {
    return "unseen";
  }
  return status;
}

function SessionProgressBeacon({
  session,
  workspaceState,
}: {
  session: ReviewSession | null;
  workspaceState: ReviewWorkspaceState;
}) {
  if (!session) {
    return (
      <div className="rd-display-italic text-[13px] text-[var(--rd-pencil)]">
        No active session
      </div>
    );
  }

  const total = session.files.length;
  let reviewed = 0;
  let viewed = 0;
  let stale = 0;
  for (const file of session.files) {
    const rawStatus = workspaceState[file.id]?.status ?? file.viewedStatus;
    if (rawStatus === "changedSinceReviewed" || rawStatus === "changedSinceViewed") {
      stale += 1;
      continue;
    }
    if (rawStatus === "reviewed") {
      reviewed += 1;
    } else if (rawStatus === "viewed") {
      viewed += 1;
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rd-display text-[14px] leading-none text-[var(--rd-cream-2)]">
        {reviewed} <span className="text-[var(--rd-pencil)]">/</span> {total}
      </span>
      <div
        className="flex h-1.5 w-[260px] gap-[2px] overflow-hidden"
        aria-label={`${reviewed} of ${total} files reviewed`}
      >
        {session.files.map((file, index) => {
          const status = effectiveStatus(
            workspaceState[file.id]?.status ?? file.viewedStatus,
          );
          const tint =
            status === "reviewed"
              ? "bg-[var(--rd-vermillion)]"
              : status === "viewed"
                ? "bg-[var(--rd-cream-2)]"
                : "bg-[var(--rd-ink-4)]";
          return <span key={`${file.id}-${index}`} className={`flex-1 ${tint}`} />;
        })}
      </div>
      <span className="font-mono text-[11px] text-[var(--rd-pencil)]">
        {viewed} viewed{stale > 0 ? ` · ${stale} stale` : ""}
      </span>
    </div>
  );
}

function RecentReposMenu({
  repos,
  onSelectRepo,
}: {
  repos: RecentRepo[];
  onSelectRepo: (path: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-md px-2 text-[11px] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
          disabled={repos.length === 0}
        >
          <History className="size-3.5" />
          Recent
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Recent repositories
        </DropdownMenuLabel>
        {repos.map((repo) => (
          <DropdownMenuItem
            key={repo.root}
            className="flex-col items-start gap-0.5 px-2 py-1.5"
            onSelect={() => onSelectRepo(repo.root)}
          >
            <span className="text-[12px] font-medium text-[var(--rd-cream)]">
              {repo.name}
            </span>
            <span className="max-w-full truncate font-mono text-[10px] text-[var(--rd-graphite)]">
              {compactPath(repo.root, 58)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RefPicker({
  label,
  value,
  refs,
  disabled,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string;
  refs: GitRef[];
  disabled: boolean;
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  const selected = refs.find((gitRef) => gitRef.name === value);
  const localRefs = refs.filter((gitRef) => gitRef.kind === "local");
  const remoteRefs = refs.filter((gitRef) => gitRef.kind === "remote");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-36 justify-between rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] px-2 text-[12px] text-[var(--rd-cream)] hover:bg-[var(--rd-ink-3)]"
          disabled={disabled}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <GitBranch className="size-3 shrink-0 text-[var(--rd-pencil)]" />
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--rd-pencil)]">
              {label}
            </span>
            <span className="truncate font-mono text-[11px]">
              {selected?.name ?? (value || emptyLabel)}
            </span>
          </span>
          <ChevronDown className="size-3 shrink-0 text-[var(--rd-pencil)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[460px] w-72 border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuItem onSelect={() => onChange("")}>
          <span className="text-[11px] text-[var(--rd-graphite)]">{emptyLabel}</span>
        </DropdownMenuItem>
        <RefGroup title="Local branches" refs={localRefs} value={value} onChange={onChange} />
        <RefGroup title="Remote branches" refs={remoteRefs} value={value} onChange={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RefGroup({
  title,
  refs,
  value,
  onChange,
}: {
  title: string;
  refs: GitRef[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
        {title}
      </DropdownMenuLabel>
      {refs.map((gitRef) => (
        <RefItem
          key={`${gitRef.kind}-${gitRef.name}`}
          gitRef={gitRef}
          selected={gitRef.name === value}
          onSelect={() => onChange(gitRef.name)}
        />
      ))}
    </>
  );
}

function RefItem({
  gitRef,
  selected,
  onSelect,
}: {
  gitRef: GitRef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-2 py-1.5"
      onSelect={onSelect}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-[11px] text-[var(--rd-cream)]">
          {gitRef.name}
        </span>
        <span className="block truncate text-[10px] text-[var(--rd-graphite)]">
          {refKindLabel(gitRef.kind)}
          {gitRef.isHead ? " · current" : ""}
          {gitRef.upstream ? ` · tracks ${gitRef.upstream}` : ""}
        </span>
      </span>
      <span className="font-mono text-[10px] text-[var(--rd-pencil)]">
        {selected ? "✓" : gitRef.shortSha}
      </span>
    </DropdownMenuItem>
  );
}

function ReviewHistoryMenu({
  history,
  onSelectReview,
}: {
  history: ReviewHistoryItem[];
  onSelectReview: (item: ReviewHistoryItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-7 rounded-md px-2 text-[11px] text-[var(--rd-graphite)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)] lg:inline-flex"
          disabled={history.length === 0}
        >
          <History className="size-3.5" />
          History
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[21.5rem] border border-[var(--rd-hair-2)] bg-[var(--rd-ink-2)] text-[var(--rd-cream)]"
      >
        <DropdownMenuLabel className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Review history
        </DropdownMenuLabel>
        {history.map((item) => (
          <DropdownMenuItem
            key={`${item.id}-${item.createdAt}`}
            className="flex-col items-start gap-1 px-2 py-1.5"
            onSelect={() => onSelectReview(item)}
          >
            <span className="text-[12px] font-medium text-[var(--rd-cream)]">
              {item.repoName}
            </span>
            <span className="font-mono text-[10px] text-[var(--rd-graphite)]">
              {item.orderSource === "agent" ? "agent" : "git"} · {reviewTargetLabel(item)} ·{" "}
              {item.totalFiles} files · +{item.additions} −{item.deletions}
            </span>
            <span className="text-[10px] text-[var(--rd-pencil)]">
              {formatReviewTime(item.createdAt)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function refKindLabel(kind: GitRefKind) {
  return kind === "local" ? "local" : "remote";
}

function reviewTargetLabel(item: ReviewHistoryItem) {
  if (item.baseRef && item.headRef) {
    return `${item.baseRef}...${item.headRef}`;
  }
  if (item.baseRef) {
    return `${item.baseRef} -> working tree`;
  }
  return "working tree";
}

function formatReviewTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
```

- [ ] **Step 5.2: Type-check**

```bash
pnpm build
```
Expected: still fails — DiffCanvas and Inspector contracts haven't caught up. Continue to Task 6.

---

## Task 6: ReviewRail redesign (no progress line, per-group numbering)

Drops the vertical progress line — the new beacon in the CommandBar already carries that information. Files are numbered **per group** in agent-ordered sessions, globally in git-ordered sessions.

**Files:**
- Modify: `src/components/review/ReviewRail.tsx`

- [ ] **Step 6.1: Replace `ReviewRail.tsx`**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { compactPath } from "@/lib/format";
import type {
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  ViewedStatus,
} from "@/types/review";

type ReviewRailProps = {
  session: ReviewSession;
  activeFileId: string | null;
  workspaceState: ReviewWorkspaceState;
  onSelectFile: (fileId: string) => void;
};

export function ReviewRail({
  session,
  activeFileId,
  workspaceState,
  onSelectFile,
}: ReviewRailProps) {
  const files = session.files;
  const isAgentOrder = session.order.source === "agent";

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <div className="border-b border-[var(--rd-hair)] px-5 py-4">
        <div className="rd-display-italic text-[13px] leading-none text-[var(--rd-cream-2)]">
          Queue
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]">
          {isAgentOrder ? agentOrderLabel(session) : "Git diff order"}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 py-3">
          {isAgentOrder && session.order.groups.length > 0
            ? session.order.groups.map((group) => {
                const groupFiles = files.filter((file) => file.orderGroup === group.title);
                return (
                  <div key={group.title} className="mb-3">
                    <div className="px-3 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)] first:pt-0">
                      {group.title} · {group.fileCount}
                    </div>
                    <div className="mt-1 border-t border-[var(--rd-hair)]" />
                    {groupFiles.map((file, idx) => (
                      <FileRow
                        key={file.id}
                        index={idx + 1}
                        file={file}
                        status={workspaceState[file.id]?.status ?? file.viewedStatus}
                        isActive={file.id === activeFileId}
                        showReason
                        onSelect={() => onSelectFile(file.id)}
                      />
                    ))}
                  </div>
                );
              })
            : files.map((file, idx) => (
                <FileRow
                  key={file.id}
                  index={idx + 1}
                  file={file}
                  status={workspaceState[file.id]?.status ?? file.viewedStatus}
                  isActive={file.id === activeFileId}
                  showReason={false}
                  onSelect={() => onSelectFile(file.id)}
                />
              ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function FileRow({
  index,
  file,
  status,
  isActive,
  showReason,
  onSelect,
}: {
  index: number;
  file: ReviewFile;
  status: ViewedStatus;
  isActive: boolean;
  showReason: boolean;
  onSelect: () => void;
}) {
  const isAgentFlagged = Boolean(file.reviewReason);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group block w-full rounded-md px-3 py-2 text-left",
        isActive ? "bg-[var(--rd-ink-3)]" : "hover:bg-[var(--rd-ink-2)]",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <span
          className={[
            "shrink-0 font-mono text-[10px] tabular-nums",
            isActive ? "text-[var(--rd-vermillion-2)]" : "text-[var(--rd-pencil)]",
          ].join(" ")}
        >
          {String(index).padStart(2, "0")}
        </span>
        <span
          className={[
            "min-w-0 flex-1 truncate text-[13px]",
            isAgentFlagged ? "rd-display-italic" : "font-medium",
            isActive ? "text-[var(--rd-cream)]" : "text-[var(--rd-cream-2)]",
          ].join(" ")}
          title={file.path}
        >
          {compactPath(file.path, 44)}
        </span>
        <StatusPip status={status} />
      </div>

      <div
        className={[
          "mt-1 flex items-center gap-2 pl-7 font-mono text-[10px]",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ].join(" ")}
        aria-hidden={!isActive}
      >
        <span className="uppercase tracking-wider text-[var(--rd-pencil)]">
          {file.changeKind}
        </span>
        <span className="text-[var(--rd-add)]">+{file.additions}</span>
        <span className="text-[var(--rd-del)]">−{file.deletions}</span>
      </div>

      {showReason && file.reviewReason ? (
        <div className="mt-1.5 pl-7 line-clamp-2 rd-display-italic text-[11px] leading-snug text-[var(--rd-graphite)]">
          {file.reviewReason}
        </div>
      ) : null}
    </button>
  );
}

function StatusPip({ status }: { status: ViewedStatus }) {
  const baseClasses = "block size-1.5 shrink-0 rounded-full";
  switch (status) {
    case "reviewed":
      return <span className={`${baseClasses} bg-[var(--rd-vermillion)]`} aria-label="reviewed" />;
    case "viewed":
      return <span className={`${baseClasses} bg-[var(--rd-cream-2)]`} aria-label="viewed" />;
    case "changedSinceReviewed":
    case "changedSinceViewed":
      return (
        <span
          className={`${baseClasses} border border-[var(--rd-del)] bg-transparent`}
          aria-label="changed"
        />
      );
    case "unseen":
    default:
      return (
        <span
          className={`${baseClasses} border border-[var(--rd-pencil)] bg-transparent`}
          aria-label="unseen"
        />
      );
  }
}

function agentOrderLabel(session: ReviewSession) {
  if (session.order.title) {
    return session.order.title;
  }
  if (session.order.createdBy) {
    return `Agent — ${session.order.createdBy}`;
  }
  return "Agent review";
}
```

- [ ] **Step 6.2: Type-check**

```bash
pnpm build
```
Expected: still fails (DiffCanvas + Inspector remain). Continue.

---

## Task 7: DiffCanvas — view toggle, row anchors, scroll-to-line

Fixes the sticky-header bug, removes the `aria-pressed` lie, removes the dead noop artifact, adds the view toggle, the unified renderer, the `data-anchor` attributes, and the `jumpTarget` / `onScrollHandled` props.

**Files:**
- Modify: `src/components/review/DiffCanvas.tsx`

- [ ] **Step 7.1: Replace `DiffCanvas.tsx`**

```tsx
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Columns2,
  Copy,
  Eye,
  FileDiff,
  MessageSquare,
  NotebookPen,
  Rows3,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDiffViewMode, type DiffViewMode } from "@/hooks/use-diff-view-mode";
import { compactPath } from "@/lib/format";
import { highlightCodeLine } from "@/lib/syntax-highlight";
import type {
  DiffLine,
  InlineComment,
  InlineCommentSide,
  InlineCommentVisibility,
  ReviewFile,
  SessionFileState,
} from "@/types/review";

type JumpTarget = {
  fileId: string;
  diffPosition?: number;
  expandSection?: "private" | "draft";
  requestedAt: number;
};

type DiffCanvasProps = {
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  jumpTarget: JumpTarget | null;
  onScrollHandled: () => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
  onSaveInlineComment: (fileId: string, comment: InlineComment) => void;
  onDeleteInlineComment: (fileId: string, commentId: string) => void;
};

type LineAnchor = {
  diffPosition: number;
  side: InlineCommentSide;
  lineNumber?: number | null;
};

type CommentTarget = {
  side: InlineCommentSide;
  startDiffPosition: number;
  endDiffPosition: number;
  startLine?: number | null;
  endLine?: number | null;
};

export function DiffCanvas({
  file,
  fileState,
  jumpTarget,
  onScrollHandled,
  onMarkViewed,
  onMarkReviewed,
  onSaveInlineComment,
  onDeleteInlineComment,
}: DiffCanvasProps) {
  const [viewMode, setViewMode] = useDiffViewMode();
  const [draftTarget, setDraftTarget] = useState<CommentTarget | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<InlineCommentVisibility>("review");
  const diffContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftTarget(null);
    setDraftBody("");
    setDraftVisibility("review");
  }, [file?.id]);

  // Scroll-to-line when jumpTarget arrives for the active file.
  useEffect(() => {
    if (!jumpTarget || !file || jumpTarget.fileId !== file.id) {
      return;
    }
    if (jumpTarget.diffPosition === undefined) {
      onScrollHandled();
      return;
    }
    const container = diffContainerRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector<HTMLElement>(
      `[data-anchor="${jumpTarget.diffPosition}"]`,
    );
    if (!target) {
      onScrollHandled();
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "auto" });
    target.classList.add("rd-jump-flash");
    const cleanup = window.setTimeout(() => {
      target.classList.remove("rd-jump-flash");
    }, 900);
    onScrollHandled();
    return () => window.clearTimeout(cleanup);
  }, [jumpTarget, file, onScrollHandled]);

  if (!file) {
    return (
      <section className="grid h-full place-items-center bg-[var(--rd-ink)]">
        <div className="text-center">
          <FileDiff className="mx-auto size-10 text-[var(--rd-pencil)]" />
          <div className="mt-4 rd-display-italic text-[16px] text-[var(--rd-cream-2)]">
            No file selected
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--rd-pencil)]">
            Pick a file from the review queue.
          </div>
        </div>
      </section>
    );
  }

  const status = fileState?.status ?? file.viewedStatus;
  const isReviewed = status === "reviewed";
  const isViewed = status === "viewed" || isReviewed;
  const isOneSided = file.changeKind === "added" || file.changeKind === "deleted";
  const effectiveMode: DiffViewMode = isOneSided ? "unified" : viewMode;
  const inlineComments = fileState?.inlineComments ?? [];
  const currentFile = file;

  function openInlineComposer(anchor: LineAnchor, extendSelection: boolean) {
    setDraftTarget((current) => {
      if (extendSelection && current?.side === anchor.side) {
        return extendTarget(current, anchor);
      }
      setDraftBody("");
      setDraftVisibility("review");
      return targetFromAnchor(anchor);
    });
  }

  function saveDraftComment() {
    const body = draftBody.trim();
    if (!draftTarget || !body) {
      return;
    }
    const now = new Date().toISOString();
    onSaveInlineComment(currentFile.id, {
      id: createCommentId(),
      fileId: currentFile.id,
      path: currentFile.path,
      side: draftTarget.side,
      startDiffPosition: draftTarget.startDiffPosition,
      endDiffPosition: draftTarget.endDiffPosition,
      startLine: draftTarget.startLine,
      endLine: draftTarget.endLine,
      body,
      visibility: draftVisibility,
      createdAt: now,
      updatedAt: now,
    });
    setDraftTarget(null);
    setDraftBody("");
    setDraftVisibility("review");
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] px-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-mono text-[12px] font-medium text-[var(--rd-cream)]">
              {compactPath(file.path, 92)}
            </h2>
            <span className="rd-display-italic text-[11px] text-[var(--rd-pencil)]">
              {file.changeKind}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] text-[var(--rd-pencil)]">
            <span className="text-[var(--rd-add)]">+{file.additions}</span>
            <span className="text-[var(--rd-del)]">−{file.deletions}</span>
            {file.oldPath ? <span>← {compactPath(file.oldPath, 56)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <ViewModeToggle
            mode={viewMode}
            disabled={isOneSided}
            onChange={setViewMode}
          />
          <span className="h-4 w-px bg-[var(--rd-hair-2)]" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 rounded-md px-2 text-[11px] text-[var(--rd-cream-2)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
            onClick={onMarkViewed}
          >
            <Eye className="size-3.5" />
            {isViewed ? "Viewed" : "Mark Viewed"}
          </Button>
          <Button
            type="button"
            size="xs"
            className={
              isReviewed
                ? "h-7 rounded-md bg-[var(--rd-vermillion)] px-2 text-[11px] text-[var(--rd-ink)] hover:bg-[var(--rd-vermillion-2)]"
                : "h-7 rounded-md bg-[var(--rd-cream)] px-2 text-[11px] text-[var(--rd-ink)] hover:bg-white"
            }
            onClick={onMarkReviewed}
          >
            <CheckCircle2 className="size-3.5" />
            {isReviewed ? "Reviewed" : "Mark Reviewed"}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-0 px-4 py-4" ref={diffContainerRef}>
          <div className="overflow-hidden rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)]">
            {file.hunks.map((hunk, hunkIndex) => (
              <div key={`${file.id}-${hunk.header}`}>
                <div className="flex items-center gap-3 border-y border-[var(--rd-hair)] bg-[var(--rd-ink)] px-4 py-1.5">
                  <span className="h-px flex-1 bg-[var(--rd-hair-2)]" aria-hidden />
                  <span className="font-mono text-[10px] text-[var(--rd-vermillion-2)]">
                    {hunk.header}
                  </span>
                  <span className="h-px flex-1 bg-[var(--rd-hair-2)]" aria-hidden />
                </div>
                {hunk.lines.map((line, lineIndex) => {
                  const anchor = getLineAnchor(line, file.changeKind, hunkIndex, lineIndex);
                  const lineComments = inlineComments.filter(
                    (comment) => comment.endDiffPosition === anchor.diffPosition,
                  );

                  return (
                    <Fragment
                      key={`${hunk.header}-${lineIndex}-${anchor.diffPosition}`}
                    >
                      {effectiveMode === "split" && !isOneSided ? (
                        <SplitRow
                          line={line}
                          anchor={anchor}
                          selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                          onAddComment={openInlineComposer}
                        />
                      ) : (
                        <UnifiedRow
                          line={line}
                          anchor={anchor}
                          changeKind={file.changeKind}
                          selected={isTargetSelected(draftTarget, anchor.diffPosition)}
                          onAddComment={openInlineComposer}
                        />
                      )}
                      {draftTarget?.endDiffPosition === anchor.diffPosition ? (
                        <InlineCommentComposer
                          target={draftTarget}
                          body={draftBody}
                          visibility={draftVisibility}
                          onBodyChange={setDraftBody}
                          onVisibilityChange={setDraftVisibility}
                          onSave={saveDraftComment}
                          onCancel={() => {
                            setDraftTarget(null);
                            setDraftBody("");
                          }}
                        />
                      ) : null}
                      {lineComments.map((comment) => (
                        <InlineCommentCard
                          key={comment.id}
                          comment={comment}
                          onDelete={() => onDeleteInlineComment(file.id, comment.id)}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}

function ViewModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: DiffViewMode;
  disabled: boolean;
  onChange: (mode: DiffViewMode) => void;
}) {
  const effective: DiffViewMode = disabled ? "unified" : mode;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex h-7 items-center rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-0.5"
          role="group"
          aria-label="Diff view mode"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("split")}
            className={[
              "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium",
              effective === "split"
                ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
                : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
            aria-pressed={effective === "split"}
            aria-label="Side-by-side diff"
          >
            <Columns2 className="size-3" />
            Split
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("unified")}
            className={[
              "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium",
              effective === "unified"
                ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
                : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
            aria-pressed={effective === "unified"}
            aria-label="Unified diff"
          >
            <Rows3 className="size-3" />
            Unified
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {disabled ? "Single-sided file" : "Toggle: Cmd/Ctrl + \\"}
      </TooltipContent>
    </Tooltip>
  );
}

function SplitRow({
  line,
  anchor,
  selected,
  onAddComment,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
}) {
  const isAddition = line.kind === "addition";
  const isDeletion = line.kind === "deletion";
  const marker = isAddition ? "+" : isDeletion ? "−" : " ";

  const oldAnchor: LineAnchor = { ...anchor, side: "old", lineNumber: line.oldLine };
  const newAnchor: LineAnchor = { ...anchor, side: "new", lineNumber: line.newLine };

  return (
    <div
      data-anchor={anchor.diffPosition}
      className={[
        "group grid min-h-6 grid-cols-[56px_minmax(0,1fr)_56px_minmax(0,1fr)] border-b border-[var(--rd-hair)] font-mono text-[12px] leading-6",
        isAddition ? "bg-[var(--rd-add-bg)]" : "",
        isDeletion ? "bg-[var(--rd-del-bg)]" : "",
        selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-vermillion-line)]" : "",
      ].join(" ")}
    >
      <LineNumber value={line.oldLine} hot={isDeletion} tone="del" />
      <CodeCell
        muted={isAddition}
        hot={isDeletion}
        marker={marker}
        onAddComment={isAddition ? undefined : (extend) => onAddComment(oldAnchor, extend)}
      >
        {isAddition ? "" : line.content}
      </CodeCell>
      <LineNumber value={line.newLine} hot={isAddition} tone="add" />
      <CodeCell
        muted={isDeletion}
        hot={isAddition}
        marker={marker}
        onAddComment={isDeletion ? undefined : (extend) => onAddComment(newAnchor, extend)}
      >
        {isDeletion ? "" : line.content}
      </CodeCell>
    </div>
  );
}

function UnifiedRow({
  line,
  anchor,
  changeKind,
  selected,
  onAddComment,
}: {
  line: DiffLine;
  anchor: LineAnchor;
  changeKind: ReviewFile["changeKind"];
  selected: boolean;
  onAddComment: (anchor: LineAnchor, extendSelection: boolean) => void;
}) {
  const isAddition = line.kind === "addition";
  const isDeletion = line.kind === "deletion";
  const marker = isAddition ? "+" : isDeletion ? "−" : " ";
  const lineSide: InlineCommentSide = isDeletion || changeKind === "deleted" ? "old" : "new";
  const lineAnchor: LineAnchor = {
    ...anchor,
    side: lineSide,
    lineNumber: lineSide === "old" ? line.oldLine : line.newLine,
  };

  return (
    <div
      data-anchor={anchor.diffPosition}
      className={[
        "group grid min-h-6 grid-cols-[48px_48px_minmax(0,1fr)] border-b border-[var(--rd-hair)] font-mono text-[12px] leading-6",
        isAddition ? "bg-[var(--rd-add-bg)]" : "",
        isDeletion ? "bg-[var(--rd-del-bg)]" : "",
        selected ? "outline outline-1 -outline-offset-1 outline-[var(--rd-vermillion-line)]" : "",
      ].join(" ")}
    >
      <LineNumber value={isAddition ? null : line.oldLine} hot={isDeletion} tone="del" />
      <LineNumber value={isDeletion ? null : line.newLine} hot={isAddition} tone="add" />
      <CodeCell
        muted={false}
        hot={isAddition || isDeletion}
        marker={marker}
        onAddComment={(extend) => onAddComment(lineAnchor, extend)}
      >
        {line.content}
      </CodeCell>
    </div>
  );
}

function InlineCommentComposer({
  target,
  body,
  visibility,
  onBodyChange,
  onVisibilityChange,
  onSave,
  onCancel,
}: {
  target: CommentTarget;
  body: string;
  visibility: InlineCommentVisibility;
  onBodyChange: (value: string) => void;
  onVisibilityChange: (value: InlineCommentVisibility) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-l-[3px] border-[var(--rd-vermillion-line)] bg-[var(--rd-ink-3)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="rd-display-italic text-[12px] text-[var(--rd-cream-2)]">
          Comment on {lineRangeLabel(target)}
        </div>
        <button
          type="button"
          className="grid size-6 place-items-center rounded text-[var(--rd-pencil)] hover:bg-[var(--rd-ink-2)] hover:text-[var(--rd-cream)]"
          onClick={onCancel}
          aria-label="Cancel comment"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <Textarea
        value={body}
        onChange={(event) => onBodyChange(event.currentTarget.value)}
        autoFocus
        placeholder="Write a comment for this line."
        className="min-h-24 resize-y border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-0.5">
          <CommentModeButton
            active={visibility === "private"}
            icon={<NotebookPen className="size-3.5" />}
            label="Private"
            onClick={() => onVisibilityChange("private")}
          />
          <CommentModeButton
            active={visibility === "review"}
            icon={<MessageSquare className="size-3.5" />}
            label="Review"
            onClick={() => onVisibilityChange("review")}
          />
        </div>
        <Button
          type="button"
          size="xs"
          className="h-7 rounded-md bg-[var(--rd-cream)] px-3 text-[11px] text-[var(--rd-ink)] hover:bg-white"
          disabled={!body.trim()}
          onClick={onSave}
        >
          Add comment
        </Button>
      </div>
    </div>
  );
}

function InlineCommentCard({
  comment,
  onDelete,
}: {
  comment: InlineComment;
  onDelete: () => void;
}) {
  const isPrivate = comment.visibility === "private";

  return (
    <div className="border-l-[3px] border-[var(--rd-vermillion-line)] bg-[var(--rd-ink-3)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
            {isPrivate ? (
              <NotebookPen className="size-3 text-[var(--rd-graphite)]" />
            ) : (
              <MessageSquare className="size-3 text-[var(--rd-vermillion-2)]" />
            )}
            {isPrivate ? "Private" : "Review"}
            <span className="normal-case tracking-normal text-[var(--rd-graphite)]">
              {lineRangeLabel(comment)}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-[var(--rd-cream-2)]">
            {comment.body}
          </p>
        </div>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded text-[var(--rd-pencil)] hover:bg-[var(--rd-ink-2)] hover:text-[var(--rd-del)]"
          onClick={onDelete}
          aria-label="Delete inline comment"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

function CommentModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "flex h-6 items-center gap-1 rounded px-2 text-[11px]",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function LineNumber({
  value,
  hot,
  tone,
}: {
  value?: number | null;
  hot: boolean;
  tone: "del" | "add";
}) {
  return (
    <div
      className={[
        "select-none border-r border-[var(--rd-hair)] px-2 text-right text-[10px] tabular-nums",
        hot && tone === "del" ? "text-[var(--rd-del)]" : "",
        hot && tone === "add" ? "text-[var(--rd-add)]" : "",
        !hot ? "text-[var(--rd-pencil)]" : "",
      ].join(" ")}
    >
      {value ?? ""}
    </div>
  );
}

function CodeCell({
  children,
  muted,
  hot,
  marker,
  onAddComment,
}: {
  children: string;
  muted: boolean;
  hot: boolean;
  marker: string;
  onAddComment?: (extendSelection: boolean) => void;
}) {
  const canComment = Boolean(children && onAddComment);

  return (
    <div
      className={[
        "relative grid min-w-0 grid-cols-[28px_minmax(0,1fr)]",
        muted ? "text-[var(--rd-pencil)]" : "text-[var(--rd-cream-2)]",
        hot ? "text-[var(--rd-cream)]" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className={[
          "group/marker relative flex min-h-6 w-7 shrink-0 select-none items-start justify-center border-r border-[var(--rd-hair)] text-[var(--rd-pencil)] focus-visible:bg-[var(--rd-ink-3)] focus-visible:text-[var(--rd-vermillion-2)] focus-visible:outline-none",
          canComment
            ? "cursor-pointer hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-vermillion-2)]"
            : "cursor-default",
        ].join(" ")}
        disabled={!canComment}
        onClick={(event) => onAddComment?.(event.shiftKey)}
        title={
          canComment
            ? "Add line comment. Shift-click another line to select a range."
            : undefined
        }
        aria-label="Add line comment"
      >
        <span
          className={[
            "leading-6",
            marker.trim()
              ? ""
              : "opacity-0 group-hover/marker:opacity-100 group-focus-visible/marker:opacity-100",
          ].join(" ")}
        >
          {children ? (marker.trim() ? marker : "+") : ""}
        </span>
      </button>
      <div className="min-w-0 whitespace-pre-wrap break-words px-3">
        {children ? highlightCodeLine(children) : null}
      </div>
      {hot ? (
        <Copy className="absolute right-2 top-1.5 size-3 text-[var(--rd-pencil)] opacity-0 group-hover:opacity-100" />
      ) : null}
    </div>
  );
}

function getLineAnchor(
  line: DiffLine,
  changeKind: ReviewFile["changeKind"],
  hunkIndex: number,
  lineIndex: number,
): LineAnchor {
  const side =
    line.kind === "deletion" || changeKind === "deleted" ? "old" : "new";
  const lineNumber = side === "old" ? line.oldLine : line.newLine;

  return {
    diffPosition: hunkIndex * 100000 + (line.diffPosition ?? lineIndex + 1),
    side,
    lineNumber,
  };
}

function targetFromAnchor(anchor: LineAnchor): CommentTarget {
  return {
    side: anchor.side,
    startDiffPosition: anchor.diffPosition,
    endDiffPosition: anchor.diffPosition,
    startLine: anchor.lineNumber,
    endLine: anchor.lineNumber,
  };
}

function extendTarget(current: CommentTarget, anchor: LineAnchor): CommentTarget {
  const anchorFirst = anchor.diffPosition < current.startDiffPosition;
  return {
    side: current.side,
    startDiffPosition: Math.min(current.startDiffPosition, anchor.diffPosition),
    endDiffPosition: Math.max(current.endDiffPosition, anchor.diffPosition),
    startLine: anchorFirst ? anchor.lineNumber : current.startLine,
    endLine: anchorFirst ? current.endLine : anchor.lineNumber,
  };
}

function isTargetSelected(target: CommentTarget | null, position: number) {
  if (!target) {
    return false;
  }
  return position >= target.startDiffPosition && position <= target.endDiffPosition;
}

function lineRangeLabel(
  target: Pick<CommentTarget, "side" | "startLine" | "endLine">,
) {
  const side = target.side === "old" ? "old" : "new";
  if (!target.startLine && !target.endLine) {
    return `${side} line`;
  }
  if (target.startLine === target.endLine || !target.endLine) {
    return `${side} line ${target.startLine}`;
  }
  return `${side} lines ${target.startLine}-${target.endLine}`;
}

function createCommentId() {
  return `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

- [ ] **Step 7.2: Type-check**

```bash
pnpm build
```
Expected: still fails — only Inspector left. Continue.

---

## Task 8: Inspector — accordion + basket + Ledger view

**Files:**
- Modify: `src/components/review/Inspector.tsx`

- [ ] **Step 8.1: Replace `Inspector.tsx`**

```tsx
import { useState, type ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Eye,
  MessageSquare,
  NotebookPen,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { compactPath } from "@/lib/format";
import {
  collectLedger,
  countByKind,
  filterLedger,
  groupLedgerByFile,
  lineRangeLabel as ledgerLineRangeLabel,
  type LedgerEntry,
  type LedgerFilter,
} from "@/lib/ledger";
import type {
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  SessionFileState,
} from "@/types/review";

type InspectorProps = {
  session: ReviewSession;
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  workspaceState: ReviewWorkspaceState;
  mode: "file" | "ledger";
  onModeChange: (mode: "file" | "ledger") => void;
  onJumpToNote: (target: {
    fileId: string;
    diffPosition?: number;
    expandSection?: "private" | "draft";
  }) => void;
  onPatchFileState: (fileId: string, patch: Partial<SessionFileState>) => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
};

type SectionKey = "private" | "draft" | "agent";

export function Inspector(props: InspectorProps) {
  const { session, mode, onModeChange, workspaceState } = props;
  const ledger = collectLedger(session, workspaceState);
  const basket = ledger.filter(
    (entry) => entry.kind === "public-file-draft" || entry.kind === "review-inline",
  );

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--rd-hair)] bg-[var(--rd-ink)]">
      <InspectorHeader mode={mode} onModeChange={onModeChange} />

      <ScrollArea className="min-h-0 flex-1">
        {mode === "file" ? (
          <FileMode {...props} />
        ) : (
          <LedgerMode session={session} ledger={ledger} onJumpToNote={props.onJumpToNote} />
        )}
      </ScrollArea>

      <BasketFooter basket={basket} />
    </aside>
  );
}

function InspectorHeader({
  mode,
  onModeChange,
}: {
  mode: "file" | "ledger";
  onModeChange: (mode: "file" | "ledger") => void;
}) {
  return (
    <div className="border-b border-[var(--rd-hair)] px-5 py-3">
      <div className="rd-display-italic text-[13px] leading-none text-[var(--rd-cream-2)]">
        Margin
      </div>
      <div className="mt-2 inline-flex rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-0.5">
        <button
          type="button"
          onClick={() => onModeChange("file")}
          aria-pressed={mode === "file"}
          className={[
            "h-6 rounded px-2 text-[11px]",
            mode === "file"
              ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
              : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
          ].join(" ")}
        >
          This file
        </button>
        <button
          type="button"
          onClick={() => onModeChange("ledger")}
          aria-pressed={mode === "ledger"}
          className={[
            "h-6 rounded px-2 text-[11px]",
            mode === "ledger"
              ? "bg-[var(--rd-ink-4)] text-[var(--rd-cream)]"
              : "text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
          ].join(" ")}
        >
          Ledger
        </button>
      </div>
    </div>
  );
}

function FileMode({
  session,
  file,
  fileState,
  onPatchFileState,
  onMarkViewed,
  onMarkReviewed,
}: InspectorProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    private: true,
    draft: false,
    agent: false,
  });

  function toggle(key: SectionKey) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="px-4 py-4">
      {file ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-md border border-[var(--rd-hair)] bg-transparent text-[12px] text-[var(--rd-cream-2)] hover:bg-[var(--rd-ink-3)] hover:text-[var(--rd-cream)]"
              onClick={onMarkViewed}
            >
              <Eye className="size-3.5" />
              Viewed
            </Button>
            <Button
              type="button"
              className="h-9 rounded-md bg-[var(--rd-cream)] text-[12px] text-[var(--rd-ink)] hover:bg-white"
              onClick={onMarkReviewed}
            >
              <CheckCircle2 className="size-3.5" />
              Reviewed
            </Button>
          </div>

          <div className="mt-5 space-y-1">
            <AccordionSection
              label="Private notes"
              open={openSections.private}
              onToggle={() => toggle("private")}
              icon={<NotebookPen className="size-3.5 text-[var(--rd-graphite)]" />}
            >
              <Textarea
                value={fileState?.privateNote ?? ""}
                onChange={(event) =>
                  onPatchFileState(file.id, { privateNote: event.currentTarget.value })
                }
                placeholder="Notes for me. These never publish."
                className="min-h-32 resize-none border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
              />
            </AccordionSection>

            <AccordionSection
              label="Public draft"
              open={openSections.draft}
              onToggle={() => toggle("draft")}
              icon={<MessageSquare className="size-3.5 text-[var(--rd-vermillion-2)]" />}
            >
              <Textarea
                value={fileState?.publishableDraft ?? ""}
                onChange={(event) =>
                  onPatchFileState(file.id, { publishableDraft: event.currentTarget.value })
                }
                placeholder="Draft a publishable review comment."
                className="min-h-32 resize-none border-[var(--rd-hair)] bg-[var(--rd-ink-2)] text-[13px] text-[var(--rd-cream)] placeholder:text-[var(--rd-pencil)]"
              />
            </AccordionSection>

            <AccordionSection
              label="Agent context"
              open={openSections.agent}
              onToggle={() => toggle("agent")}
              icon={<Bot className="size-3.5 text-[var(--rd-vermillion-2)]" />}
            >
              <AgentContext session={session} file={file} />
            </AccordionSection>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-4 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
          Select a file to inspect.
        </div>
      )}

      {session.order.warnings.length > 0 ? (
        <div className="mt-5 rounded-md border-l-[3px] border-[var(--rd-del)] bg-[var(--rd-del-bg)] px-3 py-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-del)]">
            Import warnings
          </div>
          <div className="mt-1.5 space-y-1">
            {session.order.warnings.slice(0, 5).map((warning, index) => (
              <div
                key={`${warning.path ?? "session"}-${index}`}
                className="text-[11px] leading-5 text-[var(--rd-cream-2)]"
              >
                {warning.path ? (
                  <span className="font-mono">{compactPath(warning.path, 42)}: </span>
                ) : null}
                {warning.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LedgerMode({
  session,
  ledger,
  onJumpToNote,
}: {
  session: ReviewSession;
  ledger: LedgerEntry[];
  onJumpToNote: InspectorProps["onJumpToNote"];
}) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const counts = countByKind(ledger);
  const filtered = filterLedger(ledger, filter);
  const groups = groupLedgerByFile(session, filtered);

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-1.5">
        <FilterChip label={`All ${counts.total}`} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip label={`Private ${counts.private}`} active={filter === "private"} onClick={() => setFilter("private")} />
        <FilterChip label={`Review ${counts.review}`} active={filter === "review"} onClick={() => setFilter("review")} />
      </div>

      <div className="mt-3 space-y-4">
        {groups.length === 0 ? (
          <div className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-4 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
            No notes yet. Comment on a line or draft a review to populate the ledger.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.file.id}>
              <div className="flex items-baseline justify-between border-b border-[var(--rd-hair)] pb-1">
                <span className="truncate font-mono text-[11px] text-[var(--rd-cream)]">
                  {compactPath(group.file.path, 38)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--rd-pencil)]">
                  {group.entries.length}
                </span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {group.entries.map((entry) => (
                  <LedgerCard
                    key={entry.id}
                    entry={entry}
                    onJump={() => onJumpToNote(jumpTargetForEntry(entry))}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function jumpTargetForEntry(entry: LedgerEntry) {
  if (entry.kind === "private-file-note") {
    return { fileId: entry.fileId, expandSection: "private" as const };
  }
  if (entry.kind === "public-file-draft") {
    return { fileId: entry.fileId, expandSection: "draft" as const };
  }
  return { fileId: entry.fileId, diffPosition: entry.diffPosition };
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "h-6 rounded-full px-2.5 text-[10px] font-mono uppercase tracking-wider",
        active
          ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
          : "border border-[var(--rd-hair)] text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function LedgerCard({ entry, onJump }: { entry: LedgerEntry; onJump: () => void }) {
  const isPrivate = entry.kind === "private-file-note" || entry.kind === "private-inline";
  const ruleClass = isPrivate
    ? "border-l-[2px] border-[var(--rd-hair-3)]"
    : "border-l-[2px] border-[var(--rd-vermillion-line)]";
  const Icon = isPrivate ? NotebookPen : MessageSquare;
  const iconClass = isPrivate
    ? "text-[var(--rd-graphite)]"
    : "text-[var(--rd-vermillion-2)]";

  return (
    <button
      type="button"
      onClick={onJump}
      className={[
        "block w-full rounded-sm bg-[var(--rd-ink-2)] px-2.5 py-2 text-left hover:bg-[var(--rd-ink-3)]",
        ruleClass,
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
        <Icon className={`size-3 ${iconClass}`} />
        {isPrivate ? "Private" : "Review"}
        <span className="normal-case tracking-normal text-[var(--rd-graphite)]">
          · {ledgerLineRangeLabel(entry)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--rd-cream-2)]">
        {entry.body}
      </p>
    </button>
  );
}

function AccordionSection({
  label,
  open,
  onToggle,
  icon,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[var(--rd-hair)] first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="rd-display-italic text-[13px] text-[var(--rd-cream)]">{label}</span>
        </span>
        <ChevronDown
          className={[
            "size-3.5 text-[var(--rd-pencil)] transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function AgentContext({ session, file }: { session: ReviewSession; file: ReviewFile }) {
  if (session.order.source !== "agent" && !file.reviewReason && file.agentNotes.length === 0) {
    return (
      <div className="text-[12px] leading-5 text-[var(--rd-graphite)]">
        Import an agent manifest to see review rationale here.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {file.reviewReason ? (
        <blockquote className="border-l-[3px] border-[var(--rd-vermillion-line)] pl-3 rd-display-italic text-[13px] leading-snug text-[var(--rd-cream-2)]">
          {file.reviewReason}
        </blockquote>
      ) : null}
      {file.agentNotes.length > 0 ? (
        <div className="space-y-1.5">
          {file.agentNotes.map((note, index) => (
            <div
              key={`${file.id}-agent-note-${index}`}
              className="rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-2)] p-2.5"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                {note.source ?? "agent note"}
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[var(--rd-cream-2)]">
                {note.body}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BasketFooter({ basket }: { basket: LedgerEntry[] }) {
  return (
    <div className="border-t border-[var(--rd-hair)] bg-[var(--rd-ink-2)]">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <div className="rd-display-italic text-[13px] text-[var(--rd-cream)]">Basket</div>
        <div className="font-mono text-[11px] tabular-nums text-[var(--rd-pencil)]">
          {basket.length} {basket.length === 1 ? "item" : "items"}
        </div>
      </div>

      <div className="max-h-44 overflow-y-auto px-3 pt-2">
        {basket.length > 0 ? (
          <div className="space-y-1">
            {basket.map((entry) => (
              <div
                key={entry.id}
                className="rounded-sm border-l-[2px] border-[var(--rd-vermillion-line)] bg-[var(--rd-ink-3)] px-2 py-1.5"
              >
                <div className="truncate font-mono text-[10px] text-[var(--rd-cream-2)]">
                  {compactPath(entry.filePath, 38)}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                  {ledgerLineRangeLabel(entry)}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--rd-graphite)]">
                  {entry.body}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rd-display-italic text-[12px] text-[var(--rd-pencil)]">
            Publishable comments collect here.
          </div>
        )}
      </div>

      <div className="p-3 pt-2">
        <Button
          type="button"
          className="w-full bg-[var(--rd-cream)] text-[var(--rd-ink)] hover:bg-white"
          disabled={basket.length === 0}
        >
          <Send className="size-4" />
          Publish Review
        </Button>
      </div>
    </div>
  );
}
```

(Unused historical helper `InlineComment` import and `lineRangeLabel` local function removed — both are now provided by `@/lib/ledger`.)

- [ ] **Step 8.2: Type-check + visual check**

```bash
pnpm build
```
Expected: **builds cleanly now.** All prop contracts line up across `App`, `CommandBar`, `DiffCanvas`, and `Inspector`.

```bash
pnpm dev
```
Open `http://localhost:1420`. Walk through:
1. EmptyState → Open repo → create session.
2. Beacon at top center shows `0 / N` and a faint bar.
3. Click a file → DiffCanvas renders, `Split` is highlighted in the toggle.
4. `Cmd+\` toggles to Unified — see two narrow line-number columns.
5. Add an inline comment with visibility `Review` → it shows under the diff line.
6. Add a private note via the Inspector "Private notes" accordion.
7. Click "Ledger" pill at top of Inspector → see the file grouped, with the private note + review comment.
8. Click the review comment in the ledger → Inspector switches back to "This file", DiffCanvas scrolls the row into view, brief vermillion outline pulse.
9. Click the private note in the ledger → switches to that file, Inspector opens "This file" view (Private accordion is expanded by default).
10. `Cmd+J` toggles Ledger.

- [ ] **Step 8.3: Commit (single landing commit for the redesign)**

```bash
git add src/App.tsx src/components/review/CommandBar.tsx src/components/review/DiffCanvas.tsx src/components/review/Inspector.tsx src/components/review/ReviewRail.tsx
git commit -m "redesign: Atelier UI + ledger view + diff toggle (CommandBar, Rail, DiffCanvas, Inspector)"
```

(Single commit because Tasks 4–8 form a single passing checkpoint — splitting them would leave intermediate commits broken.)

---

## Task 9: EmptyState redesign

**Files:**
- Modify: `src/components/review/EmptyState.tsx`

- [ ] **Step 9.1: Replace `EmptyState.tsx`**

```tsx
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  onPickRepo: () => void;
};

export function EmptyState({ onPickRepo }: EmptyStateProps) {
  return (
    <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[var(--rd-ink)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(255, 79, 63, 0.08), transparent 36%), radial-gradient(circle at 82% 78%, rgba(236, 230, 216, 0.04), transparent 32%)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-12 top-14 h-px bg-gradient-to-r from-transparent via-[var(--rd-hair-2)] to-transparent" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-start px-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--rd-pencil)]">
          Review Desk · No. 01
        </div>

        <h1 className="mt-8 rd-display text-balance text-[clamp(3.5rem,7vw,7.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-[var(--rd-cream)]">
          <span className="text-[var(--rd-vermillion)]">Turn</span> a messy patch
          <br />
          into a calm review pass.
        </h1>

        <p className="mt-8 max-w-xl text-[15px] leading-7 text-[var(--rd-cream-2)]">
          Open a repository, hide generated noise, walk a focused queue, and keep
          private notes separate from publishable comments.
        </p>

        <div className="mt-9 flex items-center gap-4">
          <Button
            type="button"
            className="h-10 rounded-md bg-[var(--rd-cream)] px-5 text-[13px] text-[var(--rd-ink)] hover:bg-white"
            onClick={onPickRepo}
          >
            <FolderOpen className="size-4" />
            Open repository
          </Button>
          <span className="rd-display-italic text-[13px] text-[var(--rd-graphite)]">
            or drop an agent manifest from the bar above.
          </span>
        </div>

        <div className="mt-16 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--rd-pencil)]">
          <span className="h-px w-10 bg-[var(--rd-hair-2)]" aria-hidden />
          <span>Local · Tauri · Git</span>
          <span className="h-px w-10 bg-[var(--rd-hair-2)]" aria-hidden />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Type-check + commit**

```bash
pnpm build
```
Expected: clean.

```bash
git add src/components/review/EmptyState.tsx
git commit -m "redesign(EmptyState): editorial cover page"
```

---

## Task 10: Doc update — agent-review-session.md

The redesign replaces the Inspector tabs with accordion sections. The agent doc still says "Agent tab". Fix the line.

**Files:**
- Modify: `docs/agent-review-session.md`

- [ ] **Step 10.1: Replace the stale sentence**

In `docs/agent-review-session.md`, find line 109:

```markdown
- `agentNotes` appear in the Inspector's `Agent` tab for that file.
```

Replace with:

```markdown
- `agentNotes` appear in the Inspector's `Agent context` section for that file.
```

- [ ] **Step 10.2: Commit**

```bash
git add docs/agent-review-session.md
git commit -m "docs: align agent-review-session doc with redesigned Inspector"
```

---

## Task 11: Final polish + full verification

**Files:**
- None (verification only)

- [ ] **Step 11.1: Full production build**

```bash
pnpm build
```
Expected: clean build, no warnings. If TypeScript flags any (e.g. unused imports remnants), remove them in the offending file.

- [ ] **Step 11.2: Smoke test in the Tauri shell**

```bash
pnpm desktop
```
Walk through:
1. Empty state renders (serif headline with vermillion `Turn`).
2. Open a repo → CommandBar shows repo path. Beacon: "No active session" italic.
3. Create session → file rail populates with numbered files (numbered per group when agent-ordered).
4. Beacon: shows `0 / N`, faint ink-4 segments.
5. Pick a file → DiffCanvas renders, `Split` is the default toggle.
6. `Cmd+\` toggles Unified.
7. On a wholly-added/deleted file the toggle is disabled and view is unified.
8. Mark Viewed → status pip turns cream, beacon segment turns cream, viewed counter on the right of beacon ticks up.
9. Mark Reviewed → pip turns vermillion, beacon segment turns vermillion, `reviewed / total` count ticks up.
10. Open Inspector "This file" → write a private note + a public draft → basket footer count increments.
11. Add an inline `Review` comment in the diff → basket also gets it.
12. Click Inspector "Ledger" → see all entries grouped by file.
13. Filter by "Private" / "Review" — works.
14. Click a review comment in ledger → mode flips to "This file", DiffCanvas scrolls to row, brief vermillion outline pulse.
15. Click a private file note in ledger → switches file + Inspector goes to "This file" view.
16. `Cmd+J` toggles ledger.
17. Reload the app — diff view mode persists.

Close the window.

- [ ] **Step 11.3: Rust tests still pass**

```bash
pnpm test:rust
```
Expected: existing tests pass (this redesign does not touch Rust).

- [ ] **Step 11.4: Final commit (only if Task 11 surfaced cleanups)**

If `pnpm build` flagged unused imports / warnings that you removed:

```bash
git add -A
git commit -m "redesign: cleanup pass"
```

Otherwise skip.

---

## Out of scope (deferred)

- **`⌘K` command palette** — would replace the Recent/History/Refs dropdowns. Deferred until we see whether the existing dropdowns remain painful after the visual fix.
- **Light mode** — Atelier is dark-first by design.
- **Paper-grain noise overlay** — dropped after the "no sluggish feel" feedback.
- **Smooth scroll on jump-to-line** — explicitly `behavior: "auto"` (instant) to avoid feeling sluggish. Re-introduce only if the instant jump feels jarring.

## Notes for the executor

- Run `pnpm dev` (Vite at `http://localhost:1420`) rather than `pnpm desktop` while iterating. Reserve `pnpm desktop` for the final shell smoke test.
- The repo has no Vitest/Jest setup for the React side. Verification is `pnpm build` + visual check by design.
- Tasks 4–8 form a single passing checkpoint — interim builds fail until all four land. That's intentional to keep the prop contracts type-checked together.
- The `rd:diff-view-mode-change` custom event keeps multiple `useDiffViewMode()` consumers in sync within the same window (native `storage` event only fires for *other* tabs).
- Jump-to-line uses `block: "center"` so the target lands mid-viewport, not at the top edge — easier on the eyes when scanning back to context.
