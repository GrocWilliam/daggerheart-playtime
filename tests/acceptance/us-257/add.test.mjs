// US-257: add adversaries mid-fight from the Run step. Run by run.sh against `node build` (BASE_URL).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const EN = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
const FR = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
const SRD_COUNT = JSON.parse(fs.readFileSync('src/lib/srd/adversaries.json', 'utf8').replace(/^\uFEFF/, '')).length;
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : null, text };
};
const RAT = 'adv_giant_rat', BUR = 'adv_acid_burrower';
async function setup({ encounter = true } = {}) {
	const c = await call('POST', '/api/campaigns', { name: 'Add' });
	assert.equal(c.status, 201, c.text);
	const s = await call('POST', `/api/campaigns/${c.json.id}/scenes`, { title: 'Fight' });
	assert.equal(s.status, 201, s.text);
	assert.equal((await call('PATCH', `/api/campaigns/${c.json.id}/scenes/${s.json.id}`, { status: 'current' })).status, 200);
	const url = `/api/campaigns/${c.json.id}/scenes/${s.json.id}/encounter`;
	if (encounter) {
		assert.equal((await call('POST', url, { partySize: 4, tier: 1, seed: 1 })).status, 200);
		const p = await call('PATCH', url, { adversaries: [{ id: RAT, count: 2 }] });
		assert.equal(p.status, 200, p.text);
	}
	return { id: c.json.id, url, run: `${BASE}/campaigns/${c.json.id}` };
}
async function open(sc, { lang = 'en', js = true, width } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: width ? { width, height: 800 } : undefined });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage(); page.setDefaultTimeout(4000);
	const r = await page.goto(sc.run);
	assert.equal(r.status(), 200);
	return { ctx, page };
}
const row = (page, adv, i) => page.locator(`[data-testid="battle-unit"][data-adversary="${adv}"][data-index="${i}"]`);
const card = (page, adv) => page.locator(`[data-testid="encounter-adversary"][data-adversary="${adv}"]`);
const spentOf = async (page) => {
	const m = (await page.locator('[data-testid="encounter-budget"]').textContent()).match(/(\d+)\s*\/\s*\d+/);
	return Number(m[1]);
};
async function until(fn, msg) {
	for (let n = 0; n < 50; n++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); }
	assert.fail(msg);
}
async function add(page, adv, count) {
	const f = page.locator('[data-testid="battle-add"]');
	await f.locator('[data-testid="battle-add-adversary"]').selectOption(adv);
	if (count !== undefined) await f.locator('[data-testid="battle-add-count"]').fill(String(count));
	await f.locator('[data-testid="battle-add-submit"]').click();
}

test('battle-add is outside every encounter-adversary and after the last card; absent without an encounter', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	assert.equal(await page.locator('[data-testid="battle-add"]').count(), 1);
	assert.equal(await page.locator('[data-testid="encounter-adversary"] [data-testid="battle-add"]').count(), 0);
	const after = await page.evaluate(() => {
		const f = document.querySelector('[data-testid="battle-add"]');
		const cards = [...document.querySelectorAll('[data-testid="encounter-adversary"]')];
		return cards.every((c) => !!(c.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING));
	});
	assert.ok(after);
	await ctx.close();
	const none = await setup({ encounter: false });
	const o = await open(none);
	assert.equal(await o.page.locator('[data-testid="battle-add"]').count(), 0);
	await o.ctx.close();
});

test('select: blank first option, 4 tier optgroups, one labelled option per adversary, no Acid Burrower text', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	const sel = page.locator('[data-testid="battle-add"] [data-testid="battle-add-adversary"]');
	assert.equal(await sel.getAttribute('name'), 'adversaryId');
	assert.equal(await sel.locator('option').first().getAttribute('value'), '');
	const groups = await sel.locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label));
	assert.deepEqual(groups, ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4']);
	const opts = await sel.locator('optgroup option').evaluateAll((os) => os.map((o) => ({ label: o.getAttribute('label'), lang: o.getAttribute('lang'), value: o.value, text: o.textContent })));
	assert.equal(opts.length, SRD_COUNT);
	for (const o of opts) {
		assert.ok(o.label && o.label.length > 0, o.value);
		assert.ok(o.lang && o.lang.length > 0, o.value);
		assert.equal(o.text, '');
	}
	assert.ok(opts.some((o) => o.value === BUR && o.label === 'Acid Burrower'));
	await ctx.close();
});

test('page text does not contain Acid Burrower while it is only an option', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await page.locator('[data-testid="battle-add-adversary"]').waitFor();
	assert.equal((await page.evaluate(() => document.documentElement.innerText)).includes('Acid Burrower'), false);
	await ctx.close();
});

for (const lang of ['en', 'fr']) {
	test(`count input, submit text and labels (${lang})`, async () => {
		const T = lang === 'en' ? EN : FR;
		const sc = await setup();
		const { ctx, page } = await open(sc, { lang });
		const f = page.locator('[data-testid="battle-add"]');
		const c = f.locator('[data-testid="battle-add-count"]');
		assert.equal(await c.inputValue(), '1');
		assert.equal(await c.getAttribute('min'), '1');
		assert.equal(await c.getAttribute('max'), '20');
		const b = f.locator('[data-testid="battle-add-submit"]');
		assert.equal((await b.textContent()).trim(), lang === 'en' ? 'Add adversary' : 'Ajouter un adversaire');
		assert.equal((await b.textContent()).trim(), T['battle.add']);
		const box = await b.boundingBox();
		assert.ok(box.width >= 43.5 && box.height >= 43.5, JSON.stringify(box));
		const name = async (loc) => loc.evaluate((e) => {
			const l = e.labels && e.labels[0];
			return (l ? l.textContent : e.getAttribute('aria-label') || '').trim();
		});
		assert.equal(await name(f.locator('[data-testid="battle-add-adversary"]')), T['battle.addWhich']);
		assert.equal(await name(c), T['battle.addQuantity']);
		await ctx.close();
	});
}

test('add one giant rat: 3 rows, new one at index 2 is 0/1, budget equals PATCH rat x3', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await add(page, RAT, 1);
	await until(async () => (await card(page, RAT).locator('[data-testid="battle-unit"]').count()) === 3, 'three rows');
	assert.equal((await row(page, RAT, 2).locator('[data-testid="unit-hp"]').textContent()).trim(), '0/1');
	const ref = await setup();
	const p = await call('PATCH', ref.url, { adversaries: [{ id: RAT, count: 3 }] });
	assert.equal(p.status, 200, p.text);
	await until(async () => (await spentOf(page)) === p.json.spent, 'spent matches');
	await ctx.close();
});

test('add two acid burrowers: new last card with 2 rows at 0/8, spent grows', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	const before = await spentOf(page);
	await add(page, BUR, 2);
	await until(async () => (await card(page, BUR).count()) === 1, 'new card');
	const ids = await page.locator('[data-testid="encounter-adversary"]').evaluateAll((cs) => cs.map((c) => c.getAttribute('data-adversary')));
	assert.equal(ids[ids.length - 1], BUR);
	assert.equal(await card(page, BUR).locator('[data-testid="battle-unit"]').count(), 2);
	for (const i of [0, 1]) assert.equal((await row(page, BUR, i).locator('[data-testid="unit-hp"]').textContent()).trim(), '0/8');
	await until(async () => (await spentOf(page)) > before, 'spent grows');
	await ctx.close();
});

test('no JS: add posts, stays on the Run step and shows the added copy', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc, { js: false });
	await add(page, RAT, 1);
	await until(async () => (await card(page, RAT).locator('[data-testid="battle-unit"]').count()) === 3, 'three rows');
	assert.notEqual(new URL(page.url()).searchParams.get('step'), 'build');
	assert.equal(await page.locator('[data-testid="battle-add"]').count(), 1);
	await ctx.close();
});

test('no JS: count 21 without max shows error.invalid and adds nothing', async () => {
	const sc = await setup();
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	await ctx.route(sc.run, async (route) => {
		if (route.request().method() !== 'GET') return route.continue();
		const resp = await route.fetch();
		const html = (await resp.text()).replace(/(<input[^>]*data-testid="battle-add-count"[^>]*?)\smax="20"/g, '$1').replace(/(<input[^>]*?)\smax="20"([^>]*data-testid="battle-add-count")/g, '$1$2');
		await route.fulfill({ response: resp, body: html });
	});
	const page = await ctx.newPage(); page.setDefaultTimeout(4000);
	await page.goto(sc.run);
	const c = page.locator('[data-testid="battle-add-count"]');
	assert.equal(await c.getAttribute('max'), null);
	await add(page, BUR, 21);
	await until(async () => (await page.content()).includes(EN['error.invalid']), 'error shown');
	const e = await call('GET', `/api/campaigns/${sc.id}/scenes`);
	const scene = e.json.find ? e.json.find((x) => x.encounter) : null;
	if (scene) assert.deepEqual(scene.encounter.adversaries.map((a) => a.id), [RAT]);
	assert.equal(await card(page, BUR).count(), 0);
	assert.equal(await card(page, RAT).locator('[data-testid="battle-unit"]').count(), 2);
	await ctx.close();
});

test('360px viewport: no sideways scroll with the add form shown', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc, { width: 360 });
	await page.locator('[data-testid="battle-add"]').waitFor();
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360));
	await ctx.close();
});

test('Build step has no battle-add; untouched encounter JSON has no hpMarked keys', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await page.goto(sc.run + '?step=build');
	assert.equal(await page.locator('[data-testid="battle-add"]').count(), 0);
	await ctx.close();
	const e = await call('PATCH', sc.url, { adversaries: [{ id: RAT, count: 2 }] });
	assert.equal(e.status, 200, e.text);
	assert.equal(e.text.includes('hpMarked'), false);
});
