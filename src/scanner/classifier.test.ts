import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify } from './classifier';

const FM = (extra: string) => `---\n${extra}\n---\n\nbody\n`;

test('Claude skill under .claude/skills/, name from parent folder', () => {
  const r = classify('.claude/skills/code-review/SKILL.md', FM('name: Code Review\ndescription: Reviews code'));
  assert.ok(r);
  assert.equal(r.classification.type, 'skill');
  assert.equal(r.classification.ecosystem, 'claude');
  assert.equal(r.name, 'Code Review');
  assert.equal(r.description, 'Reviews code');
});

test('Claude agent under .claude/agents/, name from filename', () => {
  const r = classify('.claude/agents/explorer.md', '# Explorer\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'agent');
  assert.equal(r.classification.ecosystem, 'claude');
  assert.equal(r.name, 'explorer');
});

test('Claude command (.claude/commands/) is a prompt', () => {
  const r = classify('.claude/commands/deploy.md', '# Deploy\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'prompt');
  assert.equal(r.classification.ecosystem, 'claude');
});

test('CLAUDE.md at root is a Claude instruction; name falls back to filename', () => {
  const r = classify('CLAUDE.md', '# Project rules\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'instruction');
  assert.equal(r.classification.ecosystem, 'claude');
  assert.equal(r.name, 'CLAUDE.md');
});

test('Copilot repo-wide instructions', () => {
  const r = classify('.github/copilot-instructions.md', '# Guidelines\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'instruction');
  assert.equal(r.classification.ecosystem, 'copilot');
});

test('Copilot scoped instructions file', () => {
  const r = classify('.github/instructions/react.instructions.md', '# React\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'instruction');
  assert.equal(r.classification.ecosystem, 'copilot');
  assert.equal(r.name, 'react');
});

test('Copilot prompt file', () => {
  const r = classify('.github/prompts/refactor.prompt.md', '# Refactor\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'prompt');
  assert.equal(r.classification.ecosystem, 'copilot');
  assert.equal(r.name, 'refactor');
});

test('Generic folder convention: prompts/hello.md', () => {
  const r = classify('prompts/hello.md', '# Hello\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'prompt');
  assert.equal(r.classification.ecosystem, 'generic');
  assert.equal(r.name, 'hello');
});

test('Generic filename suffix: docs/onboarding.skill.md', () => {
  const r = classify('docs/onboarding.skill.md', '# Onboarding\n');
  assert.ok(r);
  assert.equal(r.classification.type, 'skill');
  assert.equal(r.classification.ecosystem, 'generic');
  assert.equal(r.name, 'onboarding');
});

test('Frontmatter type overrides path-derived type but keeps ecosystem', () => {
  const r = classify('.claude/skills/weird/SKILL.md', FM('type: agent\nname: Weird'));
  assert.ok(r);
  assert.equal(r.classification.type, 'agent');
  assert.equal(r.classification.ecosystem, 'claude');
});

test('No convention but name+description is rescued as a generic skill', () => {
  const r = classify('notes/whatever.md', FM('name: Thing\ndescription: A thing'));
  assert.ok(r);
  assert.equal(r.classification.type, 'skill');
  assert.equal(r.classification.ecosystem, 'generic');
});

test('Plain markdown with no convention or frontmatter is excluded', () => {
  const r = classify('README.md', '# Just a readme\n');
  assert.equal(r, null);
});

test('Malformed YAML frontmatter does not throw and is excluded when no convention', () => {
  const r = classify('docs/bad.md', '---\nname: : : oops\n  - broken\n---\n');
  assert.equal(r, null);
});
