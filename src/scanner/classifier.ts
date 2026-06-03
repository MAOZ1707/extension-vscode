import { AssetType, Classification, Ecosystem } from './types';
import { parseFrontmatter, readString } from './frontmatter';

export interface ClassifyResult {
  classification: Classification;
  name: string;
  description?: string;
}

const ASSET_TYPES: AssetType[] = ['agent', 'skill', 'instruction', 'prompt'];

/** Map a (possibly plural) frontmatter type value to a canonical AssetType. */
function normalizeType(value: string | undefined): AssetType | undefined {
  if (!value) {
    return undefined;
  }
  const v = value.trim().toLowerCase().replace(/s$/, '');
  switch (v) {
    case 'agent':
      return 'agent';
    case 'skill':
      return 'skill';
    case 'instruction':
      return 'instruction';
    case 'prompt':
      return 'prompt';
    default:
      return undefined;
  }
}

/** Map a folder name (singular or plural) to the AssetType it conventionally holds. */
function typeFromFolderName(folder: string): AssetType | undefined {
  return normalizeType(folder);
}

/** Generic display names that aren't meaningful — fall back to the parent folder. */
const GENERIC_BASENAMES = new Set([
  'skill',
  'agent',
  'prompt',
  'instruction',
  'instructions',
  'readme',
  'index',
  'claude',
  'copilot-instructions',
]);

const CONVENTION_DIRS = new Set([
  'skills',
  'skill',
  'agents',
  'agent',
  'instructions',
  'instruction',
  'prompts',
  'prompt',
]);

/** Strip the `.md` extension and any classifying suffix (e.g. `foo.prompt.md` -> `foo`). */
function stripExtensions(basename: string): string {
  let name = basename.replace(/\.md$/i, '');
  name = name.replace(/\.(prompt|agent|skill|instructions?|chatmode)$/i, '');
  return name;
}

/** Derive a friendly display name from the path, preferring frontmatter elsewhere. */
function deriveName(segments: string[]): string {
  const basename = segments[segments.length - 1] ?? '';
  const stripped = stripExtensions(basename);
  if (GENERIC_BASENAMES.has(stripped.toLowerCase())) {
    const parent = segments[segments.length - 2];
    if (parent && !CONVENTION_DIRS.has(parent.toLowerCase()) && !parent.startsWith('.')) {
      return parent;
    }
    // Keep the original (e.g. CLAUDE.md at root) when no better parent exists.
    return basename;
  }
  return stripped;
}

/** Classify by path conventions across the three supported ecosystems. */
function classifyByPath(segments: string[]): Classification | undefined {
  const lower = segments.map((s) => s.toLowerCase());
  const basename = lower[lower.length - 1] ?? '';
  const parent = lower[lower.length - 2];

  // --- Claude Code ---
  const claudeIdx = lower.indexOf('.claude');
  if (claudeIdx !== -1) {
    const sub = lower[claudeIdx + 1];
    if (sub === 'skills') {
      return { type: 'skill', ecosystem: 'claude' };
    }
    if (sub === 'agents') {
      return { type: 'agent', ecosystem: 'claude' };
    }
    if (sub === 'commands') {
      return { type: 'prompt', ecosystem: 'claude' };
    }
  }
  if (basename === 'claude.md') {
    return { type: 'instruction', ecosystem: 'claude' };
  }

  // --- GitHub Copilot ---
  const githubIdx = lower.indexOf('.github');
  if (githubIdx !== -1) {
    if (basename === 'copilot-instructions.md') {
      return { type: 'instruction', ecosystem: 'copilot' };
    }
    if (parent === 'instructions' && basename.endsWith('.instructions.md')) {
      return { type: 'instruction', ecosystem: 'copilot' };
    }
    if (parent === 'prompts' && basename.endsWith('.prompt.md')) {
      return { type: 'prompt', ecosystem: 'copilot' };
    }
  }

  return undefined;
}

/** Classify by the generic heuristic: folder names and filename suffixes. */
function classifyGeneric(segments: string[]): Classification | undefined {
  const lower = segments.map((s) => s.toLowerCase());
  const basename = lower[lower.length - 1] ?? '';
  const parent = lower[lower.length - 2];

  // Filename suffix, e.g. foo.skill.md / foo.agent.md / foo.prompt.md / foo.instructions.md
  const suffixMatch = basename.match(/\.(skill|agent|prompt|instructions?)\.md$/);
  if (suffixMatch) {
    const type = normalizeType(suffixMatch[1]);
    if (type) {
      return { type, ecosystem: 'generic' };
    }
  }

  // Parent folder convention, e.g. prompts/foo.md
  if (parent) {
    const type = typeFromFolderName(parent);
    if (type) {
      return { type, ecosystem: 'generic' };
    }
  }

  return undefined;
}

/**
 * Classify a markdown file into an agentic asset, or return `null` if it is not one.
 *
 * Strategy: path conventions first, generic heuristic second, then frontmatter to
 * refine (an explicit `type` field wins) or to rescue files that match no convention
 * but clearly declare themselves via `name` + `description`.
 */
export function classify(relativePath: string, raw: string): ClassifyResult | null {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const { data } = parseFrontmatter(raw);
  const fmType = normalizeType(readString(data, 'type', 'kind'));
  const fmName = readString(data, 'name', 'title');
  const fmDescription = readString(data, 'description', 'summary');

  let classification = classifyByPath(segments) ?? classifyGeneric(segments);

  if (classification) {
    // Frontmatter `type` overrides the type but keeps the discovered ecosystem.
    if (fmType) {
      classification = { type: fmType, ecosystem: classification.ecosystem };
    }
  } else if (fmType) {
    // No path match, but the file explicitly declares its type.
    classification = { type: fmType, ecosystem: 'generic' };
  } else if (fmName && fmDescription) {
    // Looks like a skill/agent definition (Claude convention) — default to skill.
    classification = { type: 'skill', ecosystem: 'generic' };
  } else {
    return null;
  }

  const name = fmName ?? deriveName(segments);
  return { classification, name, description: fmDescription };
}
