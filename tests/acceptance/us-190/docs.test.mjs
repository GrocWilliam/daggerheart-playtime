import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const trimEnd = (s) => s.replace(/\s+$/, '');
const normalize = (s) => s.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\s+$/, '');

test('docs/architecture.md equals the specified content', () => {
  assert.equal(normalize(read('docs/architecture.md')), normalize(fs.readFileSync(path.join(HERE, 'architecture.expected.md'), 'utf8')));
});

test('docs/ui.md has the six headings in order', () => {
  const ui = read('docs/ui.md');
  const heads = ui.split('\n').filter((l) => /^## /.test(l)).map(trimEnd);
  const want = ['## Pages and navigation', '## Layout', '## Shared components', '## Character tunnel', '## Screen states', '## Test ids'];
  const idx = want.map((h) => heads.indexOf(h));
  idx.forEach((i, k) => assert.ok(i >= 0, `missing ${want[k]}`));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'headings out of order');
  // the story's order: Pages, Layout, Components, Tunnel? Spec lists Character tunnel before Screen states.
});

test('docs/ui.md contains the required strings', () => {
  const ui = read('docs/ui.md');
  const strings = ['Modal.svelte', 'modal-cancel', 'new-campaign', 'new-scene', 'new-item', 'new-experience', 'new-card', 'new-character',
    'modal-campaign', 'modal-scene', 'modal-item', 'modal-experience', 'modal-card', 'party', 'build-party', 'build-scenes',
    'sheet-sections', 'sheet-trackers', 'sheet-inventory', 'tunnel-progress', 'tunnel-next', 'tunnel-back', 'tunnel-cancel',
    'tunnel-summary', 'tunnel-edit-1', 'tunnel-create', '768', '1024', '1180', 'min-[600px]:'];
  for (const s of strings) assert.ok(ui.includes(s), `docs/ui.md lacks "${s}"`);
});

test('docs/ui.md lists every static data-testid used in src', () => {
  const ui = read('docs/ui.md');
  const ids = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.svelte')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/data-testid=["']([A-Za-z0-9_-]+)["']/g)) ids.add(m[1]);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.ok(ids.size > 20, 'expected to find test ids in src');
  for (const id of ids) assert.ok(ui.includes(id), `docs/ui.md lacks test id "${id}"`);
});

test('CLAUDE.md links both design docs', () => {
  const c = read('CLAUDE.md');
  assert.ok(c.includes('docs/architecture.md'));
  assert.ok(c.includes('docs/ui.md'));
});

test('the #190 commit changes no file under src/', () => {
  // Limited to the #190 commit: later stories legitimately edit src/.
  let out = '';
  try {
    const sha = execSync(`git log --format=%H --grep='(#190)' -n 1`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!sha) return; // commit not in this history
    out = execSync(`git show --name-only --format= ${sha} -- src`, { cwd: ROOT }).toString().trim();
  } catch { return; }
  assert.equal(out, '');
});
