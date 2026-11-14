import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODAL, HELP, ROWS, ADDED } from './bullets.mjs';

const arch = readFileSync('docs/architecture.md', 'utf8');
const ui = readFileSync('docs/ui.md', 'utf8');
const old = readFileSync('tests/acceptance/us-190/architecture.expected.md', 'utf8');
const archLines = arch.split('\n');
const uiStart = archLines.indexOf('## UI patterns');
const uiEnd = archLines.indexOf('## Data model');
const section = archLines.slice(uiStart + 1, uiEnd);

test('only ## UI patterns of architecture.md changes: it is the frozen expected text', () => {
  assert.equal(arch, old);
});

test('UI patterns holds the three replacement bullets verbatim', () => {
  for (const b of [MODAL, HELP, ROWS]) assert.ok(section.includes(`- ${b}`), `missing: ${b.slice(0, 50)}`);
});

test('UI patterns ends with the five new bullets, verbatim and in order', () => {
  const at = section.indexOf(`- ${ADDED[0]}`);
  assert.ok(at >= 0, 'first new bullet missing');
  ADDED.forEach((b, k) => assert.equal(section[at + k], `- ${b}`, `new bullet ${k + 1}`));
  const last = section.filter((l) => l.startsWith('- ')).at(-1);
  assert.equal(last, `- ${ADDED[4]}`);
  const layout = section.findIndex((l) => l.startsWith('- Layout is mobile first'));
  assert.equal(layout + 1, at, 'new bullets come right after the Layout bullet');
});

test('architecture.md drops the old Tracker description and has no color-mix(', () => {
  assert.ok(!arch.includes('(one tracker or Fear row: label, `Help`, −, value, +, `Pips`)'));
  assert.ok(!arch.includes('color-mix('));
});

function designSystem() {
  const lines = ui.split('\n');
  const start = lines.indexOf('## Design system');
  assert.ok(start >= 0, '## Design system heading missing');
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return { start, text: lines.slice(start, end).join('\n'), lines };
}

test('docs/ui.md has ## Design system right after ## Layout', () => {
  const { start, lines } = designSystem();
  const layout = lines.indexOf('## Layout');
  assert.ok(layout >= 0 && layout < start);
  const between = lines.slice(layout + 1, start).filter((l) => l.startsWith('## '));
  assert.deepEqual(between, [], 'no other ## section between Layout and Design system');
});

test('the Design system section contains the required strings', () => {
  const { text } = designSystem();
  const required = ['--border', '--alpha(var(--accent) / 35%)', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'aria-pressed', 'flex flex-wrap gap-2', '6rem', 'variant="band"', 'EN', 'FR', 'language.en', 'language.fr', 'overflow-x: auto', 'minmax(18rem, 1fr)', '18rem', '80rem', '360px', 'scene-more', 'scene.more', 'scene-edit-open', 'modal-scene-edit', 'scene.editTitle', 'w-[5rem]', 'min-w-0!', '3rem'];
  const missing = required.filter((s) => !text.includes(s));
  assert.deepEqual(missing, []);
});

test('docs/ui.md drops outdated text and lists the new test ids', () => {
  assert.ok(!ui.includes('1.72fr'));
  assert.ok(!ui.includes('font-bold underline'));
  const lines = ui.split('\n');
  const at = lines.findIndex((l) => l.startsWith('## Test ids'));
  assert.ok(at >= 0, 'Test ids section missing');
  const ids = lines.slice(at).join('\n');
  for (const id of ['scene-more', 'scene-edit-open', 'modal-scene-edit']) assert.ok(ids.includes(id), `Test ids lacks ${id}`);
  assert.ok(lines.some((l) => /\bHelp\b/.test(l) && /Popover API/.test(l) && l.includes('`help-open`') && l.includes('`help-panel`') && l.includes('`help-close`')), 'a Help line must mention the Popover API with the three ids');
});
