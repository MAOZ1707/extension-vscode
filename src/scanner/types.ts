/** The kind of agentic asset. */
export type AssetType = 'agent' | 'skill' | 'instruction' | 'prompt';

/** The tool ecosystem an asset belongs to. */
export type Ecosystem = 'claude' | 'copilot' | 'generic';

/** A single agentic asset discovered in the workspace. */
export interface AgenticAsset {
  /** Stable identifier (the workspace-relative path). */
  id: string;
  /** Display name (frontmatter name/title, else the file/folder name). */
  name: string;
  /** Classified type. */
  type: AssetType;
  /** Owning ecosystem. */
  ecosystem: Ecosystem;
  /** Path relative to the workspace folder, using forward slashes. */
  relativePath: string;
  /** Absolute filesystem path. */
  absolutePath: string;
  /** Optional short description (from frontmatter). */
  description?: string;
}

/** Result of classifying a single file. `null` means "not an agentic asset". */
export interface Classification {
  type: AssetType;
  ecosystem: Ecosystem;
}

/** Display order for asset types in the UI. */
export const ASSET_TYPE_ORDER: AssetType[] = ['agent', 'skill', 'instruction', 'prompt'];

/** Human-readable plural labels for each type. */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  agent: 'Agents',
  skill: 'Skills',
  instruction: 'Instructions',
  prompt: 'Prompts',
};

/** Human-readable labels for each ecosystem. */
export const ECOSYSTEM_LABELS: Record<Ecosystem, string> = {
  claude: 'Claude',
  copilot: 'Copilot',
  generic: 'Generic',
};
