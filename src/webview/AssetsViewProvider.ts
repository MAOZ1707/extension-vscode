import * as vscode from 'vscode';
import { scanWorkspace } from '../scanner/scanner';
import { AgenticAsset, ECOSYSTEM_LABELS } from '../scanner/types';
import { Lock } from '../canvas/workflowFile';
import { HostToWebview, WebviewToHost } from '../shared/messages';
import { buildHtml } from './webviewHtml';
import { log } from '../log';

/** Hosts the sidebar webview, runs scans, and bridges host <-> webview messages. */
export class AssetsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agenticAssets.view';

  private view?: vscode.WebviewView;

  /** The most recent scan results, shared with the canvas via getAssetById. */
  private lastAssets: AgenticAsset[] = [];

  /** The LLM the canvas is currently locked to (mirrors the canvas; set by the host). */
  private lock: Lock = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    /** Invoked when the user adds an asset to the canvas from the sidebar. */
    private readonly onAddToCanvas: (asset: AgenticAsset) => void
  ) {}

  /** Look up a cached asset by its id (workspace-relative path). */
  public getAssetById(id: string): AgenticAsset | undefined {
    return this.lastAssets.find((a) => a.id === id);
  }

  /**
   * Update the active-LLM lock (driven by the canvas via the host) and push it to
   * the sidebar so it can dim/block the inactive LLM's assets and show the banner.
   */
  public setLock(llm: Lock): void {
    this.lock = llm;
    this.post({ type: 'setLock', llm });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    log('resolveWebviewView called.');
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };

    // Register the message handler BEFORE setting html, otherwise the webview's
    // initial `ready` message can race ahead of the listener and be lost.
    webviewView.webview.onDidReceiveMessage((message: WebviewToHost) => {
      switch (message.type) {
        case 'ready':
          log('Webview reported ready; running initial scan.');
          this.post({ type: 'setLock', llm: this.lock });
          void this.refresh();
          break;
        case 'refresh':
          log('Refresh requested from webview.');
          void this.refresh();
          break;
        case 'addToCanvas':
          this.handleAddToCanvas(message.assetId);
          break;
        case 'openAsset':
          void this.openAsset(message.assetId);
          break;
        case 'log':
          log(`[webview] ${message.text}`);
          break;
      }
    });

    webviewView.webview.html = buildHtml({
      webview: webviewView.webview,
      extensionUri: this.extensionUri,
      scriptName: 'webview.js',
      cssName: 'webview.css',
      title: 'Agentic Assets',
    });
    log('Webview html set.');
  }

  /** Public entry point for the refresh command. */
  public async refresh(): Promise<void> {
    if (!this.view) {
      log('Refresh ignored: webview not resolved yet.');
      return;
    }
    this.post({ type: 'setLoading' });

    const workspaceOpen = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    try {
      const assets = await scanWorkspace();
      this.lastAssets = assets;
      log(`Posting ${assets.length} asset(s) to webview.`);
      this.post({ type: 'setAssets', assets, workspaceOpen });
    } catch (err) {
      log(`Scan failed: ${String(err)}`);
      this.post({ type: 'setAssets', assets: [], workspaceOpen, error: String(err) });
    }
  }

  private handleAddToCanvas(assetId: string): void {
    const asset = this.getAssetById(assetId);
    if (!asset) {
      log(`addToCanvas ignored: no asset for id "${assetId}".`);
      return;
    }
    // Enforce the single-LLM lock host-side (the sidebar also greys these out, but a
    // mismatched add could still arrive). Generic assets are always allowed.
    if (this.lock !== null && asset.ecosystem !== 'generic' && asset.ecosystem !== this.lock) {
      log(`addToCanvas blocked: ${asset.ecosystem} asset while locked to ${this.lock}.`);
      void vscode.window.showWarningMessage(
        `This workflow is locked to ${ECOSYSTEM_LABELS[this.lock]}. Clear the canvas to add ${ECOSYSTEM_LABELS[asset.ecosystem]} assets.`
      );
      return;
    }
    this.onAddToCanvas(asset);
  }

  private async openAsset(assetId: string): Promise<void> {
    const asset = this.getAssetById(assetId);
    if (!asset) {
      log(`openAsset ignored: no asset for id "${assetId}".`);
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(asset.absolutePath));
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
      log(`openAsset failed: ${String(err)}`);
      void vscode.window.showWarningMessage(`Could not open ${asset.relativePath}: ${String(err)}`);
    }
  }

  private post(message: HostToWebview): void {
    if (!this.view) {
      log(`Cannot post ${message.type}: no webview.`);
      return;
    }
    void this.view.webview.postMessage(message).then(
      (ok) => {
        if (!ok) {
          log(`postMessage(${message.type}) returned false (webview not reachable).`);
        }
      },
      (err) => log(`postMessage(${message.type}) rejected: ${String(err)}`)
    );
  }
}
