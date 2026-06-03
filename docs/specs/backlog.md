# Backlog & Roadmap

Deferred work for the **Agentic Assets Manager**, captured so the broader product vision stays
tracked. Promote an item to a numbered spec in this folder when it's picked up.

## Product vision

A VSCode extension to **manage agentic assets** (skills, instructions, prompts, agents) and to
**build, create, improve, and analyze** them, with UI inside VSCode, optionally driven by the
user's Copilot or Claude LLM.

## Planned features

### Asset interaction
- ⚪ **Open on click** — open an asset's file in the editor from the sidebar.
- ⚪ **Detail / preview panel** — show frontmatter and rendered markdown for a selected asset.
- ⚪ **Auto-refresh** — `FileSystemWatcher` re-scans on create/change/delete instead of manual refresh.

### Authoring
- ⚪ **Create** — scaffold a new skill / agent / instruction / prompt from templates per ecosystem.
- ⚪ **Improve** — LLM-assisted rewrite/refinement of an existing asset.
- ⚪ **Analyze** — lint/score assets (missing description, naming, structure) and surface findings.

### LLM connection
- ⚪ **Copilot integration** — use the VSCode Language Model API (`vscode.lm`) to drive create/improve/analyze.
- ⚪ **Claude integration** — connect to Claude (API key or Claude Code) as an alternative LLM backend.

### Ecosystem coverage
- ⚪ **Cursor** — detect `.cursor/rules/` and `.cursorrules`.
- ⚪ **Additional conventions** — chat modes (`*.chatmode.md`), MCP server configs, etc.

### Quality
- ⚪ **Extension integration tests** — `@vscode/test-electron` end-to-end run.
- ⚪ **Expanded classifier tests** — more edge cases and ecosystems.

## Done

- 🟢 (none yet — see [0001](0001-ac1-asset-scanning.md) once verified)
