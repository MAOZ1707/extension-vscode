# 0001 — AC1: Asset Scanning & Sidebar View

**Status:** 🟡 In progress
**Created:** 2026-06-01

## Goal

When the user clicks the extension icon in the activity bar, scan the open workspace for agentic
assets (agents, skills, instructions, prompts) and display them as a grouped list in a sidebar.

## Scope

### In
- Activity-bar container + icon → **Agentic Assets** sidebar webview.
- Scan all open workspace folders for `.md` files (excluding `node_modules`, `.git`, `dist`, `out`, `build`, `.next`, `.vscode-test`).
- Classify each file into a type + ecosystem.
- Render a grouped, collapsible list (Agents / Skills / Instructions / Prompts) with an ecosystem badge and description per item.
- Manual **Refresh** (view title button + webview button).

### Out (see [backlog.md](backlog.md))
- Click-to-open / preview, create / improve / analyze, LLM connection, Cursor ecosystem, auto file-watching.

## Detection rules

Classification is **path conventions first, frontmatter to refine**.

| Ecosystem | Type        | Rule                                                                 |
| --------- | ----------- | -------------------------------------------------------------------- |
| Claude    | skill       | under `.claude/skills/`                                              |
| Claude    | agent       | under `.claude/agents/`                                              |
| Claude    | prompt      | under `.claude/commands/`                                            |
| Claude    | instruction | basename `CLAUDE.md` (any directory)                                 |
| Copilot   | instruction | `.github/copilot-instructions.md`, or `.github/instructions/*.instructions.md` |
| Copilot   | prompt      | `.github/prompts/*.prompt.md`                                        |
| Generic   | (by type)   | parent folder `skills/agents/instructions/prompts`, or filename suffix `*.skill.md`/`*.agent.md`/`*.prompt.md`/`*.instructions.md` |

**Frontmatter refinement:**
- An explicit `type` (or `kind`) field overrides the inferred type (keeps the discovered ecosystem).
- A file matching no convention is still included if it declares a `type`, or if it has **both** `name` and `description` (Claude skill/agent convention → defaults to skill).
- Display name = frontmatter `name`/`title`, else derived from the path (generic basenames like `SKILL`/`CLAUDE`/`README` fall back to the parent folder name).
- Description = frontmatter `description`/`summary`.
- Files with no convention match and no classifying frontmatter are **excluded** to limit noise.

## Data model

```ts
interface AgenticAsset {
  id: string;            // workspace-relative path
  name: string;
  type: 'agent' | 'skill' | 'instruction' | 'prompt';
  ecosystem: 'claude' | 'copilot' | 'generic';
  relativePath: string;
  absolutePath: string;
  description?: string;
}
```

## Architecture

- **Host** (`src/`): `scanner/` (pure-ish classifier + VSCode-backed scanner), `webview/AssetsViewProvider.ts` (HTML shell with nonce CSP, messaging), `extension.ts` (registration). `shared/messages.ts` is the typed host↔webview contract.
- **Webview** (`webview-ui/`): React app, receives `setAssets`, renders grouped list. Imports the pure `types.ts`/`messages.ts` from `src/` (no `vscode` dependency).
- **Build**: esbuild → `dist/extension.js` (node/cjs) + `dist/webview.js` + `dist/webview.css` (browser/iife).

## Acceptance check

1. `npm install && npm run build` succeed.
2. F5 → Extension Development Host opens `test-fixture/`.
3. Activity-bar icon shows the sidebar; all fixture assets appear under the correct groups with correct ecosystem badges and frontmatter descriptions; `node_modules`/`.git` ignored.
4. Refresh re-scans; empty folder shows the empty state.
5. `npm test` (classifier unit tests) passes.

## Verification log (2026-06-01)

- 🟢 `npm install` — 205 packages, ok.
- 🟢 `npm run build` — emits `dist/extension.js`, `dist/webview.js`, `dist/webview.css`.
- 🟢 `npm test` — 13/13 classifier cases pass (all ecosystems, frontmatter override, rescue, exclusion, malformed-YAML).
- 🟢 `tsc -p tsconfig.json` and `tsc -p tsconfig.webview.json` — no type errors (host + webview).
- ⚪ **Interactive (F5):** open `test-fixture/` in the Extension Development Host, click the activity-bar icon, confirm the grouped sidebar list and badges. *(Pending the user's manual run — can't be exercised headlessly.)*

## Fix log

- **2026-06-01 — "scan finds nothing":** the scanner originally used `vscode.workspace.findFiles('**/*.md', …)`, which does not reliably traverse hidden/dot folders (`.claude`, `.github`) where most assets live. Replaced with an explicit recursive walk via `vscode.workspace.fs.readDirectory` ([scanner.ts](../../src/scanner/scanner.ts)) that descends into dot-folders and skips a fixed exclude set. Verified by a node simulation of the walk over `test-fixture/` → 8/8 assets found (including all `.claude/*` and `.github/*`). Added an **Agentic Assets** output channel ([log.ts](../../src/log.ts)) + `agenticAssets.showLogs` command for diagnostics, and surfaced scan errors in the webview.

## Notes

- CSP is nonce-based; the React bundle and stylesheet are loaded via `webview.asWebviewUri`.
- Frontmatter parsing is fault-tolerant — malformed YAML never crashes the scan.
- Scanning uses a manual recursive walk (not `findFiles`) so hidden/dot folders are always traversed.
