import * as vscode from 'vscode';
import { AgenticAsset } from '../scanner/types';
import { CanvasToHost, HostToCanvas } from '../shared/canvasMessages';
import {
  Lock,
  WorkflowFile,
  WorkflowNode,
  folderForFile,
  lockOf,
} from '../canvas/workflowFile';
import {
  WorkflowRef,
  primaryFolder,
  promptOpen,
  promptSaveAs,
  readWorkflow,
  writeWorkflow,
} from '../canvas/workflowIO';
import { buildHtml } from './webviewHtml';
import { log } from '../log';

/** Resolves an asset id (workspace-relative path) to its current asset, if any. */
export type ResolveAsset = (assetId: string) => AgenticAsset | undefined;

/** Notified whenever the canvas's active-LLM lock changes (so the sidebar can react). */
export type OnLockChanged = (llm: Lock) => void;

/** Hosts the single Workflow Canvas editor panel and its file operations. */
export class CanvasPanel {
  public static readonly viewType = 'agenticAssets.canvas';
  private static current: CanvasPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private readonly outbox: HostToCanvas[] = [];

  private currentUri: vscode.Uri | undefined;
  private currentName: string | undefined;
  private dirty = false;
  private lock: Lock = null;

  /** Open the canvas panel, revealing the existing one if present. */
  public static createOrShow(
    extensionUri: vscode.Uri,
    resolveAsset: ResolveAsset,
    onLockChanged: OnLockChanged
  ): CanvasPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
    if (CanvasPanel.current) {
      CanvasPanel.current.panel.reveal(column);
      return CanvasPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      CanvasPanel.viewType,
      'Workflow Canvas',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );
    CanvasPanel.current = new CanvasPanel(panel, extensionUri, resolveAsset, onLockChanged);
    return CanvasPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly resolveAsset: ResolveAsset,
    private readonly onLockChanged: OnLockChanged
  ) {
    // Register the message handler BEFORE setting html so the webview's initial
    // `ready` is never lost (mirrors AssetsViewProvider).
    this.panel.webview.onDidReceiveMessage(
      (message: CanvasToHost) => this.onMessage(message),
      undefined,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    this.panel.webview.html = buildHtml({
      webview: this.panel.webview,
      extensionUri,
      scriptName: 'canvas.js',
      cssName: 'canvas.css',
      title: 'Workflow Canvas',
    });
  }

  /** Add an asset to the canvas (revealing the panel first). */
  public addAsset(asset: AgenticAsset): void {
    this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Active);
    this.post({ type: 'addNode', asset });
  }

  private onMessage(message: CanvasToHost): void {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.flush();
        break;
      case 'requestNew':
        void this.handleNew();
        break;
      case 'requestOpen':
        void this.handleOpen();
        break;
      case 'requestSave':
        void this.handleSave(message.file, false);
        break;
      case 'requestSaveAs':
        void this.handleSave(message.file, true);
        break;
      case 'openAsset':
        void this.openAsset(message.assetId);
        break;
      case 'dirtyChanged':
        this.dirty = message.dirty;
        this.updateTitle();
        break;
      case 'lockChanged':
        this.setLock(message.llm);
        break;
      case 'log':
        log(`[canvas] ${message.text}`);
        break;
    }
  }

  /** Record the active-LLM lock and notify the host wiring (which updates the sidebar). */
  private setLock(llm: Lock): void {
    if (this.lock === llm) return;
    this.lock = llm;
    this.onLockChanged(llm);
  }

  private async handleNew(): Promise<void> {
    if (!(await this.confirmDiscardIfDirty())) return;
    this.currentUri = undefined;
    this.currentName = undefined;
    this.dirty = false;
    this.setLock(null);
    this.post({ type: 'newWorkflow' });
    this.post({ type: 'setWorkflowName', name: undefined });
    this.updateTitle();
  }

  private async handleOpen(): Promise<void> {
    const folder = primaryFolder();
    if (!folder) {
      void vscode.window.showWarningMessage('Open a folder to load workflows.');
      return;
    }
    if (!(await this.confirmDiscardIfDirty())) return;
    const ref = await promptOpen(folder);
    if (!ref) return;
    try {
      const file = await readWorkflow(ref.uri);
      const missingNodeIds = this.computeMissing(file.nodes);
      this.currentUri = ref.uri;
      this.currentName = ref.name;
      this.dirty = false;
      this.setLock(lockOf(file.nodes));
      this.post({ type: 'loadWorkflow', name: ref.name, file, missingNodeIds });
      this.updateTitle();
    } catch (err) {
      log(`Open failed: ${String(err)}`);
      void vscode.window.showErrorMessage(`Could not open workflow: ${String(err)}`);
    }
  }

  private async handleSave(file: WorkflowFile, forceDialog: boolean): Promise<void> {
    const folder = primaryFolder();
    if (!folder) {
      void vscode.window.showWarningMessage('Open a folder to save workflows.');
      return;
    }
    let target: WorkflowRef | undefined;
    if (!forceDialog && this.currentUri && this.currentName) {
      target = { uri: this.currentUri, name: this.currentName, llm: folderForFile(file) };
    } else {
      target = await promptSaveAs(folder, file, this.currentName);
    }
    if (!target) return;
    try {
      await writeWorkflow(target.uri, file);
      this.currentUri = target.uri;
      this.currentName = target.name;
      this.dirty = false;
      this.post({ type: 'savedState', name: target.name });
      this.post({ type: 'setWorkflowName', name: target.name });
      this.updateTitle();
      log(`Saved workflow to ${target.uri.fsPath}`);
    } catch (err) {
      log(`Save failed: ${String(err)}`);
      void vscode.window.showErrorMessage(`Could not save workflow: ${String(err)}`);
    }
  }

  private async openAsset(assetId: string): Promise<void> {
    const asset = this.resolveAsset(assetId);
    if (!asset) {
      void vscode.window.showWarningMessage(`Asset no longer exists: ${assetId}`);
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(asset.absolutePath));
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
      void vscode.window.showWarningMessage(`Could not open ${asset.relativePath}: ${String(err)}`);
    }
  }

  /** Node assetIds that no longer resolve to a known asset. */
  private computeMissing(nodes: WorkflowNode[]): string[] {
    return nodes.filter((n) => !this.resolveAsset(n.assetId)).map((n) => n.id);
  }

  private async confirmDiscardIfDirty(): Promise<boolean> {
    if (!this.dirty) return true;
    const choice = await vscode.window.showWarningMessage(
      'This workflow has unsaved changes. Discard them?',
      { modal: true },
      'Discard'
    );
    return choice === 'Discard';
  }

  private updateTitle(): void {
    const base = this.currentName ?? 'Untitled';
    this.panel.title = this.dirty ? `${base} ●` : base === 'Untitled' ? 'Workflow Canvas' : base;
  }

  private post(message: HostToCanvas): void {
    if (!this.ready) {
      this.outbox.push(message);
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  private flush(): void {
    while (this.outbox.length > 0) {
      const message = this.outbox.shift()!;
      void this.panel.webview.postMessage(message);
    }
  }

  private dispose(): void {
    CanvasPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
