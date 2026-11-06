import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const NAMES = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const ZERO = { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 };
const waitFor = async (fn, ok) => {
	const end = Date.now() + 10000;
	let v;
	while (Date.now() < end) { v = await fn(); if (ok(v)) return v; await new Promise((r) => setTimeout(r, 100)); }
	return v;
};
const call = async (method, path, body) => {
	const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await res.text();
	return { status: res.status, json: text ? JSON.parse(text) : undefined, text };
};
const valid = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
const mk = async (over = {}) => {
	const camp = (await call('POST', '/api/campaigns', { name: 'C' })).json;
	return { camp, r: await call('POST', `/api/campaigns/${camp.id}/characters`, { ...valid, ...over }) };
};

test('a new character has all six traits at 0', async () => {
	const { r } = await mk();
	assert.equal(r.status, 201, r.text);
	assert.deepEqual(r.json.traits, ZERO);
	assert.deepEqual(Object.keys(r.json.traits).sort(), [...NAMES].sort());
});

test('PATCH a subset changes only the named traits; GET agrees', async () => {
	const { r } = await mk();
	const p = await call('PATCH', `/api/characters/${r.json.id}`, { traits: { agility: 2 } });
	assert.equal(p.status, 200, p.text);
	assert.deepEqual(p.json.traits, { ...ZERO, agility: 2 });
	const p2 = await call('PATCH', `/api/characters/${r.json.id}`, { traits: { knowledge: -5, strength: 5 } });
	assert.deepEqual(p2.json.traits, { ...ZERO, agility: 2, knowledge: -5, strength: 5 });
	const g = await call('GET', `/api/characters/${r.json.id}`);
	assert.deepEqual(g.json.traits, { ...ZERO, agility: 2, knowledge: -5, strength: 5 });
});

test('PATCH out-of-range or non-integer trait -> 400', async () => {
	const { r } = await mk();
	for (const v of [6, -6, 1.5]) {
		const p = await call('PATCH', `/api/characters/${r.json.id}`, { traits: { agility: v } });
		assert.equal(p.status, 400, String(v));
		assert.deepEqual(p.json, { error: 'agility must be an integer from -5 to 5' });
	}
	assert.deepEqual((await call('GET', `/api/characters/${r.json.id}`)).json.traits, ZERO);
});

test('PATCH unknown trait -> 400', async () => {
	const { r } = await mk();
	const p = await call('PATCH', `/api/characters/${r.json.id}`, { traits: { luck: 1 } });
	assert.equal(p.status, 400);
	assert.deepEqual(p.json, { error: 'traits has an unknown trait: luck' });
});

test('POST character with traits; out-of-range -> 400', async () => {
	const { r } = await mk({ traits: { strength: 3 } });
	assert.equal(r.status, 201, r.text);
	assert.deepEqual(r.json.traits, { ...ZERO, strength: 3 });
	const bad = await mk({ traits: { strength: 6 } });
	assert.equal(bad.r.status, 400);
	assert.deepEqual(bad.r.json, { error: 'strength must be an integer from -5 to 5' });
});

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

test('sheet shows signed traits in trait-<name> elements', async () => {
	const { r } = await mk();
	await call('PATCH', `/api/characters/${r.json.id}`, { traits: { agility: 2, finesse: -1 } });
	const page = await browser.newPage();
	await page.goto(BASE + `/characters/${r.json.id}`);
	const txt = async (n) => (await page.locator(`[data-testid=trait-${n}]`).first().innerText()).trim();
	assert.equal(await txt('agility'), '+2');
	assert.equal(await txt('strength'), '0');
	assert.equal(await txt('finesse'), '-1');
	for (const n of NAMES) assert.equal(await page.locator(`[data-testid=trait-${n}]`).count(), 1, n);
	await page.close();
});

test('edit form has six number inputs min -5 max 5 and saves new values', async () => {
	const { r } = await mk();
	const page = await browser.newPage();
	await page.goto(BASE + `/characters/${r.json.id}`);
	for (const n of NAMES) {
		const inp = page.locator(`form[action="?/edit"] input[type=number][name$="${n}"]`);
		assert.equal(await inp.count(), 1, n);
		assert.equal(await inp.getAttribute('min'), '-5');
		assert.equal(await inp.getAttribute('max'), '5');
	}
	await page.locator('form[action="?/edit"] input[name$="presence"]').fill('3');
	await page.locator('form[action="?/edit"] input[name$="instinct"]').fill('-2');
	await Promise.all([page.waitForLoadState('load'), page.locator('form[action="?/edit"] button[type=submit], form[action="?/edit"] button:not([type])').last().click()]);
	const g = await waitFor(() => call('GET', `/api/characters/${r.json.id}`), (x) => x.json.traits && x.json.traits.presence === 3);
	assert.deepEqual(g.json.traits, { ...ZERO, presence: 3, instinct: -2 });
	await page.reload();
	assert.equal((await page.locator('[data-testid=trait-presence]').innerText()).trim(), '+3');
	assert.equal((await page.locator('[data-testid=trait-instinct]').innerText()).trim(), '-2');
	await page.close();
});

test('sheet renders in French with translated trait labels and help', async () => {
	const { r } = await mk();
	const get = async (lang) => (await fetch(BASE + `/characters/${r.json.id}`, { headers: { cookie: `lang=${lang}`, accept: 'text/html' } })).text();
	const en = await get('en'), fr = await get('fr');
	assert.match(en, />\s*Traits\s*</);
	assert.doesNotMatch(fr, />\s*Traits\s*</);
	assert.match(fr, /Agilité/);
	assert.match(fr, /Connaissance/);
	assert.match(fr, /<html[^>]*lang="fr"/);
	assert.match(en, /Agility/);
	const sec = fr.slice(fr.indexOf('data-testid="trait-agility"') - 3000);
	assert.ok(/<(details|button)/.test(sec), 'Help helper near traits');
});
