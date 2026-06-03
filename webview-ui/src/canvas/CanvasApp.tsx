import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AssetType, Ecosystem } from '../../../src/scanner/types';
import { ASSET_TYPE_LABELS } from '../../../src/scanner/types';
import type { HostToCanvas } from '../../../src/shared/canvasMessages';
import {
  WORKFLOW_VERSION,
  type Lock,
  type WorkflowEdge,
  type WorkflowFile,
  lockOf,
} from '../../../src/canvas/workflowFile';
import { postMessage } from './canvasApi';

/** A placed node, with a transient "missing asset" flag. */
interface CanvasNode {
  id: string;
  assetId: string;
  relativePath: string;
  type: AssetType;
  ecosystem: Ecosystem;
  name: string;
  x: number;
  y: number;
  missing?: boolean;
}

type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

type DragState =
  | { kind: 'move'; nodeId: string; dx: number; dy: number; moved: boolean }
  | { kind: 'connect'; sourceId: string };

const NODE_W = 170;
const NODE_H = 56;

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Right-center anchor of a node (edge source). */
function sourceAnchor(n: CanvasNode) {
  return { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
}
/** Left-center anchor of a node (edge target). */
function targetAnchor(n: CanvasNode) {
  return { x: n.x, y: n.y + NODE_H / 2 };
}

function bezier(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.max(40, Math.abs(tx - sx) / 2);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

export function CanvasApp() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [connect, setConnect] = useState<{ sourceId: string; x: number; y: number } | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const dirtyRef = useRef(false);
  const addCountRef = useRef(0);
  const lastLockRef = useRef<Lock>(null);

  function markDirty() {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      postMessage({ type: 'dirtyChanged', dirty: true });
    }
  }
  function clearDirty() {
    dirtyRef.current = false;
  }

  // ---- Host -> Canvas messages ----
  useEffect(() => {
    function onMessage(event: MessageEvent<HostToCanvas>) {
      const message = event.data;
      switch (message.type) {
        case 'addNode': {
          const a = message.asset;
          const offset = (addCountRef.current % 10) * 26;
          addCountRef.current += 1;
          setNodes((prev) => [
            ...prev,
            {
              id: makeId('n'),
              assetId: a.id,
              relativePath: a.relativePath,
              type: a.type,
              ecosystem: a.ecosystem,
              name: a.name,
              x: 60 + offset,
              y: 60 + offset,
            },
          ]);
          markDirty();
          break;
        }
        case 'loadWorkflow': {
          const missing = new Set(message.missingNodeIds);
          setNodes(message.file.nodes.map((n) => ({ ...n, missing: missing.has(n.id) })));
          setEdges(message.file.edges);
          setSelection(null);
          addCountRef.current = message.file.nodes.length;
          clearDirty();
          break;
        }
        case 'newWorkflow':
          setNodes([]);
          setEdges([]);
          setSelection(null);
          addCountRef.current = 0;
          clearDirty();
          break;
        case 'savedState':
          clearDirty();
          break;
        case 'setWorkflowName':
          // Title is managed host-side; nothing to render here.
          break;
      }
    }
    window.addEventListener('message', onMessage);
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ---- Keyboard ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'Escape') {
        setSelection(null);
        setConnect(null);
        dragRef.current = null;
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        deleteSelection();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ---- Lock derivation ----
  useEffect(() => {
    const llm = lockOf(nodes);
    if (llm !== lastLockRef.current) {
      lastLockRef.current = llm;
      postMessage({ type: 'lockChanged', llm });
    }
  }, [nodes]);

  function toSurface(e: { clientX: number; clientY: number }) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---- Node / edge mutations ----
  function deleteSelection() {
    if (!selection) return;
    if (selection.kind === 'node') {
      setNodes((prev) => prev.filter((n) => n.id !== selection.id));
      setEdges((prev) => prev.filter((e) => e.source !== selection.id && e.target !== selection.id));
    } else {
      setEdges((prev) => prev.filter((e) => e.id !== selection.id));
    }
    setSelection(null);
    markDirty();
  }

  function addEdge(source: string, target: string) {
    if (source === target) return;
    if (edges.some((e) => e.source === source && e.target === target)) return;
    setEdges((prev) => [...prev, { id: makeId('e'), source, target }]);
    markDirty();
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    setSelection((sel) => (sel && sel.kind === 'node' && sel.id === id ? null : sel));
    markDirty();
  }

  function deleteEdge(id: string) {
    setEdges((prev) => prev.filter((e) => e.id !== id));
    setSelection((sel) => (sel && sel.kind === 'edge' && sel.id === id ? null : sel));
    markDirty();
  }

  // ---- Pointer interactions (on the surface) ----
  function onNodePointerDown(e: ReactPointerEvent, nodeId: string) {
    e.stopPropagation();
    setSelection({ kind: 'node', id: nodeId });
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const p = toSurface(e);
    dragRef.current = { kind: 'move', nodeId, dx: p.x - node.x, dy: p.y - node.y, moved: false };
    surfaceRef.current?.setPointerCapture(e.pointerId);
  }

  function onPortPointerDown(e: ReactPointerEvent, nodeId: string) {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    dragRef.current = { kind: 'connect', sourceId: nodeId };
    const a = sourceAnchor(node);
    setConnect({ sourceId: nodeId, x: a.x, y: a.y });
    surfaceRef.current?.setPointerCapture(e.pointerId);
  }

  function onSurfacePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSurface(e);
    if (drag.kind === 'move') {
      drag.moved = true;
      setNodes((prev) =>
        prev.map((n) => (n.id === drag.nodeId ? { ...n, x: p.x - drag.dx, y: p.y - drag.dy } : n))
      );
    } else {
      setConnect((c) => (c ? { ...c, x: p.x, y: p.y } : c));
    }
  }

  function onSurfacePointerUp(e: ReactPointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    surfaceRef.current?.releasePointerCapture?.(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'move') {
      if (drag.moved) markDirty();
    } else {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-node-id]') as HTMLElement | null;
      const targetId = target?.dataset.nodeId;
      if (targetId) addEdge(drag.sourceId, targetId);
      setConnect(null);
    }
  }

  function currentFile(): WorkflowFile {
    return {
      version: WORKFLOW_VERSION,
      nodes: nodes.map(({ missing, ...n }) => n),
      edges,
    };
  }

  const nodeById = useMemo(() => {
    const map = new Map<string, CanvasNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const surfaceSize = useMemo(() => {
    let width = 800;
    let height = 600;
    for (const n of nodes) {
      width = Math.max(width, n.x + NODE_W + 80);
      height = Math.max(height, n.y + NODE_H + 80);
    }
    return { width, height };
  }, [nodes]);

  const connectSource = connect ? nodeById.get(connect.sourceId) : undefined;

  return (
    <div className="canvas">
      <header className="canvas__toolbar">
        <button className="canvas__btn" onClick={() => postMessage({ type: 'requestNew' })}>
          New
        </button>
        <button className="canvas__btn" onClick={() => postMessage({ type: 'requestOpen' })}>
          Open
        </button>
        <button
          className="canvas__btn"
          onClick={() => postMessage({ type: 'requestSave', file: currentFile() })}
        >
          Save
        </button>
        <button
          className="canvas__btn"
          onClick={() => postMessage({ type: 'requestSaveAs', file: currentFile() })}
        >
          Save As
        </button>
        <span className="canvas__spacer" />
        <button className="canvas__btn" onClick={deleteSelection} disabled={!selection}>
          Delete
        </button>
        <span className="canvas__hint">
          {nodes.length} node{nodes.length === 1 ? '' : 's'} · {edges.length} edge
          {edges.length === 1 ? '' : 's'}
        </span>
      </header>

      <div className="canvas__viewport">
        <div
          ref={surfaceRef}
          className="canvas__surface"
          style={{ width: surfaceSize.width, height: surfaceSize.height }}
          onPointerDown={() => setSelection(null)}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
        >
          <svg className="canvas__edges" width={surfaceSize.width} height={surfaceSize.height}>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="canvas__arrow" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const s = nodeById.get(edge.source);
              const t = nodeById.get(edge.target);
              if (!s || !t) return null;
              const a = sourceAnchor(s);
              const b = targetAnchor(t);
              const d = bezier(a.x, a.y, b.x, b.y);
              const selected = selection?.kind === 'edge' && selection.id === edge.id;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={edge.id} className={`canvas__edge-group ${selected ? 'is-selected' : ''}`}>
                  <path
                    d={d}
                    className="canvas__edge-hit"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      setSelection({ kind: 'edge', id: edge.id });
                    }}
                  />
                  <path
                    d={d}
                    className={`canvas__edge ${selected ? 'is-selected' : ''}`}
                    markerEnd="url(#arrow)"
                  />
                  <g
                    className="canvas__edge-remove"
                    transform={`translate(${mx}, ${my})`}
                    onPointerDown={(ev) => { ev.stopPropagation(); }}
                    onClick={(ev) => { ev.stopPropagation(); deleteEdge(edge.id); }}
                  >
                    <title>Remove connection</title>
                    <circle r="9" />
                    <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" />
                  </g>
                </g>
              );
            })}

            {connect && connectSource && (
              <path
                d={bezier(
                  sourceAnchor(connectSource).x,
                  sourceAnchor(connectSource).y,
                  connect.x,
                  connect.y
                )}
                className="canvas__edge canvas__edge--pending"
              />
            )}
          </svg>

          {nodes.map((node) => {
            const selected = selection?.kind === 'node' && selection.id === node.id;
            return (
              <div
                key={node.id}
                data-node-id={node.id}
                className={`canvas-node ${selected ? 'is-selected' : ''} ${
                  node.missing ? 'is-missing' : ''
                }`}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                title={node.missing ? `${node.relativePath} (file not found)` : node.relativePath}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onDoubleClick={() => postMessage({ type: 'openAsset', assetId: node.assetId })}
              >
                <span className={`canvas-node__badge canvas-node__badge--${node.type}`}>
                  {ASSET_TYPE_LABELS[node.type].replace(/s$/, '')}
                </span>
                <span className="canvas-node__name">{node.name}</span>
                <span
                  className="canvas-node__port"
                  title="Drag to connect"
                  onPointerDown={(e) => onPortPointerDown(e, node.id)}
                />
                <button
                  type="button"
                  className="canvas-node__delete"
                  title="Remove from canvas"
                  aria-label="Remove from canvas"
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                >
                  ×
                </button>
              </div>
            );
          })}

          {nodes.length === 0 && (
            <p className="canvas__empty">
              Double-click an asset in the Agentic Assets sidebar to add it here, then drag from a
              node's right edge to connect.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
