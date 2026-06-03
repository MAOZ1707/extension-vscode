import * as vscode from 'vscode';
import { classify } from './classifier';
import { AgenticAsset, ASSET_TYPE_ORDER } from './types';
import { log } from '../log';

/** Directory names never descended into during a scan. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.vscode-test',
  '.cache',
  'coverage',
]);

/** Safety cap so a pathological tree can't hang the scan. */
const MAX_FILES = 5000;

interface ScanContext {
  assets: AgenticAsset[];
  seen: Set<string>;
  mdFiles: number;
}

/**
 * Scan all open workspace folders for agentic assets.
 *
 * Uses an explicit recursive walk (not `findFiles`) so that hidden/dot folders
 * like `.claude` and `.github` — where most assets live — are reliably traversed
 * regardless of the user's `search.exclude` / `files.exclude` settings.
 */
export async function scanWorkspace(): Promise<AgenticAsset[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    log('Scan skipped: no workspace folder is open.');
    return [];
  }

  const ctx: ScanContext = { assets: [], seen: new Set(), mdFiles: 0 };

  for (const folder of folders) {
    log(`Scanning workspace folder: ${folder.uri.fsPath}`);
    await walk(folder.uri, ctx);
  }

  log(`Scan complete: ${ctx.mdFiles} markdown file(s) inspected, ${ctx.assets.length} asset(s) classified.`);
  return sortAssets(ctx.assets);
}

async function walk(dir: vscode.Uri, ctx: ScanContext): Promise<void> {
  if (ctx.mdFiles >= MAX_FILES) {
    return;
  }

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dir);
  } catch (err) {
    log(`Failed to read directory ${dir.fsPath}: ${String(err)}`);
    return;
  }

  for (const [name, fileType] of entries) {
    if (ctx.mdFiles >= MAX_FILES) {
      return;
    }
    // Skip symlinks to avoid cycles.
    if (fileType & vscode.FileType.SymbolicLink) {
      continue;
    }

    const child = vscode.Uri.joinPath(dir, name);

    if (fileType & vscode.FileType.Directory) {
      if (EXCLUDED_DIRS.has(name)) {
        continue;
      }
      await walk(child, ctx);
      continue;
    }

    if (fileType & vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
      await inspectFile(child, ctx);
    }
  }
}

async function inspectFile(uri: vscode.Uri, ctx: ScanContext): Promise<void> {
  const absolutePath = uri.fsPath;
  if (ctx.seen.has(absolutePath)) {
    return;
  }
  ctx.seen.add(absolutePath);
  ctx.mdFiles++;

  const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');

  let raw: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    raw = Buffer.from(bytes).toString('utf8');
  } catch (err) {
    log(`Failed to read file ${relativePath}: ${String(err)}`);
    return;
  }

  const result = classify(relativePath, raw);
  if (!result) {
    return;
  }

  ctx.assets.push({
    id: relativePath,
    name: result.name,
    type: result.classification.type,
    ecosystem: result.classification.ecosystem,
    relativePath,
    absolutePath,
    description: result.description,
  });
}

/** Sort by type (display order) then case-insensitive name. */
function sortAssets(assets: AgenticAsset[]): AgenticAsset[] {
  return assets.sort((a, b) => {
    const typeDiff = ASSET_TYPE_ORDER.indexOf(a.type) - ASSET_TYPE_ORDER.indexOf(b.type);
    if (typeDiff !== 0) {
      return typeDiff;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
