import { createContext } from 'react';
import type { Lock } from '../../src/canvas/workflowFile';

/** The LLM the canvas is locked to (null = unlocked). Drives sidebar dimming. */
export const LockContext = createContext<Lock>(null);
