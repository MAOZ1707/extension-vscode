import * as vscode from 'vscode';
import { Ecosystem, ECOSYSTEM_LABELS } from '../scanner/types';
import { WorkflowFile, deserialize, folderForFile, serialize } from './workflowFile';

const AGENTIC_DIR = '.agentic';
const SUFFIX = '.canvas.json';

/** The per-LLM subfolders workflows are organized into, in display order. */
const LLM_SUBFOLDERS: Ecosystem[] = ['claude', 'copilot', 'generic'];

/** A located workflow file plus the name to display for it. */
export interface WorkflowRef {
  uri: vscode.Uri;
  /** Base name without the `.canvas.json` suffix. */
  name: string;
  /** The LLM subfolder this workflow lives under. */
  llm: Ecosystem;
}

/** The first workspace folder, or undefined if none is open. */
export function primaryFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

/** Ensure `<folder>/.agentic/<llm>` exists and return its uri. */
export async function ensureAgenticDir(
  folder: vscode.WorkspaceFolder,
  llm: Ecosystem
): Promise<vscode.Uri> {
  const dir = vscode.Uri.joinPath(folder.uri, AGENTIC_DIR, llm);
  await vscode.workspace.fs.createDirectory(dir);
  return dir;
}

/** List `*.canvas.json` files across every `<folder>/.agentic/<llm>` subfolder. */
export async function listWorkflows(folder: vscode.WorkspaceFolder): Promise<WorkflowRef[]> {
  const refs: WorkflowRef[] = [];
  for (const llm of LLM_SUBFOLDERS) {
    const dir = vscode.Uri.joinPath(folder.uri, AGENTIC_DIR, llm);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      continue; // this subfolder doesn't exist yet
    }
    for (const [name, kind] of entries) {
      if (kind === vscode.FileType.File && name.endsWith(SUFFIX)) {
        refs.push({
          uri: vscode.Uri.joinPath(dir, name),
          name: name.slice(0, -SUFFIX.length),
          llm,
        });
      }
    }
  }
  return refs.sort((a, b) => a.llm.localeCompare(b.llm) || a.name.localeCompare(b.name));
}

/** Prompt the user to pick an existing workflow to open. */
export async function promptOpen(folder: vscode.WorkspaceFolder): Promise<WorkflowRef | undefined> {
  const refs = await listWorkflows(folder);
  if (refs.length === 0) {
    void vscode.window.showInformationMessage(
      `No saved workflows found in ${AGENTIC_DIR}/. Use "Save As" to create one.`
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    refs.map((ref) => ({
      label: ref.name,
      description: `${ECOSYSTEM_LABELS[ref.llm]} · ${AGENTIC_DIR}/${ref.llm}/${ref.name}${SUFFIX}`,
      ref,
    })),
    { placeHolder: 'Open workflow' }
  );
  return picked?.ref;
}

/**
 * Prompt for a workflow name and return the target uri under the per-LLM subfolder
 * derived from the workflow's nodes (`.agentic/<llm>/<name>.canvas.json`).
 */
export async function promptSaveAs(
  folder: vscode.WorkspaceFolder,
  file: WorkflowFile,
  suggestedName?: string
): Promise<WorkflowRef | undefined> {
  const llm = folderForFile(file);
  const name = await vscode.window.showInputBox({
    title: 'Save workflow as',
    prompt: `Saved to ${AGENTIC_DIR}/${llm}/<name>${SUFFIX} (${ECOSYSTEM_LABELS[llm]})`,
    value: suggestedName ?? 'workflow',
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return 'Name is required.';
      if (/[\\/:*?"<>|]/.test(trimmed)) return 'Name may not contain path separators or special characters.';
      return undefined;
    },
  });
  if (!name) return undefined;
  const trimmed = name.trim();
  const dir = await ensureAgenticDir(folder, llm);
  return { uri: vscode.Uri.joinPath(dir, `${trimmed}${SUFFIX}`), name: trimmed, llm };
}

/** Read and validate a workflow file. Throws on parse/validation error. */
export async function readWorkflow(uri: vscode.Uri): Promise<WorkflowFile> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  return deserialize(parsed);
}

/** Serialize and write a workflow file (creating its `.agentic/<llm>` dir if needed). */
export async function writeWorkflow(uri: vscode.Uri, file: WorkflowFile): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(serialize(file), 'utf8'));
}

/** Derive the display name (without suffix) from a workflow file uri. */
export function nameFromUri(uri: vscode.Uri): string {
  const base = uri.path.split('/').pop() ?? '';
  return base.endsWith(SUFFIX) ? base.slice(0, -SUFFIX.length) : base;
}
