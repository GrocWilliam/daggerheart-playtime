// US-281: docs/architecture.md and docs/ui.md document the level-up rules and UI (documentation only, no server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\s+$/, '');
const lines = (s) => normalize(s).split('\n');

// Exact one-line texts the story specifies for docs/architecture.md (Character rules).
const RULES = [
  "- Level-up rules live in `src/lib/server/features/levelup.ts`, an extension of the characters feature: it may import `characters.ts` (rules, `characterSelect`, `characterJson`) and `srd.ts`; `characters.ts` never imports it. Pure functions (`SLOTS`, `planLevelUp`, `checkLevelUp`, `applyLevelUp`, `thresholdsAfter`, `eligibleCards`) are unit-tested without a database; `levelUp(id, body)` is the only writer.",
  "- `GET /api/characters/:id/level-up` returns the plan (available options, unmarked traits after the 5/8 clearing, eligible cards, `subclassNext`); `POST` applies the whole level-up in one transaction with the character row locked (`.for('update')`), or nothing. Every refusal is 400 `{error}`; checks that depend on the row run under the lock.",
  "- `characters.advancements` (one `{level, tier, option}` per slot spent; `proficiency` writes two) is the only record of used slots and subclass stage; `marked_traits` holds marked trait names; `proficiency` is stored, never derived from level. None of them is writable through `PATCH`; manual level edits leave them alone.",
  "- The review of a level-up shows the values of `applyLevelUp`, the same function the POST applies.",
];
// Exact line for docs/architecture.md (UI patterns).
const UI_LINE = "- Level-up is a second tunnel at `/characters/:id/level-up?step=1..5` with pure helpers in `flow.ts` (relative imports, never imported by `+page.svelte`): GET steps carrying values in the query, errors as `?step=N&invalid=<field>`, a final POST to the `default` action that calls the API and redirects 303 to the sheet. Its validation works against the GET plan, not the database. The sheet's `level-up` link shows only below level 10 with an SRD class.";

// Section body (lines after a "## " heading up to the next "## " heading or end of file).
function section(text, heading) {
  const ls = lines(text);
  const i = ls.indexOf(heading);
  if (i < 0) return null;
  const out = [];
  for (const l of ls.slice(i + 1)) {
    if (/^## /.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
}

// A test id as a token: not part of a longer id, path or query.
function hasToken(text, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w/.:-])${esc}(?![\\w/.-])`).test(text);
}

const arch = read('docs/architecture.md');
const ui = read('docs/ui.md');

test('architecture.md: the four Character rules lines follow the gear line verbatim, in order', () => {
  const ls = lines(arch);
  const gear = ls.findIndex((l) => l.startsWith('- POST and PATCH share gear validation'));
  assert.ok(gear >= 0, 'the gear line exists');
  assert.deepEqual(ls.slice(gear + 1, gear + 1 + RULES.length), RULES);
});

test('architecture.md: the Level-up UI line follows the "Character creation is the tunnel" line verbatim', () => {
  const ls = lines(arch);
  const tunnel = ls.findIndex((l) => l.startsWith('- Character creation is the tunnel'));
  assert.ok(tunnel >= 0, 'the tunnel line exists');
  assert.equal(ls[tunnel + 1], UI_LINE);
});

test('architecture.md: the Data model names proficiency, advancements and marked_traits and not the old list', () => {
  assert.ok(arch.includes('characters (with items, experiences, cards, proficiency, advancements jsonb, marked_traits jsonb)'));
  assert.ok(!arch.includes('characters (with items, experiences, cards)'), 'the old characters list is gone');
});

test('architecture.md equals the updated us-190 and us-254 frozen copies', () => {
  const want = normalize(arch);
  for (const dir of ['us-190', 'us-254']) {
    const copy = normalize(fs.readFileSync(path.join(ROOT, 'tests/acceptance', dir, 'architecture.expected.md'), 'utf8'));
    assert.equal(copy, want, `tests/acceptance/${dir}/architecture.expected.md equals docs/architecture.md`);
  }
});

test('ui.md: the Level-up page is listed after the character sheet page, with its steps', () => {
  const nav = section(ui, '## Pages and navigation');
  assert.ok(nav, '## Pages and navigation exists');
  const ls = nav.split('\n');
  const sheet = ls.findIndex((l) => l.includes('Character sheet') && l.includes('/characters/:id'));
  const page = ls.findIndex((l) => l.includes('/characters/:id/level-up?step=1..5'));
  assert.ok(sheet >= 0, 'the sheet page is listed');
  assert.ok(page > sheet, 'the level-up page is listed after the sheet page');
});

test('ui.md: navigation names the sheet level-up link and the cancel and confirm targets', () => {
  const nav = section(ui, '## Pages and navigation');
  for (const id of ['level-up', 'levelup-cancel', 'levelup-confirm']) assert.ok(hasToken(nav, id), `navigation mentions ${id}`);
});

test('ui.md: a "## Level-up" section follows "## Character tunnel" and lists the five steps', () => {
  const heads = lines(ui).filter((l) => /^## /.test(l));
  const tunnel = heads.indexOf('## Character tunnel');
  const levelUp = heads.indexOf('## Level-up');
  assert.ok(tunnel >= 0 && levelUp > tunnel, '## Level-up comes after ## Character tunnel');
  const body = section(ui, '## Level-up');
  for (const step of ['Tier achievements', 'Advancements', 'Details', 'Domain card', 'Review']) {
    assert.ok(body.includes(step), `the Level-up section names step "${step}"`);
  }
});

test('ui.md: the Level-up section names its fields', () => {
  const body = section(ui, '## Level-up');
  for (const f of ['newExperience', 'pick1', 'pick2', 'p1trait1', 'p2exp2', 'p1card', 'domainCard']) {
    assert.ok(hasToken(body, f), `the Level-up section names the field ${f}`);
  }
});

test('ui.md: the Level-up section names its test ids', () => {
  const body = section(ui, '## Level-up');
  for (const id of ['levelup-progress', 'levelup-next', 'levelup-back', 'levelup-cancel', 'levelup-summary', 'levelup-confirm']) {
    assert.ok(hasToken(body, id), `the Level-up section names ${id}`);
  }
});

test('ui.md: Screen states has a Level-up line with the error, loading and success states', () => {
  const states = section(ui, '## Screen states');
  const line = lines(states).find((l) => l.includes('Level-up'));
  assert.ok(line, 'a Level-up line exists in Screen states');
  assert.ok(line.includes('invalid='), 'the error state names ?step=N&invalid=<field>');
  assert.ok(line.includes('[role=alert]'), 'the error state names [role=alert]');
  assert.match(line, /busy/i, 'the loading state is a busy submit');
  assert.match(line, /sheet/i, 'the success state redirects to the sheet');
});

test('ui.md: the planned Test ids include the Level-up ids, and the sheet and dynamic additions', () => {
  const planned = ui.slice(ui.indexOf('New (*planned*)'));
  assert.ok(planned.length > 'New (*planned*)'.length, 'the New (*planned*) list exists');
  const levelLine = lines(planned).find((l) => /Level-up:/.test(l));
  assert.ok(levelLine, 'a "Level-up:" line exists under New (*planned*)');
  for (const id of ['level-up', 'levelup-progress', 'levelup-next', 'levelup-back', 'levelup-cancel', 'levelup-summary', 'levelup-confirm']) {
    assert.ok(hasToken(levelLine, id), `the Level-up line lists ${id}`);
  }
  assert.ok(hasToken(planned, 'proficiency'), 'the planned sheet ids include proficiency');
  assert.ok(hasToken(planned, 'subclass-stage'), 'the planned sheet ids include subclass-stage');
  const dynamic = lines(ui).find((l) => l.startsWith('Dynamic:'));
  assert.ok(dynamic && dynamic.includes('trait-marked-<name>'), 'the Dynamic test ids include trait-marked-<name>');
});

test('CLAUDE.md still links docs/architecture.md and docs/ui.md', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /\]\((\.\/)?docs\/architecture\.md\)/);
  assert.match(claude, /\]\((\.\/)?docs\/ui\.md\)/);
});
