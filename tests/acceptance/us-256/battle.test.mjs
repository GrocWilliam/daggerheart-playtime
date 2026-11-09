// US-256: battle tracker on the Run step. Run by run.sh against `node build` (BASE_URL).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const EN = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
const FR = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : null, text };
};
async function setup(list) {
	const c = await call('POST', '/api/campaigns', { name: 'Battle' });
	assert.equal(c.status, 201, c.text);
	const s = await call('POST', `/api/campaigns/${c.json.id}/scenes`, { title: 'Fight' });
	assert.equal(s.status, 201, s.text);
	assert.equal((await call('PATCH', `/api/campaigns/${c.json.id}/scenes/${s.json.id}`, { status: 'current' })).status, 200);
	const url = `/api/campaigns/${c.json.id}/scenes/${s.json.id}/encounter`;
	assert.equal((await call('POST', url, { partySize: 4, tier: 1, seed: 1 })).status, 200);
	const p = await call('PATCH', url, { adversaries: list ?? [{ id: 'adv_acid_burrower', count: 1 }, { id: 'adv_giant_rat', count: 3 }, { id: 'adv_tiny_green_ooze', count: 1 }] });
	assert.equal(p.status, 200, p.text);
	return { id: c.json.id, run: `${BASE}/campaigns/${c.json.id}` };
}
async function open(sc, { lang = 'en', js = true, width } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: width ? { width, height: 800 } : undefined });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage(); page.setDefaultTimeout(4000);
	const r = await page.goto(sc.run);
	assert.equal(r.status(), 200);
	return { ctx, page };
}
const row = (page, adv, i = 0) => page.locator(`[data-testid="battle-unit"][data-adversary="${adv}"][data-index="${i}"]`);
const BUR = 'adv_acid_burrower', RAT = 'adv_giant_rat', OOZE = 'adv_tiny_green_ooze';
async function waitHp(page, adv, i, text) {
	const loc = row(page, adv, i).locator('[data-testid="unit-hp"]');
	for (let n = 0; n < 40; n++) {
		if ((await loc.count()) === 1 && (await loc.textContent()).trim() === text) return;
		await page.waitForTimeout(100);
	}
	assert.equal((await loc.textContent()).trim(), text);
}
async function hit(page, adv, i, amount, expected, js = true) {
	const r = row(page, adv, i);
	await r.locator('[data-testid="unit-damage"]').fill(String(amount));
	await r.locator('[data-testid="unit-hit"]').click();
	await waitHp(page, adv, i, expected);
}
async function click(page, adv, i, tid, expected) {
	await row(page, adv, i).locator(`[data-testid="${tid}"]`).click();
	await waitHp(page, adv, i, expected);
}

test('rows: giant rat shows 3 rows with index 0..2, names Giant Rat 1..3 with lang; burrower has no number', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	for (const i of [0, 1, 2]) {
		const r = row(page, RAT, i);
		assert.equal(await r.count(), 1);
		const name = r.locator(`[lang]`).filter({ hasText: `Giant Rat ${i + 1}` });
		assert.ok((await name.count()) >= 1, `name ${i}`);
		assert.equal((await name.first().textContent()).trim(), `Giant Rat ${i + 1}`);
	}
	assert.equal(await page.locator(`[data-testid="battle-unit"][data-adversary="${RAT}"]`).count(), 3);
	const b = row(page, BUR);
	assert.equal(await b.count(), 1);
	const n = b.locator('[lang]').filter({ hasText: 'Acid Burrower' });
	assert.equal((await n.first().textContent()).trim(), 'Acid Burrower');
	await ctx.close();
});

test('initial HP: 0/8 burrower, 0/1 rats, 0/2 ooze', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await waitHp(page, BUR, 0, '0/8');
	for (const i of [0, 1, 2]) await waitHp(page, RAT, i, '0/1');
	await waitHp(page, OOZE, 0, '0/2');
	await ctx.close();
});

for (const lang of ['en', 'fr']) {
	test(`burrower damage 7,8,14,15 gives 1,3,5,8 (cap), defeated badge, then -1 restores (${lang})`, async () => {
		const T = lang === 'en' ? EN : FR;
		const sc = await setup();
		const { ctx, page } = await open(sc, { lang });
		await hit(page, BUR, 0, 7, '1/8');
		await hit(page, BUR, 0, 8, '3/8');
		await hit(page, BUR, 0, 14, '5/8');
		await hit(page, BUR, 0, 15, '8/8');
		const r = row(page, BUR);
		assert.equal((await r.locator('[data-testid="unit-defeated"]').textContent()).trim(), T['battle.defeated']);
		assert.equal(await r.locator('[data-testid="unit-damage"]').count(), 0);
		await click(page, BUR, 0, 'unit-hp-minus', '7/8');
		assert.equal(await r.locator('[data-testid="unit-defeated"]').count(), 0);
		assert.equal(await r.locator('[data-testid="unit-damage"]').count(), 1);
		await ctx.close();
	});
}

test('rat 2 damage 1 is 1/1 defeated, others 0/1, persisted after reload', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await hit(page, RAT, 1, 1, '1/1');
	assert.equal(await row(page, RAT, 1).locator('[data-testid="unit-defeated"]').count(), 1);
	assert.equal(await row(page, RAT, 0).locator('[data-testid="unit-defeated"]').count(), 0);
	await waitHp(page, RAT, 0, '0/1');
	await waitHp(page, RAT, 2, '0/1');
	await page.reload();
	await waitHp(page, RAT, 0, '0/1');
	await waitHp(page, RAT, 1, '1/1');
	await waitHp(page, RAT, 2, '0/1');
	await ctx.close();
});

test('ooze: damage 3 shows 1/2; fresh encounter damage 4 shows 2/2', async () => {
	let sc = await setup();
	let { ctx, page } = await open(sc);
	await hit(page, OOZE, 0, 3, '1/2');
	await ctx.close();
	sc = await setup();
	({ ctx, page } = await open(sc));
	await hit(page, OOZE, 0, 4, '2/2');
	await ctx.close();
});

test('+1/-1 limits: -1 on fresh ooze stays 0/2; +1 x3 shows 1/2, 2/2, 2/2', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await row(page, OOZE).locator('[data-testid="unit-hp-minus"]').click();
	await page.waitForTimeout(500);
	await waitHp(page, OOZE, 0, '0/2');
	await click(page, OOZE, 0, 'unit-hp-plus', '1/2');
	await click(page, OOZE, 0, 'unit-hp-plus', '2/2');
	await row(page, OOZE).locator('[data-testid="unit-hp-plus"]').click();
	await page.waitForTimeout(500);
	await waitHp(page, OOZE, 0, '2/2');
	await ctx.close();
});

test('accessible names (en, fr) and 44x44 targets', async () => {
	const sc = await setup();
	for (const lang of ['en', 'fr']) {
		const T = lang === 'en' ? EN : FR;
		const { ctx, page } = await open(sc, { lang });
		const r = row(page, BUR);
		const name = lang === 'en' ? 'Acid Burrower' : null;
		const labels = {
			'unit-damage': await r.locator('[data-testid="unit-damage"]').getAttribute('aria-label'),
			'unit-hp-plus': await r.locator('[data-testid="unit-hp-plus"]').getAttribute('aria-label'),
			'unit-hp-minus': await r.locator('[data-testid="unit-hp-minus"]').getAttribute('aria-label')
		};
		const pre = (k) => T[k].replace('{name}', '');
		assert.ok(labels['unit-damage'].startsWith(pre('battle.amount')), labels['unit-damage']);
		assert.ok(labels['unit-hp-plus'].startsWith(pre('battle.hpUp')), labels['unit-hp-plus']);
		assert.ok(labels['unit-hp-minus'].startsWith(pre('battle.hpDown')), labels['unit-hp-minus']);
		if (name) {
			assert.equal(labels['unit-damage'], 'Damage to Acid Burrower');
			assert.equal(labels['unit-hp-plus'], 'Mark one HP on Acid Burrower');
			assert.equal(labels['unit-hp-minus'], 'Clear one HP on Acid Burrower');
		}
		for (const t of ['unit-hp-plus', 'unit-hp-minus']) {
			const b = await r.locator(`[data-testid="${t}"]`).boundingBox();
			assert.ok(b.width >= 43.5 && b.height >= 43.5, `${t} ${JSON.stringify(b)}`);
		}
		await ctx.close();
	}
});

test('no JS: damage 15 on burrower shows 3/8, then +1 shows 4/8', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc, { js: false });
	await hit(page, BUR, 0, 15, '3/8');
	assert.match(page.url(), /\/campaigns\//);
	assert.equal(new URL(page.url()).searchParams.get('step') === 'build', false);
	await click(page, BUR, 0, 'unit-hp-plus', '4/8');
	await ctx.close();
});

test('no JS: empty amount shows error.invalid and changes no HP', async () => {
	const sc = await setup();
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	await ctx.route(sc.run, async (route) => {
		if (route.request().method() !== 'GET') return route.continue();
		const resp = await route.fetch();
		const html = (await resp.text()).replace(/(<input[^>]*data-testid="unit-damage"[^>]*?)\srequired(=""|="required")?/g, '$1').replace(/(<input[^>]*?)\srequired(=""|="required")?([^>]*data-testid="unit-damage")/g, '$1$3');
		await route.fulfill({ response: resp, body: html });
	});
	const page = await ctx.newPage(); page.setDefaultTimeout(4000);
	await page.goto(sc.run);
	const r = row(page, BUR);
	assert.equal(await r.locator('[data-testid="unit-damage"]').getAttribute('required'), null);
	await r.locator('[data-testid="unit-hit"]').click();
	for (let n = 0; n < 40 && !(await page.content()).includes(EN['error.invalid']); n++) await page.waitForTimeout(100);
	assert.ok((await page.content()).includes(EN['error.invalid']));
	await waitHp(page, BUR, 0, '0/8');
	await waitHp(page, OOZE, 0, '0/2');
	await ctx.close();
});

test('360px viewport: no sideways scroll on the Run step', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc, { width: 360 });
	await waitHp(page, BUR, 0, '0/8');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360));
	await ctx.close();
});

test('Build step: no battle-unit, encounter-adversary cards still there', async () => {
	const sc = await setup();
	const { ctx, page } = await open(sc);
	await page.goto(sc.run + '?step=build');
	assert.equal(await page.locator('[data-testid="battle-unit"]').count(), 0);
	assert.ok((await page.locator('[data-testid="encounter-adversary"]').count()) >= 3);
	await ctx.close();
});
