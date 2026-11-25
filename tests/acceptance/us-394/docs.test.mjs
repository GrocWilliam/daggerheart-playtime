import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The bullet the story prescribes for docs/architecture.md `## UI patterns`, verbatim.
const BULLET = '- Layout breakpoints: mobile first with `md:` and `lg:`, `min-[600px]:` for the modal only, and `min-[1280px]:-mx-16` on `[data-testid=run]` only (the Run content grows to 77rem; the body stays 72rem, so the header and `h1` keep the same box on every step). The Fear band (`Tracker variant="band"`) is `sticky top-0` with a surface background and stays on one row at every width.';
const OLD_BULLET = '- Layout breakpoints: mobile first with `md:` and `lg:`, `min-[600px]:` for the modal only, and the Run step\'s 80rem body width from 1280px (`body:has([data-testid=run])` in `app.css`) only.';

const arch = readFileSync('docs/architecture.md', 'utf8');
const lines = arch.split('\n');
const uiStart = lines.indexOf('## UI patterns');
const uiEnd = lines.findIndex((l, i) => i > uiStart && l.startsWith('## '));
const section = lines.slice(uiStart + 1, uiEnd);

// The version before this story, frozen next to this test (a shallow CI checkout has no main to diff against).
const previousArchitecture = () => readFileSync('tests/acceptance/us-394/architecture.before.md', 'utf8');

test('## UI patterns has the new Layout breakpoints bullet verbatim, as the 4th bullet after Layout is mobile first', () => {
  assert.ok(uiStart >= 0, '## UI patterns heading missing');
  const layout = section.findIndex((l) => l.startsWith('- Layout is mobile first'));
  assert.ok(layout >= 0, '"- Layout is mobile first" bullet missing');
  assert.equal(section[layout + 4], BULLET);
  assert.equal(section.filter((l) => l.startsWith('- Layout breakpoints:')).length, 1, 'exactly one Layout breakpoints bullet');
});

test('architecture.md no longer contains the old Run step width text', () => {
  assert.ok(!arch.includes('body:has([data-testid=run])'), 'body:has([data-testid=run]) still documented');
  assert.ok(!arch.includes("the Run step's 80rem body width"), "the Run step's 80rem body width still documented");
});

test('architecture.md equals the us-190 and us-254 expected copies', () => {
  const a190 = readFileSync('tests/acceptance/us-190/architecture.expected.md', 'utf8');
  const a254 = readFileSync('tests/acceptance/us-254/architecture.expected.md', 'utf8');
  assert.equal(a190, arch, 'us-190 copy differs from docs/architecture.md');
  assert.equal(a254, arch, 'us-254 copy differs from docs/architecture.md');
});

test('architecture.md differs from its previous version in exactly the Layout breakpoints line', () => {
  const prev = previousArchitecture().split('\n');
  assert.equal(lines.length, prev.length, 'line count changed');
  const changed = lines.map((l, i) => [i, prev[i], l]).filter(([, p, c]) => p !== c);
  assert.equal(changed.length, 1, `expected one changed line, got ${changed.length}`);
  const [, before, after] = changed[0];
  assert.equal(before, OLD_BULLET, 'the replaced line is not the old Layout breakpoints bullet');
  assert.equal(after, BULLET, 'the new line is not the prescribed bullet');
});
