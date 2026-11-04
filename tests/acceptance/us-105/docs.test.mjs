import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const claude = readFileSync('CLAUDE.md', 'utf8');
const skillsDir = '.claude/skills';
const skillFiles = [];
(function walk(d) {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : skillFiles.push(p);
  }
})(skillsDir);
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

function expand(s) {
  const m = s.match(/\{([^{}]+)\}/);
  if (!m) return [s];
  return m[1].split(',').flatMap((o) => expand(s.replace(m[0], o)));
}
function pathsIn(text) {
  const out = new Set();
  for (const [, tok] of text.matchAll(/`([^`\n]+)`/g)) {
    if (/[\s*<>$=:|()]/.test(tok) || /NNN|us-N|\bN\b|^\.[\w]+$/.test(tok)) continue;
    if (!/\.(ts|js|mjs|json|svelte|css|sql|md|sh|ya?ml)$|\/$/.test(tok) && !/^[\w.-]+\/[\w./-]+$/.test(tok)) continue;
    if (/^(https?:|\/)/.test(tok)) continue;
    if (/^(\.\/)?(build|data|node_modules|\.svelte-kit)(\/|$)/.test(tok)) continue;
    for (const e of expand(tok)) out.add(e);
  }
  return [...out];
}
function exists(p) {
  const clean = p.replace(/^\.\//, '');
  if (existsSync(clean)) return true;
  if (!clean.includes('/')) return tracked.some((f) => f.split('/').pop() === clean);
  return false;
}

test('CLAUDE.md mentions the new stack and none of the stale names', () => {
  for (const w of ['zod', 'drizzle-kit generate', '@theme', '--color-calm', 'translate', 'stack-'])
    assert.ok(claude.toLowerCase().includes(w.toLowerCase()), `CLAUDE.md should mention ${w}`);
  for (const w of ['ITEMS_SUBQUERY', 'TRACKER_SQL', 'parseCreate'])
    assert.ok(!claude.includes(w), `CLAUDE.md must not mention ${w}`);
});

test('no stale references in .claude or CLAUDE.md', () => {
  const all = [['CLAUDE.md', claude], ...skillFiles.map((f) => [f, readFileSync(f, 'utf8')])];
  for (const [f, t] of all) {
    assert.ok(!/migrations\/NNN|parseCreate/.test(t), `${f} has a stale reference`);
    assert.ok(!/ITEMS_SUBQUERY|TRACKER_SQL/.test(t), `${f} has a stale reference`);
  }
});

test('remaining skills (if any) are consistent with the code and CLAUDE.md', () => {
  const stack = /^stack-/;
  const dirs = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
  for (const d of dirs) {
    assert.ok(!stack.test(d), `${d}: stack-* skills are not project skills`);
    assert.ok(existsSync(join(skillsDir, d, 'SKILL.md')), `${d} has no SKILL.md`);
    assert.ok(claude.includes(d), `CLAUDE.md Skills section should mention remaining skill ${d}`);
  }
  // A deleted skill must not be advertised any more.
  for (const old of ['api-endpoint', 'db-migration', 'ui-style', 'tests']) {
    if (!dirs.includes(old))
      assert.ok(!claude.includes(`\`${old}\``), `CLAUDE.md still lists deleted skill ${old}`);
  }
  for (const f of skillFiles) {
    for (const p of pathsIn(readFileSync(f, 'utf8')))
      assert.ok(exists(p), `${f} mentions missing path ${p}`);
  }
});

test('every file path mentioned in CLAUDE.md exists', () => {
  const ps = pathsIn(claude);
  assert.ok(ps.length > 5, 'CLAUDE.md should mention file paths');
  const missing = ps.filter((p) => !exists(p));
  assert.deepEqual(missing, []);
});
