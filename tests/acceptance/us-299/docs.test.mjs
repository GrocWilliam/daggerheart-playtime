import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const doc = readFileSync('docs/architecture.md', 'utf8');
const claude = readFileSync('CLAUDE.md', 'utf8');
const lines = doc.split('\n');

const UI = '## UI patterns';
const NEXT = '## Data model';
const uiStart = lines.indexOf(UI);
const uiEnd = lines.indexOf(NEXT);
const ui = lines.slice(uiStart + 1, uiEnd);

const REPLACED = 'Creation forms (campaign, scene, item, experience, domain card) and the character edit form open in `src/lib/components/Modal.svelte` (`kind`, `title`, `lang`, optional `params` added to the opener and Cancel hrefs, children). It renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) and `<dialog data-testid="modal-<kind>">`, open when `?new=<kind>` or `form.modal === kind`. Actions behind a modal return `fail(status, { error: <catalog key>, modal: \'<kind>\', values })`. No other dialog implementation, except the `Help` popover below.';

const INLINE = 'Inline on purpose: journal quick add, encounter Generate, loot Roll, battle damage/HP/add on the Run step.';

const ADDED = [
  'Character sheet tabs: `/characters/:id?tab=play|traits|gear|cards|notes`, parsed by `parseTab` in `src/routes/characters/[id]/tabs.ts` (unknown or missing → `play`). Tabs are plain links; only the current tab is rendered; no tab state in JavaScript. Every sheet action is posted through `actionHref(name, tab)` (`?/<name>&tab=<tab>`, from `ACTION_TAB`), redirects 303 to `?tab=<tab>` without JavaScript, and on failure returns `section` (from `ACTION_SECTION`) so the alert shows inside that section. A new sheet action must be added to both maps (`tabs.test.ts`).',
  'Character rows are shared components, used by the sheet and the Run cards: `Tracker` (one tracker or Fear row: label, `Help`, −, value, +, `Pips`), `DefenseLine` (Evasion · thresholds), `ConditionBadges`, `DamageForm`. Don\'t copy their markup into a page.',
  'Forms carry no box: the global `form` rule only sets a bottom margin. The surface card look (surface background, `3px double` accent border, `0.5rem` radius) belongs to `article`, `encounter-adversary` and `loot-entry` cards, `sheet-panel` and the `Modal` panel only. A one-field form is one flex row (`flex flex-wrap items-end gap-2`).',
];

// Headings as they were before this change, in order.
const HEADINGS = [
  '# Architecture',
  '## Layers and dependencies',
  '## Character rules',
  '## SRD content and its translation',
  '## Encounters and battle tracking',
  '## UI patterns',
  '## Data model',
];

test('the replacement bullet and the three added bullets are verbatim', () => {
  assert.ok(ui.includes(`- ${REPLACED}`), 'Modal bullet (replacement) missing verbatim under UI patterns');
  assert.ok(ui.includes(`- ${INLINE}`), 'Inline bullet (replacement) missing verbatim under UI patterns');
  for (const text of ADDED) assert.ok(ui.includes(`- ${text}`), `added bullet missing verbatim: ${text.slice(0, 40)}`);
});

test('the three added bullets sit right after the inline bullet, in order, under UI patterns', () => {
  const at = ui.indexOf(`- ${INLINE}`);
  assert.ok(at >= 0, 'inline bullet missing');
  ADDED.forEach((text, k) => assert.equal(ui[at + 1 + k], `- ${text}`, `added bullet ${k + 1} is not right after the inline bullet`));
});

test('the new bullets are inside UI patterns and before the next ## heading', () => {
  assert.ok(uiStart >= 0, '## UI patterns heading missing');
  assert.ok(uiEnd > uiStart, '## Data model must come after UI patterns');
  for (const text of [REPLACED, ...ADDED]) {
    const at = lines.indexOf(`- ${text}`);
    assert.ok(at > uiStart && at < uiEnd, `bullet not inside UI patterns: ${text.slice(0, 40)}`);
  }
  for (const line of lines.slice(uiStart + 1, uiEnd)) assert.ok(!/^#{1,2} /.test(line), 'a ## heading sits inside UI patterns');
});

test('the old loot Roll, character edit bullet text is gone', () => {
  assert.ok(!doc.includes('loot Roll, character edit,'), 'old inline bullet still present');
});

test('the old creation-forms bullet text is gone', () => {
  assert.ok(!doc.includes('Creation forms for campaign, scene, item, experience and domain card open in'), 'old modal bullet still present');
});

test('headings are unchanged and in the same order', () => {
  const headings = lines.filter((l) => l.startsWith('#'));
  assert.deepEqual(headings, HEADINGS);
});

test('the other UI patterns bullets are kept as they were', () => {
  for (const start of [
    '- Every POST form uses `use:enhance={busy}`',
    '- Character creation is the tunnel at',
    '- SRD help text is shown through `src/lib/components/Help.svelte`',
    '- Help panel: `Help.svelte` uses the native Popover API only',
    '- Selects listing SRD names on the DM screen',
    '- Layout is mobile first with `md:`',
  ]) {
    assert.ok(ui.some((l) => l.startsWith(start)), `bullet missing: ${start}`);
  }
});

test('sections other than UI patterns stay word for word', () => {
  const before = lines.slice(0, uiStart).join('\n') + '\n';
  const after = lines.slice(uiEnd).join('\n');
  const hash = createHash('sha256').update(before + after).digest('hex');
  // sha256 of the text outside UI patterns before this change (headings included).
  assert.equal(hash, 'ee1fc3191c9f8534903e0d5b8a401c39ecdc1180f8fe617adaad17440c2da3b2');
});

test('CLAUDE.md still links to docs/architecture.md', () => {
  assert.ok(claude.includes('](docs/architecture.md)'), 'CLAUDE.md must link docs/architecture.md');
});
