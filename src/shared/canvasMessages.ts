import { AgenticAsset } from '../scanner/types';
import { Lock, WorkflowFile } from '../canvas/workflowFile';

/** Messages sent from the extension host to the canvas webview. */
export type HostToCanvas =
  | { type: 'addNode'; asset: AgenticAsset }
  | { type: 'loadWorkflow'; name: string; file: WorkflowFile; missingNodeIds: string[] }
  | { type: 'newWorkflow' }
  | { type: 'savedState'; name: string }
  | { type: 'setWorkflowName'; name: string | undefined };

/** Messages sent from the canvas webview to the extension host. */
export type CanvasToHost =
  | { type: 'ready' }
  | { type: 'requestNew' }
  | { type: 'requestOpen' }
  | { type: 'requestSave'; file: WorkflowFile }
  | { type: 'requestSaveAs'; file: WorkflowFile }
  | { type: 'openAsset'; assetId: string }
  | { type: 'dirtyChanged'; dirty: boolean }
  | { type: 'lockChanged'; llm: Lock }
  | { type: 'log'; text: string };
