import type { CanvasToHost } from '../../../src/shared/canvasMessages';

interface VsCodeApi {
  postMessage(message: CanvasToHost): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Acquire the VSCode webview API exactly once and expose a typed wrapper. */
export const vscode: VsCodeApi = acquireVsCodeApi();

export function postMessage(message: CanvasToHost): void {
  vscode.postMessage(message);
}
