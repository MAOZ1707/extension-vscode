import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WORKFLOW_VERSION,
  deserialize,
  emptyWorkflow,
  folderForFile,
  lockOf,
  serialize,
  validate,
  type WorkflowFile,
} from './workflowFile';

const sample: WorkflowFile = {
  version: WORKFLOW_VERSION,
  nodes: [
    { id: 'n1', assetId: 'a.md', relativePath: 'a.md', type: 'agent', ecosystem: 'claude', name: 'A', x: 10, y: 20 },
    { id: 'n2', assetId: 'b.md', relativePath: 'b.md', type: 'skill', ecosystem: 'claude', name: 'B', x: 30, y: 40 },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
};

test('emptyWorkflow has the current version and no nodes/edges', () => {
  const e = emptyWorkflow();
  assert.equal(e.version, WORKFLOW_VERSION);
  assert.deepEqual(e.nodes, []);
  assert.deepEqual(e.edges, []);
});

test('serialize → deserialize round-trips identically', () => {
  const round = deserialize(JSON.parse(serialize(sample)));
  assert.deepEqual(round, sample);
});

test('serialize emits pretty JSON ending with a newline', () => {
  const text = serialize(sample);
  assert.ok(text.endsWith('\n'));
  assert.ok(text.includes('\n  "version"'));
});

test('rejects unsupported version', () => {
  const r = validate({ version: 999, nodes: [], edges: [] });
  assert.equal(r.ok, false);
});

test('rejects non-array nodes', () => {
  const r = validate({ version: WORKFLOW_VERSION, nodes: {}, edges: [] });
  assert.equal(r.ok, false);
});

test('rejects node with bad type', () => {
  const r = validate({
    version: WORKFLOW_VERSION,
    nodes: [{ id: 'n1', assetId: 'a', relativePath: 'a', type: 'banana', name: 'A', x: 0, y: 0 }],
    edges: [],
  });
  assert.equal(r.ok, false);
});

test('rejects node with non-numeric coordinates', () => {
  const r = validate({
    version: WORKFLOW_VERSION,
    nodes: [{ id: 'n1', assetId: 'a', relativePath: 'a', type: 'agent', name: 'A', x: 'nope', y: 0 }],
    edges: [],
  });
  assert.equal(r.ok, false);
});

test('rejects duplicate node ids', () => {
  const node = { id: 'n1', assetId: 'a', relativePath: 'a', type: 'agent', name: 'A', x: 0, y: 0 };
  const r = validate({ version: WORKFLOW_VERSION, nodes: [node, { ...node }], edges: [] });
  assert.equal(r.ok, false);
});

test('drops dangling edges that reference missing nodes', () => {
  const r = validate({
    version: WORKFLOW_VERSION,
    nodes: sample.nodes,
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n1', target: 'ghost' },
    ],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.file.edges.length, 1);
    assert.equal(r.droppedEdges, 1);
  }
});

test('de-duplicates identical source→target edges', () => {
  const r = validate({
    version: WORKFLOW_VERSION,
    nodes: sample.nodes,
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n1', target: 'n2' },
    ],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.file.edges.length, 1);
    assert.equal(r.droppedEdges, 1);
  }
});

test('relativePath falls back to assetId when missing', () => {
  const r = validate({
    version: WORKFLOW_VERSION,
    nodes: [{ id: 'n1', assetId: 'a.md', type: 'prompt', name: 'A', x: 1, y: 2 }],
    edges: [],
  });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.file.nodes[0].relativePath, 'a.md');
});

test('deserialize throws on invalid input', () => {
  assert.throws(() => deserialize({ version: 2 }));
});

test('accepts a v1 file and backfills ecosystem as generic', () => {
  const r = validate({
    version: 1,
    nodes: [{ id: 'n1', assetId: 'a', relativePath: 'a', type: 'agent', name: 'A', x: 0, y: 0 }],
    edges: [],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.file.version, WORKFLOW_VERSION);
    assert.equal(r.file.nodes[0].ecosystem, 'generic');
  }
});

test('backfills an unknown ecosystem to generic', () => {
  const r = validate({
    version: WORKFLOW_VERSION,
    nodes: [
      { id: 'n1', assetId: 'a', relativePath: 'a', type: 'agent', ecosystem: 'banana', name: 'A', x: 0, y: 0 },
    ],
    edges: [],
  });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.file.nodes[0].ecosystem, 'generic');
});

test('lockOf prefers claude, then copilot, else null', () => {
  assert.equal(lockOf([]), null);
  assert.equal(lockOf([{ ecosystem: 'generic' }]), null);
  assert.equal(lockOf([{ ecosystem: 'copilot' }, { ecosystem: 'generic' }]), 'copilot');
  assert.equal(lockOf([{ ecosystem: 'copilot' }, { ecosystem: 'claude' }]), 'claude');
});

test('folderForFile maps an unlocked workflow to generic', () => {
  assert.equal(folderForFile({ nodes: [] }), 'generic');
  assert.equal(folderForFile({ nodes: [{ ecosystem: 'generic' }] }), 'generic');
  assert.equal(folderForFile({ nodes: [{ ecosystem: 'copilot' }] }), 'copilot');
  assert.equal(folderForFile({ nodes: [{ ecosystem: 'claude' }] }), 'claude');
});
