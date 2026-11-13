import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openSceneMore } from '../support/scenes.mjs';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const CH = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
async function setup(levels = []) {
	const c = (await api('POST', '/api/campaigns', { name: 'Camp' })).json;
	for (const [i, level] of levels.entries()) await api('POST', `/api/campaigns/${c.id}/characters`, { ...CH, name: `Hero${i}`, level });
	const s = (await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Ambush' })).json;
	return { c, s, url: `/campaigns/${c.id}?step=build` };
}
const stored = async (c, s) => (await api('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id).encounter;
async function open(path, lang = 'en') {
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	await p.goto(BASE + path);
	await openSceneMore(scene(p));
	return p;
}
const scene = (p) => p.locator('[data-testid=scene]', { hasText: 'Ambush' });
// US-341: a non-current scene's controls sit in the closed scene-more disclosure
const press = async (p, loc) => { await openSceneMore(scene(p)); await Promise.all([p.waitForLoadState('load'), loc.click()]); await openSceneMore(scene(p)); };
const budget = async (p) => {
	const t = (await scene(p).locator('[data-testid=encounter-budget]').textContent()).replace(/\s+/g, ' ');
	const m = t.match(/(\d+)\s*\/\s*(\d+)/);
	assert.ok(m, `budget text "${t}" should contain 'spent / budget'`);
	return { spent: +m[1], budget: +m[2] };
};
const generate = async (p) => {
	await press(p, scene(p).getByRole('button', { name: /^generate encounter$/i }));
};

test('Generate encounter shows adversaries with their stats and the budget', async () => {
	const { c, s, url } = await setup([1, 1]);
	const p = await open(url);
	assert.equal(await scene(p).locator('[data-testid=encounter-adversary]').count(), 0);
	await generate(p);
	const enc = await stored(c, s);
	assert.ok(enc && enc.adversaries.length > 0, 'encounter stored through the API');
	const cards = scene(p).locator('[data-testid=encounter-adversary]');
	assert.ok((await cards.count()) >= enc.adversaries.length);
	for (const a of enc.adversaries) {
		const srd = (await api('GET', `/api/srd/adversaries/${a.id}`)).json;
		const esc = a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const card = cards.filter({ hasText: new RegExp('^\\s*' + esc + ' ×') }).first();
		const text = (await card.textContent()).replace(/\s+/g, ' ');
		assert.ok(text.includes(a.name), 'name');
		assert.ok(text.includes(String(a.count)), 'count');
		assert.ok(text.includes(a.role), `role ${a.role} in "${text}"`);
		assert.ok(text.includes(String(srd.difficulty)), 'difficulty');
		assert.ok(text.includes(String(srd.hp)), 'HP');
		assert.ok(text.includes(String(srd.stress)), 'Stress');
		for (const n of String(srd.thresholds).match(/\d+/g) ?? []) assert.ok(text.includes(n), `threshold ${n}`);
		assert.ok(text.includes(srd.attack), 'attack');
		const [dice, ...kinds] = srd.damage.trim().split(/\s+/);
			assert.ok(text.includes(dice), 'damage dice');
			// the page shows the type spelled out ("physical or magical" for phy/mag)
			const full = { phy: 'physical', mag: 'magical' };
			for (const k of (kinds[0] ?? '').toLowerCase().split('/')) if (full[k]) assert.ok(text.includes(full[k]), `damage type ${k}`);
		const details = card.locator('details');
		assert.ok((await details.count()) >= 1, 'features in <details>');
		const featName = srd.feature[0].name.split(' - ')[0];
		assert.ok((await details.first().textContent()).includes(featName), `feature ${featName}`);
	}
	const b = await budget(p);
	assert.equal(b.spent, enc.spent);
	assert.equal(b.budget, enc.budget);
});

test('the generate button reads Regenerate once an encounter exists and replaces it', async () => {
	const { c, s, url } = await setup([1, 1]);
	const p = await open(url);
	await generate(p);
	assert.equal(await scene(p).getByRole('button', { name: /^generate encounter$/i }).count(), 0);
	await scene(p).getByLabel(/^party size/i).fill('5');
	await press(p, scene(p).getByRole('button', { name: /^regenerate$/i }));
	const enc = await stored(c, s);
	assert.equal(enc.partySize, 5);
	assert.equal((await budget(p)).budget, enc.budget);
});

test('adjustment checkboxes are sent with the generate form', async () => {
	const { c, s, url } = await setup([1, 1]);
	const p = await open(url);
	await scene(p).getByLabel(/easier/i).check();
	await scene(p).getByLabel(/damage boost/i).check();
	await generate(p);
	const enc = await stored(c, s);
	assert.deepEqual([...enc.adjustments].sort(), ['damageBoost', 'easier']);
	await scene(p).getByLabel(/harder/i).check();
	await press(p, scene(p).getByRole('button', { name: /^regenerate$/i }));
	assert.ok((await stored(c, s)).adjustments.includes('harder'));
});

test('changing a count updates the budget, over budget is flagged, removing updates it too', async () => {
	const { c, s, url } = await setup([1, 1]);
	const p = await open(url);
	await generate(p);
	const before = await budget(p);
	const color = () => scene(p).locator('[data-testid=encounter-budget]').evaluate((e) => getComputedStyle(e).color);
	const normal = await color();
	const name = (await stored(c, s)).adversaries[0].name;
	const byName = (n) => scene(p).locator('[data-testid=encounter-adversary]').filter({ hasText: new RegExp('^\\s*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ×') }).first();
	const card = byName(name);
	await card.locator('input[type=number]').fill('30');
	await press(p, card.getByRole('button', { name: /update/i }));
	const enc = await stored(c, s);
	assert.equal(enc.adversaries.find((a) => a.name === name).count, 30);
	const after = await budget(p);
	assert.equal(after.spent, enc.spent);
	assert.notEqual(after.spent, before.spent);
	assert.ok(after.spent > after.budget);
	assert.notEqual(await color(), normal, 'over budget is visibly flagged');
	// remove
	const target = byName(name);
	await press(p, target.getByRole('button', { name: /remove/i }));
	const enc2 = await stored(c, s);
	assert.ok(!enc2.adversaries.some((a) => a.name === name));
	const b2 = await budget(p).catch(() => null);
	if (enc2.adversaries.length) assert.equal(b2.spent, enc2.spent);
	assert.ok(enc2.spent < enc.spent);
});

test('the delete button removes the whole encounter', async () => {
	const { c, s, url } = await setup([1, 1]);
	const p = await open(url);
	await generate(p);
	await press(p, scene(p).getByRole('button', { name: /delete encounter/i }));
	assert.equal(await stored(c, s), null);
	assert.equal(await scene(p).locator('[data-testid=encounter-adversary]').count(), 0);
	assert.equal(await scene(p).getByRole('button', { name: /^generate encounter$/i }).count(), 1);
	assert.equal(await scene(p).locator('[data-testid=scene-title], h2, h3').count() >= 0, true);
	assert.equal(await scene(p).count(), 1, 'the scene itself remains');
});

test('form defaults match the campaign party size and tier', async () => {
	const { url } = await setup([5, 2, 1]);
	const p = await open(url);
	assert.equal(await scene(p).getByLabel(/^party size/i).inputValue(), '3');
	assert.equal(await scene(p).getByLabel(/^tier/i).inputValue(), '3');
	const empty = await setup([]);
	const q = await open(empty.url);
	assert.equal(await scene(q).getByLabel(/^party size/i).inputValue(), '1');
	assert.equal(await scene(q).getByLabel(/^tier/i).inputValue(), '1');
});

test('French: the encounter section is translated and works', async () => {
	const { c, s, url } = await setup([1, 1]);
	const p = await open(url, 'fr');
	const form = scene(p).locator('form', { has: p.locator('input[type=checkbox]') }).first();
	const btn = form.locator('button').last();
	const label = (await btn.textContent()).trim();
	assert.ok(label && !/generate|encounter/i.test(label), `French button, got "${label}"`);
	assert.equal(await form.getByLabel(/party size|tier|easier|harder/i).count(), 0, 'no English labels');
	await press(p, btn);
	const enc = await stored(c, s);
	assert.ok(enc?.adversaries.length > 0);
	const cards = scene(p).locator('[data-testid=encounter-adversary]');
	assert.ok((await cards.count()) > 0);
	const text = await cards.first().textContent();
	const frSrd = await (await fetch(`${new URL(p.url()).origin}/api/srd/adversaries/${enc.adversaries[0].id}`, { headers: { cookie: 'lang=fr' } })).json();
	assert.ok(text.includes(frSrd.nameLocalized), 'tier 1 SRD names are shown in French');
	assert.deepEqual(await budget(p), { spent: enc.spent, budget: enc.budget });
	const again = (await scene(p).locator('form', { has: p.locator('input[type=checkbox]') }).first().locator('button').last().textContent()).trim();
	assert.notEqual(again, label, 'button changes to the regenerate label');
});
