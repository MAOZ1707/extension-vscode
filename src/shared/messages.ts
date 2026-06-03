import { AgenticAsset } from '../scanner/types';
import { Lock } from '../canvas/workflowFile';

/** Messages sent from the extension host to the webview. */
export type HostToWebview =
  | { type: 'setLoading' }
  | { type: 'setAssets'; assets: AgenticAsset[]; workspaceOpen: boolean; error?: string }
  | { type: 'setLock'; llm: Lock };

/** Messages sent from the webview to the extension host. */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'log'; text: string }
  | { type: 'addToCanvas'; assetId: string }
  | { type: 'openAsset'; assetId: string };
