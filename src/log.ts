import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Agentic Assets');
  }
  return channel;
}

export function log(message: string): void {
  getChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}
