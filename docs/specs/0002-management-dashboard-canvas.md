# 0002 — Management Dashboard: Canvas LLM-Lock, Hover Delete & Per-LLM Saving

**Status:** 🟡 In progress
**Created:** 2026-06-02

## Goal

Turn the existing Workflow Canvas into a **management dashboard** for building a single-LLM
workflow. The canvas locks to one LLM (Claude **or** Copilot) based on what's placed on it, lets
the user remove nodes and connections directly by hovering, and saves each workflow under a folder
named for its LLM.

## Background

The canvas already exists ([CanvasApp.tsx](../../webview-ui/src/canvas/CanvasApp.tsx)). Today:
- Assets are added as nodes by double-clicking in the sidebar (host mediates: sidebar → host →
  `addNode`). **(AC item 1 — already done.)**
- Deleting works only via selection + the toolbar "Delete" button or the Delete/Backspace key.
- Saving writes to a single flat folder `.agentic/<name>.canvas.json`, regardless of ecosystem.
- `WorkflowNode` does **not** persist the asset's ecosystem.

## Scope

### In
1. **LLM lock (Claude vs Copilot).** Adding a Claude asset disables Copilot assets and vice
   versa. The lock is **implicit**: the first non-generic asset added sets the LLM; clearing the
   canvas (New, or deleting all such nodes) unlocks both again. **Generic assets are always
   allowed and never lock** the canvas.
2. **Sidebar feedback.** While locked, the inactive LLM's assets are **dimmed and non-interactive**
   (add does nothing, with an explanatory tooltip), and a **banner** at the top of the sidebar
   reads `Locked to <LLM> · clear the canvas to switch`.
3. **Hover-to-delete a node.** Hovering a canvas node reveals a small **×** button that removes the
   node and every edge touching it. (AC item 2.)
4. **Hover-to-remove a connection.** Hovering a connection line reveals an **×** badge at its
   midpoint that removes just that edge. (AC item 3.)
5. **Per-LLM saving.** Workflows save under `.agentic/<llm>/<name>.canvas.json` where `<llm>` is
   `claude`, `copilot`, or `generic` (generic = no Claude/Copilot nodes). Open lists workflows
   from all three subfolders. (AC item 4.)

### Out (see [backlog.md](backlog.md))
- Undo/redo, multi-select, copy/paste.
- Mixing Claude + Copilot in one workflow (explicitly disallowed by the lock).
- Cursor / other ecosystems.
- Migrating the old flat `.agentic/*.canvas.json` files (greenfield; none in the wild yet).

## Lock model

`lockOf(nodes)` (pure):
- returns `'claude'` if **any** node's ecosystem is `claude`;
- else `'copilot'` if any node's ecosystem is `copilot`;
- else `null` (canvas empty, or only generic nodes).

Claude and Copilot are mutually exclusive by construction (an add of the other is blocked), so the
order above is unambiguous. The **save folder** uses the same rule but maps `null` → `generic`.

Disabled test for a sidebar item:
`disabled = lock !== null && asset.ecosystem !== 'generic' && asset.ecosystem !== lock`.

## Data flow (canvas owns the lock; host relays)

```
sidebar (double-click)  --addToCanvas-->  host  --(gate: ecosystem vs lock)-->  canvas (addNode)
canvas (nodes change)   --lockChanged-->  host  --setLock-->  sidebar (grey + banner)
host (open/new)         --(sets lock from file.nodes / null)--> sidebar (setLock) + canvas (load/new)
host (save)             --(folder = folderForFile(file.nodes))--> .agentic/<llm>/<name>.canvas.json
```

- The **canvas** is the single source of truth for the lock: it derives `lockOf(nodes)` after
  every add/delete/load/new and posts `lockChanged: { llm }` when it changes.
- The **host** (`CanvasPanel`) caches the latest lock, forwards it to the sidebar provider, and
  uses it to **reject** a mismatched `addToCanvas` (Claude vs Copilot). Generic is always allowed.
- On **open**, the host sets the lock from the loaded `file.nodes`; on **new**, it sets `null`.

## Changes by file

### Data model
- [src/canvas/workflowFile.ts](../../src/canvas/workflowFile.ts): add `ecosystem: Ecosystem` to
  `WorkflowNode`. Bump `WORKFLOW_VERSION` 1 → 2. `validate()` accepts versions **1 and 2** and
  **backfills** `ecosystem: 'generic'` for any node missing it (tolerant of older/hand-edited
  files). Add a pure `folderForFile(file): 'claude' | 'copilot' | 'generic'`.

### Shared message contracts
- [src/shared/canvasMessages.ts](../../src/shared/canvasMessages.ts): add
  `CanvasToHost` variant `{ type: 'lockChanged'; llm: Lock }` where `type Lock = 'claude' |
  'copilot' | null`.
- [src/shared/messages.ts](../../src/shared/messages.ts): add `HostToWebview` variant
  `{ type: 'setLock'; llm: Lock }`.

### Host
- [src/canvas/workflowIO.ts](../../src/canvas/workflowIO.ts): per-LLM subfolders. `ensureAgenticDir`
  takes a sub (`claude|copilot|generic`); `promptSaveAs(folder, file, suggestedName)` derives the
  sub via `folderForFile`; `listWorkflows` scans all three subfolders (and is resilient to missing
  ones); `promptOpen` shows them with a `.agentic/<sub>/…` description.
- [src/webview/CanvasPanel.ts](../../src/webview/CanvasPanel.ts): accept an `onLockChanged(llm)`
  callback; cache the lock; gate `addToCanvas`/`addAsset` by ecosystem vs lock; relay
  `lockChanged` → `onLockChanged`; set the lock on open (from `file.nodes`) and new (`null`);
  derive the save subfolder from the file.
- [src/webview/AssetsViewProvider.ts](../../src/webview/AssetsViewProvider.ts): store the latest
  lock, post `setLock` to the sidebar webview (re-send on `ready`), and add a public `setLock(llm)`.
  Block a mismatched `addToCanvas` (show a warning), so the gate is enforced host-side too.
- [src/extension.ts](../../src/extension.ts): wire `CanvasPanel.createOrShow(..., (llm) =>
  provider.setLock(llm))`.

### Canvas webview (Agent A)
- [webview-ui/src/canvas/CanvasApp.tsx](../../webview-ui/src/canvas/CanvasApp.tsx): keep
  `ecosystem` on `CanvasNode` (from the `addNode` asset / loaded node); derive `lockOf(nodes)` and
  post `lockChanged` when it changes; add a hover **×** button on each node (`deleteNode(id)`,
  removes node + touching edges, `stopPropagation` so it doesn't drag); add a hover **×** badge at
  each edge midpoint (`deleteEdge(id)`). Persist `ecosystem` in `currentFile()`.
- [webview-ui/src/canvas/styles.css](../../webview-ui/src/canvas/styles.css): styles for the node
  delete button and edge delete badge (hidden by default, shown on hover / when selected).

### Sidebar webview (Agent B)
- [webview-ui/src/App.tsx](../../webview-ui/src/App.tsx): hold `lock` state from `setLock`; render
  the lock banner; pass `lock` to items.
- [webview-ui/src/components/AssetItem.tsx](../../webview-ui/src/components/AssetItem.tsx): compute
  `disabled` from the lock; dim + block add (double-click and context-menu "Add to canvas") with an
  explanatory tooltip; "Open file" stays enabled.
- [webview-ui/src/styles.css](../../webview-ui/src/styles.css): banner + disabled-item styles.

## Acceptance check (maps to AC-1)

1. Build + typecheck + tests pass (`npm run build`, both `tsc` projects, `npm test`).
2. **Add (item 1):** double-click an asset → node appears (unchanged).
3. **Hover-delete node (item 2):** hovering a node shows ×; clicking it removes the node and its
   connections.
4. **Hover-remove edge (item 3):** hovering a connection shows ×; clicking it removes only that
   connection.
5. **LLM lock:** adding a Claude asset dims/blocks Copilot assets in the sidebar and shows the
   banner; Generic stays enabled; clearing the canvas re-enables both.
6. **Per-LLM save (item 4):** a Claude workflow saves to `.agentic/claude/<name>.canvas.json`, a
   Copilot one to `.agentic/copilot/…`, a generic-only one to `.agentic/generic/…`; Open lists all.

## Verification log (2026-06-02)

- 🟢 `npm run build` — emits `dist/extension.js`, `dist/canvas.js`+`.css`, `dist/webview.js`+`.css`.
- 🟢 `tsc -p tsconfig.json` (host) and `tsc -p tsconfig.webview.json` (webview) — no type errors.
- 🟢 `npm test` — 29/29 pass (13 classifier + 16 workflow, incl. v1→v2 migration, ecosystem
  backfill, `lockOf`, `folderForFile`).
- 🟢 Independent QA audit (subagent) confirmed AC2–AC5 implemented; verified the lock message flow
  (canvas → host → sidebar) cannot permanently diverge, the first add is not wrongly blocked, the
  edge `×` sits at the exact bezier midpoint and is clickable, and the node `×` does not start a
  drag.
- ⚪ **Interactive (F5):** open the Extension Development Host, exercise hover-delete, the LLM lock
  banner/greying, and per-LLM save folders. *(Pending the user's manual run — not exercisable
  headlessly.)*

## Design notes

- The single-LLM add-gate lives **only** in `AssetsViewProvider.handleAddToCanvas` (the one path
  every add flows through: sidebar → provider → `onAddToCanvas` → `CanvasPanel.addAsset`). This is
  intentional — one chokepoint rather than duplicated logic in `CanvasPanel`.

## Notes

- The existing selection + Delete/Backspace + toolbar "Delete" stay (the hover buttons are
  additive).
- No confirmation dialog on delete (matches current behavior; re-adding is cheap).
- `validate()` stays fault-tolerant: unknown/missing `ecosystem` → `generic`, never throws on it.
