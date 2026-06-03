import matter from 'gray-matter';

export interface ParsedFrontmatter {
  /** Parsed YAML frontmatter data (empty object if none / invalid). */
  data: Record<string, unknown>;
  /** The markdown body with frontmatter stripped. */
  content: string;
}

/**
 * Parse YAML frontmatter from raw markdown. Fault-tolerant: malformed YAML
 * never throws — it returns empty data and the original text as content.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  try {
    const parsed = matter(raw);
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    return { data, content: parsed.content };
  } catch {
    return { data: {}, content: raw };
  }
}

/** Read a string field from frontmatter data, trimmed, or undefined. */
export function readString(
  data: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
