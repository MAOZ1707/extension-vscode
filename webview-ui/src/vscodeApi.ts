import type { WebviewToHost } from '../../src/shared/messages';

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Acquire the VSCode webview API exactly once and expose a typed wrapper. */
export const vscode: VsCodeApi = acquireVsCodeApi();

export function postMessage(message: WebviewToHost): void {
  vscode.postMessage(message);
}
