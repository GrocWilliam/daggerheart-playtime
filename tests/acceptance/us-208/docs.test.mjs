import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// A missing file reads as empty, so each test fails on its own assertion.
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const architecture = read('docs/architecture.md');
const terms = read('src/lib/srd/fr/TERMS.md');
const license = read('src/lib/srd/LICENSE.md');
const claude = read('CLAUDE.md');

const headingLine = (h) => new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');

// Paragraphs of LICENSE.md are separated by one blank line.
const paragraphs = license.split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);

// A table line is a Markdown table row (starts with `|`) that holds both terms.
function tableLineWith(...words) {
  return terms.split('\n').some((l) => l.trim().startsWith('|') && words.every((w) => l.includes(w)));
}

test('architecture.md has the SRD content and its translation section with its rules', () => {
  assert.match(architecture, headingLine('## SRD content and its translation'));
  for (const s of [
    'localizedSrd(kind, id, lang)',
    'TRANSLATED_FIELDS[kind]',
    'src/lib/srd/fr/TERMS.md',
    'data-testid="srd-licence"',
    'SRD help text is shown through',
  ]) {
    assert.ok(architecture.includes(s), `missing ${s}`);
  }
});

test('architecture.md keeps the Layers and dependencies, UI patterns and Data model sections', () => {
  for (const h of ['## Layers and dependencies', '## UI patterns', '## Data model']) {
    assert.match(architecture, headingLine(h), `missing heading ${h}`);
  }
});

test('TERMS.md exists with the English | French table header', () => {
  assert.ok(terms.split('\n').some((l) => l.trim() === '| English | French |'));
});

test('TERMS.md has the Spotlight → projecteur row', () => {
  assert.ok(tableLineWith('Spotlight', 'projecteur'));
});

test('TERMS.md has the Countdown → compte à rebours row', () => {
  assert.ok(tableLineWith('Countdown', 'compte à rebours'));
});

test('TERMS.md has the Duality Dice → dés de Dualité row', () => {
  assert.ok(tableLineWith('Duality Dice', 'dés de Dualité'));
});

test('TERMS.md has the Bruiser → Cogneur row', () => {
  assert.ok(tableLineWith('Bruiser', 'Cogneur'));
});

test('LICENSE.md keeps its first two paragraphs unchanged', () => {
  assert.equal(paragraphs[0], 'This product includes materials from the Daggerheart System Reference Document 1.0, © Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others.');
  assert.equal(paragraphs[1], 'This product also includes materials from the Daggerheart SRD JSON build at https://github.com/seansbox/daggerheart-srd (commit c84b20b9b7c237d832eda7e64df46440eb983ed1; adversaries.json and environments.json), © Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others.');
});

test('LICENSE.md ends with exactly one appended paragraph about the French translations', () => {
  assert.equal(paragraphs.length, 3);
  assert.equal(paragraphs[2], 'The French translations in src/lib/srd/fr/ are modifications of the SRD made by this project.');
});

test('CLAUDE.md mentions src/lib/srd/fr/TERMS.md', () => {
  assert.ok(claude.includes('src/lib/srd/fr/TERMS.md'));
});

test('CLAUDE.md links docs/architecture.md', () => {
  assert.match(claude, /\]\((\.\/)?docs\/architecture\.md\)/);
});
