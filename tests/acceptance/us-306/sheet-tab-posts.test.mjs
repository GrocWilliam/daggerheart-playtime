import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const ROOT = new URL('../../../', import.meta.url);
const CAT = { en: JSON.parse(readFileSync(new URL('src/lib/i18n/en.json', ROOT), 'utf8')), fr: JSON.parse(readFileSync(new URL('src/lib/i18n/fr.json', ROOT), 'utf8')) };
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const t = await r.text();
	return { status: r.status, json: t ? JSON.parse(t) : undefined };
}
async function mk() {
	const camp = await api('POST', '/api/campaigns', { name: 'Tabs' });
	const r = await api('POST', `/api/campaigns/${camp.json.id}/characters`, {
		name: 'Rook', class: 'Ranger', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	assert.equal(r.status, 201);
	return r.json.id;
}
async function open(id, qs, { js = true, lang = 'en' } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1000, height: 900 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	await page.goto(`${BASE}/characters/${id}?${qs}`);
	return { ctx, page };
}
const actions = (page, scope) => page.locator(`${scope} form`).evaluateAll((l) => l.map((f) => f.getAttribute('action')));

test('gear tab: gold, equip and modal-item forms post with &tab=gear', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'tab=gear');
	assert.deepEqual(await actions(page, '[data-testid=sheet-gold]'), ['?/gold&tab=gear']);
	const eq = await actions(page, '[data-testid=sheet-equipment]');
	assert.ok(eq.length > 0);
	for (const a of eq) assert.equal(a, '?/equip&tab=gear');
	await ctx.close();
	const o = await open(id, 'new=item&tab=gear');
	assert.ok((await actions(o.page, '[data-testid=modal-item]')).includes('?/addItem&tab=gear'));
	await o.ctx.close();
});

test('play tab: tracker, damage and condition forms post with &tab=play', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'tab=play');
	const tr = await actions(page, '[data-testid=sheet-trackers]');
	assert.ok(tr.includes('?/tracker&tab=play'));
	assert.ok(tr.includes('?/damage&tab=play'));
	for (const a of tr) assert.ok(['?/tracker&tab=play', '?/damage&tab=play'].includes(a), a);
	const co = await actions(page, '[data-testid=sheet-conditions]');
	assert.ok(co.length > 0);
	for (const a of co) assert.equal(a, '?/condition&tab=play');
	await ctx.close();
});

test('traits tab with ?new=edit: the edit form posts to ?/edit&tab=traits', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'tab=traits&new=edit');
	assert.ok((await actions(page, '[data-testid=modal-edit]')).includes('?/edit&tab=traits'));
	await ctx.close();
});

test('no JS: setting gold to 7 on ?tab=gear ends on tab=gear with gold shown', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'tab=gear', { js: false });
	await page.locator('[data-testid=sheet-gold] input[name=handfuls]').fill('7');
	await Promise.all([page.waitForNavigation(), page.locator('[data-testid=sheet-gold] button[type=submit]').click()]);
	assert.equal(new URL(page.url()).searchParams.toString(), 'tab=gear');
	assert.match(await page.locator('[data-testid=gold]').innerText(), /7/);
	await ctx.close();
});

test('no JS: adding an item via ?new=item&tab=gear ends on ?tab=gear with the item listed', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'new=item&tab=gear', { js: false });
	await page.locator('[data-testid=modal-item] input[name=name]').fill('Lantern');
	await Promise.all([page.waitForNavigation(), page.locator('[data-testid=modal-item] button[type=submit]').click()]);
	assert.equal(new URL(page.url()).searchParams.toString(), 'tab=gear');
	assert.match(await page.locator('[data-testid=sheet-inventory]').innerText(), /Lantern/);
	await ctx.close();
});

test('no JS: saving the edit modal opened from ?tab=cards ends on ?tab=cards', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'tab=cards&new=edit', { js: false });
	await Promise.all([page.waitForNavigation(), page.locator('[data-testid=modal-edit] button[type=submit]').click()]);
	assert.equal(new URL(page.url()).searchParams.toString(), 'tab=cards');
	await ctx.close();
});

async function post(id, query, fields, lang) {
	return fetch(`${BASE}/characters/${id}?${query}`, {
		method: 'POST', redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE, accept: 'text/html', cookie: `lang=${lang}` },
		body: new URLSearchParams(fields).toString()
	});
}
const section = (html, testid) => {
	const i = html.indexOf(`data-testid="${testid}"`);
	return i < 0 ? null : i;
};

for (const lang of ['en', 'fr']) {
	test(`rejected gold post renders the gear tab with one alert inside sheet-gold (${lang})`, async () => {
		const id = await mk();
		const res = await post(id, '/gold&tab=gear', { handfuls: 'abc' }, lang);
		assert.equal(res.status, 400);
		const html = await res.text();
		const ctx = await browser.newContext({ javaScriptEnabled: false });
		const page = await ctx.newPage();
		await page.setContent(html);
		assert.equal(await page.locator('[role=alert]').count(), 1);
		assert.equal(await page.locator('[data-testid=sheet-gold] [role=alert]').count(), 1);
		assert.equal((await page.locator('[role=alert]').innerText()).trim(), CAT[lang]['error.invalid']);
		assert.ok(section(html, 'sheet-gold') !== null);
		await ctx.close();
	});
}

test('rejected notes post renders the notes tab with the alert inside sheet-notes', async () => {
	const id = await mk();
	const res = await post(id, '/notes&tab=notes', { notes: 'x'.repeat(5001) }, 'en');
	assert.equal(res.status, 400);
	const html = await res.text();
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	const page = await ctx.newPage();
	await page.setContent(html);
	assert.equal(await page.locator('[role=alert]').count(), 1);
	assert.equal(await page.locator('[data-testid=sheet-notes] [role=alert]').count(), 1);
	assert.equal((await page.locator('[role=alert]').innerText()).trim(), CAT.en['error.invalid']);
	await ctx.close();
});

test('with JS, HP + on ?tab=play updates hp in place and keeps the search at tab=play', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'tab=play');
	const before = Number((await page.locator('[data-testid=hp]').innerText()).trim().split(/\D+/)[0]);
	await page.locator('form[action="?/tracker&tab=play"]:has([data-testid=hp]) button[value="1"]').click();
	await page.waitForFunction((b) => Number(document.querySelector('[data-testid=hp]').textContent.trim().split(/\D+/)[0]) !== b, before);
	const s = new URL(page.url()).searchParams.toString();
	assert.ok(s === '' || s === 'tab=play', s);
	await ctx.close();
});
