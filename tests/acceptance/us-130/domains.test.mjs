import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await res.text();
	return { status: res.status, json: text ? JSON.parse(text) : undefined, text };
};
const valid = { name: 'Rook', class: 'Wizard', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
const mk = async (over = {}) => {
	const camp = (await call('POST', '/api/campaigns', { name: 'C' })).json;
	const r = await call('POST', `/api/campaigns/${camp.id}/characters`, { ...valid, ...over });
	assert.equal(r.status, 201, r.text);
	return r.json;
};

test('Wizard has its two domain ids from classes.json; custom class has []', async () => {
	const w = await mk();
	assert.deepEqual(w.domains, ['CODEX', 'SPLENDOR']);
	assert.deepEqual((await call('GET', `/api/characters/${w.id}`)).json.domains, ['CODEX', 'SPLENDOR']);
	const h = await mk({ class: 'Homebrew' });
	assert.deepEqual(h.domains, []);
});

test('changing the class by PATCH changes domains in the next response', async () => {
	const c = await mk();
	const p = await call('PATCH', `/api/characters/${c.id}`, { class: 'Guardian' });
	assert.equal(p.status, 200, p.text);
	assert.deepEqual(p.json.domains, ['VALOR', 'BLADE']);
	assert.deepEqual((await call('GET', `/api/characters/${c.id}`)).json.domains, ['VALOR', 'BLADE']);
	const p2 = await call('PATCH', `/api/characters/${c.id}`, { class: 'Homebrew' });
	assert.deepEqual(p2.json.domains, []);
});

test('PATCH with domains does not change them', async () => {
	const c = await mk();
	const p = await call('PATCH', `/api/characters/${c.id}`, { domains: ['BONE', 'SAGE'] });
	if (p.status === 200) assert.deepEqual(p.json.domains, ['CODEX', 'SPLENDOR']);
	else assert.equal(p.status, 400);
	assert.deepEqual((await call('GET', `/api/characters/${c.id}`)).json.domains, ['CODEX', 'SPLENDOR']);
});

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const sheet = async (id, lang) => {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + `/characters/${id}`);
	return { page, ctx };
};

test('sheet shows two domain elements for a Wizard, English names, each with Help', async () => {
	const c = await mk();
	const { page, ctx } = await sheet(c.id, 'en');
	const els = page.locator('[data-testid=domain]');
	assert.equal(await els.count(), 2);
	const t0 = await els.nth(0).innerText(), t1 = await els.nth(1).innerText();
	assert.match(t0, /Codex/);
	assert.match(t1, /Splendor/);
	for (let i = 0; i < 2; i++) assert.equal(await els.nth(i).locator('[data-testid=help]').count(), 1, 'help in domain ' + i);
	await ctx.close();
});

test('sheet shows domain names in French', async () => {
	const c = await mk();
	const { page, ctx } = await sheet(c.id, 'fr');
	const els = page.locator('[data-testid=domain]');
	assert.equal(await els.count(), 2);
	assert.match(await els.nth(0).innerText(), /Codex/);
	assert.match(await els.nth(1).innerText(), /Splendeur/);
	assert.doesNotMatch(await els.nth(1).innerText(), /Splendor/);
	assert.equal(await els.nth(1).locator('[data-testid=help]').count(), 1);
	await ctx.close();
});

test('sheet shows no domain for a non-SRD class', async () => {
	const c = await mk({ class: 'Homebrew' });
	const { page, ctx } = await sheet(c.id, 'en');
	assert.equal(await page.locator('[data-testid=domain]').count(), 0);
	await ctx.close();
});
