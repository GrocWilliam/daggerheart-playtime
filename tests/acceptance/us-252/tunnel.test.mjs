// us-252 browser and HTTP tests: tunnel step 3 picks traits and an armor; the review shows derived statistics.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const CATALOG = { en: JSON.parse(readFileSync('src/lib/i18n/en.json', 'utf8')), fr: JSON.parse(readFileSync('src/lib/i18n/fr.json', 'utf8')) };
const TRAIT_NAMES = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const OLD = ['evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots'];
const TRAITS = { agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' };
const CHAIN = 'core_armor_chainmail_armor';
const ARRAY_TEXT = {
	en: 'Assign +2, +1, +1, +0, +0 and -1, each exactly once.',
	fr: 'Attribuez +2, +1, +1, +0, +0 et -1, chacun une seule fois.'
};
const NONE = { en: 'None', fr: 'Aucune' };

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const postForm = (path, fields) =>
	fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' }, body: new URLSearchParams(fields).toString() });
const campaign = async (name = 'Traitcamp') => (await api('POST', '/api/campaigns', { name })).json.id;
const tunnel = (cid, q) => `/campaigns/${cid}/characters/new` + (q ? '?' + new URLSearchParams(q) : '');
const normal = (s) => s.replace(/[\s  ]+/g, ' ').trim();
const tid = (p, id) => p.locator(`[data-testid="${id}"]`);
const stepForm = (p) => p.locator('form', { has: tid(p, 'tunnel-next') });
const field = (p, name) => stepForm(p).locator(`input[name="${name}"]:not([type=hidden]), select[name="${name}"]`);
const query = (p) => new URL(p.url()).searchParams;
const waitStep = (p, n) => p.waitForURL((u) => new URL(u).searchParams.get('step') === String(n));
/** The numbers shown in an element (a value like 10/18 counts as one); labels carry no digits. */
const numbers = (s) => normal(s).match(/-?\d+(?:\/\d+)?/g) ?? [];

async function open(path, lang = 'en') {
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	const res = await p.goto(BASE + path);
	return { p, ctx, res };
}
async function redirectOf(path) {
	const r = await fetch(BASE + path, { redirect: 'manual' });
	assert.equal(r.status, 303, `${path} answers 303`);
	return new URL(r.headers.get('location'), BASE);
}
/** derived-* values shown on the review, keyed by the test id suffix. */
async function derived(p) {
	const block = tid(p, 'tunnel-derived');
	assert.equal(await block.count(), 1, 'one tunnel-derived block');
	const out = {};
	for (const k of ['evasion', 'thresholds', 'maxHp', 'maxStress', 'armorSlots']) {
		const el = block.locator(`[data-testid="derived-${k}"]`);
		assert.equal(await el.count(), 1, `one derived-${k}`);
		const n = numbers(await el.innerText());
		assert.equal(n.length, 1, `derived-${k} shows one value: ${await el.innerText()}`);
		out[k] = n[0];
	}
	return out;
}

// --- Criterion 1: step 3 fields ----------------------------------------------

test('step 3 has exactly the six trait selects and the armorId select, and none of the old stat inputs', async () => {
	const cid = await campaign();
	const { p, ctx, res } = await open(tunnel(cid, { step: '3', name: 'Ann', class: 'Warrior', level: '1' }));
	assert.equal(res.status(), 200);
	const names = await stepForm(p).locator('input:not([type=hidden]), select, textarea').evaluateAll((els) => els.map((e) => e.getAttribute('name')));
	assert.deepEqual([...names].sort(), [...TRAIT_NAMES, 'armorId'].sort(), 'visible step 3 fields');
	for (const n of [...TRAIT_NAMES, 'armorId']) assert.equal(await field(p, n).evaluate((e) => e.tagName), 'SELECT', `${n} is a select`);
	for (const n of OLD) assert.equal(await p.locator(`input[name="${n}"], select[name="${n}"]`).count(), 0, `no input named ${n}`);
	await ctx.close();
});

test('each trait select is required, labelled with trait.<name>, with a blank option then +2 +1 +0 -1 (en and fr)', async () => {
	const cid = await campaign();
	for (const lang of ['en', 'fr']) {
		const { p, ctx } = await open(tunnel(cid, { step: '3', name: 'Ann', class: 'Warrior', level: '1' }), lang);
		for (const n of TRAIT_NAMES) {
			const sel = field(p, n);
			assert.equal(await sel.count(), 1, `${lang}: one select ${n}`);
			assert.equal(await sel.evaluate((e) => e.required), true, `${n} required`);
			const label = await sel.evaluate((e) => {
				const l = e.labels?.[0];
				if (!l) return null;
				const c = l.cloneNode(true);
				c.querySelectorAll('select, option').forEach((x) => x.remove());
				return c.textContent;
			});
			assert.ok(label !== null, `${n} has a label`);
			assert.equal(normal(label), CATALOG[lang][`trait.${n}`], `${lang}: ${n} label`);
			const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.textContent.trim() })));
			assert.equal(opts[0].value, '', `${n}: first option is blank`);
			assert.deepEqual(opts.slice(1), [
				{ value: '2', text: '+2' }, { value: '1', text: '+1' }, { value: '0', text: '+0' }, { value: '-1', text: '-1' }
			], `${n} options`);
		}
		await ctx.close();
	}
});

test('the armor select starts with an empty-value option reading option.none (en and fr)', async () => {
	const cid = await campaign();
	for (const lang of ['en', 'fr']) {
		const { p, ctx } = await open(tunnel(cid, { step: '3', name: 'Ann', class: 'Warrior', level: '1' }), lang);
		const first = field(p, 'armorId').locator('option').first();
		assert.equal(await first.getAttribute('value'), '');
		assert.equal(normal(await first.textContent()), NONE[lang]);
		assert.equal(NONE[lang], CATALOG[lang]['option.none']);
		await ctx.close();
	}
});

// --- Criterion 2: derived values, armored and unarmored ------------------------

test('Level 3 Warrior with chainmail: review shows 10, 10/18, 6, 6, 4; unarmored 11, 3/6, 6, 6, 0 (en and fr)', async () => {
	const cid = await campaign();
	const base = { name: 'Ann', class: 'Warrior', level: '3', ...TRAITS };
	for (const lang of ['en', 'fr']) {
		let { p, ctx, res } = await open(tunnel(cid, { step: '4', ...base, armorId: CHAIN }), lang);
		assert.equal(res.status(), 200);
		assert.equal(query(p).get('step'), '4');
		assert.deepEqual(await derived(p), { evasion: '10', thresholds: '10/18', maxHp: '6', maxStress: '6', armorSlots: '4' }, `${lang} chainmail`);
		await ctx.close();
		({ p, ctx } = await open(tunnel(cid, { step: '4', ...base }), lang));
		assert.equal(query(p).get('step'), '4');
		assert.deepEqual(await derived(p), { evasion: '11', thresholds: '3/6', maxHp: '6', maxStress: '6', armorSlots: '0' }, `${lang} unarmored`);
		await ctx.close();
	}
});

// --- Criterion 3: the nine classes ---------------------------------------------

test('each of the nine classes at level 1 unarmored shows its HP and Evasion on the review', async () => {
	const cid = await campaign();
	const want = { Bard: [5, 10], Druid: [6, 10], Guardian: [7, 9], Ranger: [6, 12], Rogue: [6, 12], Seraph: [7, 9], Sorcerer: [6, 10], Warrior: [6, 11], Wizard: [5, 11] };
	const { p, ctx } = await open(tunnel(cid));
	for (const [cls, [hp, ev]] of Object.entries(want)) {
		await p.goto(BASE + tunnel(cid, { step: '4', name: 'Ann', class: cls, level: '1', ...TRAITS }));
		assert.equal(query(p).get('step'), '4', `${cls} stays on step 4`);
		const d = await derived(p);
		assert.deepEqual([d.maxHp, d.evasion], [String(hp), String(ev)], `${cls} HP/Evasion`);
	}
	await ctx.close();
});

// --- Criterion 4: unarmored thresholds by level -------------------------------

test('unarmored thresholds are 1/2 at level 1 and 10/20 at level 10', async () => {
	const cid = await campaign();
	for (const [level, th] of [['1', '1/2'], ['10', '10/20']]) {
		const { p, ctx } = await open(tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level, ...TRAITS }));
		assert.equal(query(p).get('step'), '4');
		assert.equal((await derived(p)).thresholds, th, `level ${level}`);
		await ctx.close();
	}
});

// --- Criterion 5: invalid traits -------------------------------------------------

test('leaving step 3 with traits 2,2,1,0,0,-1 redirects to ?step=3&invalid=traits with the tunnel.traitsArray alert (en and fr)', async () => {
	const cid = await campaign();
	for (const lang of ['en', 'fr']) {
		const { p, ctx } = await open(tunnel(cid, { step: '3', name: 'Ann', class: 'Warrior', level: '1' }), lang);
		const bad = { ...TRAITS, strength: '2' };
		for (const n of TRAIT_NAMES) await field(p, n).selectOption(bad[n]);
		await Promise.all([p.waitForURL((u) => new URL(u).searchParams.get('invalid') === 'traits'), tid(p, 'tunnel-next').click()]);
		assert.equal(query(p).get('step'), '3');
		const alert = p.locator('[role=alert]');
		assert.equal(await alert.count(), 1, `${lang}: one alert`);
		assert.equal(normal(await alert.innerText()), ARRAY_TEXT[lang], `${lang} alert text`);
		assert.equal(CATALOG[lang]['tunnel.traitsArray'], ARRAY_TEXT[lang], `${lang} catalog key tunnel.traitsArray`);
		await ctx.close();
	}
	const loc = await redirectOf(tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level: '1', ...TRAITS, strength: '2' }));
	assert.equal(loc.pathname, tunnel(cid));
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'traits');
});

test('a blank trait redirects to ?step=3&invalid=traits with the tunnel.traitsArray alert', async () => {
	const cid = await campaign();
	const url = tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level: '1', ...TRAITS, presence: '' });
	const loc = await redirectOf(url);
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'traits');
	for (const lang of ['en', 'fr']) {
		const { p, ctx } = await open(url, lang);
		assert.equal(query(p).get('invalid'), 'traits');
		assert.equal(normal(await p.locator('[role=alert]').innerText()), ARRAY_TEXT[lang]);
		await ctx.close();
	}
	const missing = await redirectOf(tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level: '1' }));
	assert.equal(missing.searchParams.get('step'), '3', 'no traits at all');
	assert.equal(missing.searchParams.get('invalid'), 'traits');
});

// --- Criterion 6: armor above the tier, unknown armor ------------------------------

test('an armor above the level tier (tier 2 at level 1) redirects to ?step=3&invalid=armorId with an alert', async () => {
	const cid = await campaign();
	const url = tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level: '1', ...TRAITS, armorId: 'core_armor_improved_gambeson_armor' });
	const loc = await redirectOf(url);
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'armorId');
	const { p, ctx } = await open(url);
	assert.equal(query(p).get('invalid'), 'armorId');
	assert.equal(await p.locator('[role=alert]').count(), 1, 'an alert');
	await ctx.close();
});

test('boundary: the same tier 2 armor at level 2 (tier 2) stays on step 4', async () => {
	const cid = await campaign();
	const r = await fetch(BASE + tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level: '2', ...TRAITS, armorId: 'core_armor_improved_gambeson_armor' }), { redirect: 'manual' });
	assert.equal(r.status, 200);
});

test('an unknown armor id redirects to ?step=3&invalid=armorId', async () => {
	const cid = await campaign();
	const loc = await redirectOf(tunnel(cid, { step: '4', name: 'Ann', class: 'Warrior', level: '1', ...TRAITS, armorId: 'core_armor_nope' }));
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'armorId');
});

// Criterion 7 (tier 1 armors at level 1 = armorGroups(1, lang)) is in armors.unit.ts.

// --- Criterion 8: review shows signed traits and the armor -------------------------

test('the review shows each trait signed and the armor localized name with its lang, or option.none (en and fr)', async () => {
	const cid = await campaign();
	const names = { en: 'Chainmail Armor', fr: 'Armure de mailles' };
	const base = { name: 'Ann', class: 'Warrior', level: '1', ancestry: 'Clank', community: 'Highborne', ...TRAITS };
	for (const lang of ['en', 'fr']) {
		let { p, ctx } = await open(tunnel(cid, { step: '4', ...base, armorId: CHAIN }), lang);
		const summary = tid(p, 'tunnel-summary');
		let text = normal(await summary.innerText());
		for (const n of TRAIT_NAMES) assert.ok(text.includes(CATALOG[lang][`trait.${n}`]), `${lang}: summary names ${n}`);
		for (const s of ['+2', '+1', '+0', '-1']) assert.ok(text.split(' ').includes(s), `${lang}: summary shows ${s}: ${text}`);
		const armor = summary.locator(`[lang="${lang}"]`).filter({ hasText: names[lang] });
		assert.equal(await armor.count(), 1, `${lang}: armor name ${names[lang]} with lang=${lang}`);
		assert.ok(!text.includes(NONE[lang]), `${lang}: no ${NONE[lang]} when armored`);
		await ctx.close();
		({ p, ctx } = await open(tunnel(cid, { step: '4', ...base }), lang));
		text = normal(await tid(p, 'tunnel-summary').innerText());
		assert.ok(text.includes(NONE[lang]), `${lang}: unarmored shows ${NONE[lang]}`);
		assert.ok(!text.includes(names[lang]), `${lang}: no armor name when unarmored`);
		await ctx.close();
	}
});

// --- Criterion 9: full creation without JavaScript ---------------------------------

test('without JavaScript, steps 1 to 4 then tunnel-create end on the sheet with the traits, armor and computed stats', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(tunnel(cid));
	await field(p, 'name').fill('Brakka');
	await field(p, 'class').selectOption('Warrior');
	await field(p, 'level').fill('3');
	await Promise.all([waitStep(p, 2), tid(p, 'tunnel-next').click()]);
	await Promise.all([waitStep(p, 3), tid(p, 'tunnel-next').click()]);
	for (const n of TRAIT_NAMES) await field(p, n).selectOption(TRAITS[n]);
	await field(p, 'armorId').selectOption(CHAIN);
	await Promise.all([waitStep(p, 4), tid(p, 'tunnel-next').click()]);
	assert.equal(query(p).get('invalid'), null);
	assert.deepEqual(await derived(p), { evasion: '10', thresholds: '10/18', maxHp: '6', maxStress: '6', armorSlots: '4' });
	await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), tid(p, 'tunnel-create').click()]);
	const newId = new URL(p.url()).pathname.split('/').pop();
	assert.equal((await tid(p, 'character-name').first().innerText()).trim(), 'Brakka');
	for (const n of TRAIT_NAMES) assert.equal(Number((await tid(p, `trait-${n}`).innerText()).trim()), Number(TRAITS[n]), `sheet trait ${n}`);
	const equipment = tid(p, 'sheet-equipment');
	assert.equal(await equipment.locator('select[name="armorId"]').inputValue(), CHAIN, 'armor equipped in the picker');
	assert.ok((await tid(p, 'equipped-armor').innerText()).includes('Chainmail Armor'), 'equipped armor shown');
	assert.equal((await tid(p, 'evasion').innerText()).trim(), '10');
	assert.equal(normal(await tid(p, 'thresholds').innerText()), '10/18');
	assert.equal(normal(await tid(p, 'hp').innerText()), '0/6');
	assert.equal(normal(await tid(p, 'stress').innerText()), '0/6');
	assert.equal(normal(await tid(p, 'armor').innerText()), '0/4');
	const ch = (await api('GET', `/api/characters/${newId}`)).json;
	assert.equal(ch.armorId, CHAIN);
	assert.equal(ch.evasion, 10);
	assert.deepEqual([ch.majorThreshold, ch.severeThreshold], [10, 18]);
	await ctx.close();
});

// --- Criterion 10: hand-made POST without valid traits -------------------------------

test('a hand-made POST to the step 4 action without valid traits redirects to ?step=3&invalid=traits and creates nothing', async () => {
	const cid = await campaign();
	const s1 = { name: 'Ann', class: 'Warrior', level: '1' };
	for (const body of [s1, { ...s1, ...TRAITS, agility: '1' }, { ...s1, ...TRAITS, knowledge: '' }]) {
		const r = await postForm(tunnel(cid, { step: '4', ...s1, ...TRAITS }), body);
		assert.equal(r.status, 303, JSON.stringify(body));
		const loc = new URL(r.headers.get('location'), BASE);
		assert.equal(loc.pathname, tunnel(cid));
		assert.equal(loc.searchParams.get('step'), '3', JSON.stringify(body));
		assert.equal(loc.searchParams.get('invalid'), 'traits', JSON.stringify(body));
	}
	assert.equal((await api('GET', `/api/campaigns/${cid}`)).json.characters.length, 0, 'nothing created');
});

test('a hand-made POST with an armor above the tier redirects to ?step=3&invalid=armorId and creates nothing', async () => {
	const cid = await campaign();
	const body = { name: 'Ann', class: 'Warrior', level: '1', ...TRAITS, armorId: 'core_armor_improved_gambeson_armor' };
	const r = await postForm(tunnel(cid, { step: '4', ...body }), body);
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'armorId');
	assert.equal((await api('GET', `/api/campaigns/${cid}`)).json.characters.length, 0, 'nothing created');
});

// --- Criterion 11: docs ---------------------------------------------------------------

test('docs/ui.md lists the new test ids in the Character tunnel section and the test id summary, and no longer says traits are planned', () => {
	const ui = readFileSync('docs/ui.md', 'utf8');
	const section = (h) => {
		const i = ui.indexOf(h);
		assert.ok(i >= 0, `docs/ui.md has ${h}`);
		const rest = ui.slice(i + h.length);
		const j = rest.search(/\n## /);
		return j < 0 ? rest : rest.slice(0, j);
	};
	const ids = ['tunnel-derived', 'derived-evasion', 'derived-thresholds', 'derived-maxHp', 'derived-maxStress', 'derived-armorSlots'];
	for (const [h, s] of [['## Character tunnel', section('## Character tunnel')], ['## Test ids', section('## Test ids')]])
		for (const id of ids) assert.ok(s.includes(id), `${h} lists ${id}`);
	for (const line of ui.split('\n')) assert.ok(!(/trait/i.test(line) && /planned/i.test(line)), `still planned: ${line}`);
});
