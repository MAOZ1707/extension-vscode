import * as vscode from 'vscode';
import { AssetsViewProvider } from './webview/AssetsViewProvider';
import { CanvasPanel } from './webview/CanvasPanel';
import { getChannel, log } from './log';

export function activate(context: vscode.ExtensionContext): void {
  log('Agentic Assets extension activated.');

  // Resolve asset ids through whichever provider instance exists.
  let provider: AssetsViewProvider;
  const resolveAsset = (id: string) => provider.getAssetById(id);
  // Mirror the canvas's active-LLM lock into the sidebar so it can dim/block assets.
  const onLockChanged = (llm: Parameters<AssetsViewProvider['setLock']>[0]) =>
    provider.setLock(llm);

  provider = new AssetsViewProvider(context.extensionUri, (asset) => {
    CanvasPanel.createOrShow(context.extensionUri, resolveAsset, onLockChanged).addAsset(asset);
  });

  context.subscriptions.push(
    getChannel(),
    vscode.window.registerWebviewViewProvider(AssetsViewProvider.viewType, provider),
    vscode.commands.registerCommand('agenticAssets.refresh', () => {
      void provider.refresh();
    }),
    vscode.commands.registerCommand('agenticAssets.showLogs', () => {
      getChannel().show();
    }),
    vscode.commands.registerCommand('agenticAssets.openCanvas', () => {
      CanvasPanel.createOrShow(context.extensionUri, resolveAsset, onLockChanged);
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}
