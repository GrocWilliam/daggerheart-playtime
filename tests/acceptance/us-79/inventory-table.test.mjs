import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const LONG = 'L'.repeat(100);
const HEAD = { en: ['Name', 'Quantity', 'Actions'], fr: ['Nom', 'Quantité', 'Actions'] };
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const t = await r.text();
	return { status: r.status, json: t ? JSON.parse(t) : undefined };
}
async function mk(withItems = true) {
	const camp = await api('POST', '/api/campaigns', { name: 'Table' });
	const r = await api('POST', `/api/campaigns/${camp.json.id}/characters`, {
		name: 'Rook', class: 'Ranger', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	assert.equal(r.status, 201);
	if (withItems) {
		assert.equal((await api('POST', `/api/characters/${r.json.id}/items`, { name: 'Rope', quantity: 2 })).status, 201);
		assert.equal((await api('POST', `/api/characters/${r.json.id}/items`, { name: LONG, quantity: 1 })).status, 201);
	}
	return r.json.id;
}
async function open(id, lang, { js = true, width = 1000 } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width, height: 900 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	await page.goto(BASE + `/characters/${id}`);
	return { ctx, page };
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('with no items, [data-testid="inventory"] does not exist', async () => {
	const id = await mk(false);
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(id, lang);
		assert.equal(await page.locator('[data-testid="inventory"]').count(), 0);
		assert.equal(await page.locator('form[action="?/addItem"]').count(), 1, 'add form remains');
		await ctx.close();
	}
});

test('with items: one table, 3 column headers (en/fr) with scope=col, 2 item rows of 3 cells, first item "Rope ×2"', async () => {
	const id = await mk();
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(id, lang);
		assert.equal(await page.locator('table[data-testid="inventory"]').count(), 1);
		assert.equal(await page.locator('[data-testid="inventory"]').count(), 1);
		const heads = page.getByRole('columnheader');
		assert.equal(await heads.count(), 3);
		assert.deepEqual((await heads.allTextContents()).map(norm), HEAD[lang]);
		const ths = page.locator('table[data-testid="inventory"] th');
		assert.equal(await ths.count(), 3);
		for (const s of await ths.evaluateAll((l) => l.map((e) => e.getAttribute('scope')))) assert.equal(s, 'col');
		assert.equal(await page.locator('table[data-testid="inventory"] thead tr').count(), 1);
		const rows = page.locator('table[data-testid="inventory"] tbody tr[data-testid="item-row"]');
		assert.equal(await rows.count(), 2);
		assert.equal(await page.locator('tr[data-testid="item-row"]').count(), 2);
		for (let i = 0; i < 2; i++) assert.equal(await rows.nth(i).locator('> td').count(), 3);
		assert.equal(norm(await rows.nth(0).locator('[data-testid="item"]').textContent()), 'Rope ×2');
		assert.equal(await rows.nth(0).locator('td').nth(0).locator('[data-testid="item"]').count(), 1);
		assert.equal(await rows.nth(0).locator('td').nth(1).locator('form[action="?/setQuantity"]').count(), 1);
		assert.equal(await rows.nth(0).locator('td').nth(2).locator('form[action="?/removeItem"]').count(), 1);
		await ctx.close();
	}
});

test('forms in the table: transparent background, padding 0, margin 0, controls on one row', async () => {
	const id = await mk();
	for (const width of [1000, 375]) {
		const { ctx, page } = await open(id, 'en', { width });
		const r = await page.evaluate(() => [...document.querySelectorAll('table form')].map((f) => {
			const s = getComputedStyle(f);
			const boxes = [...f.querySelectorAll('input:not([type=hidden]), button')].map((e) => e.getBoundingClientRect());
			return { action: f.getAttribute('action'), bg: s.backgroundColor,
				pad: ['Top', 'Right', 'Bottom', 'Left'].map((c) => s['padding' + c]),
				mar: ['Top', 'Right', 'Bottom', 'Left'].map((c) => s['margin' + c]),
				n: boxes.length, overlap: boxes.every((b) => b.top < boxes[0].bottom && b.bottom > boxes[0].top) };
		}));
		assert.equal(r.length, 4);
		for (const f of r) {
			assert.equal(f.bg, 'rgba(0, 0, 0, 0)', f.action);
			assert.deepEqual(f.pad, ['0px', '0px', '0px', '0px'], f.action);
			assert.deepEqual(f.mar, ['0px', '0px', '0px', '0px'], f.action);
			if (f.action === '?/setQuantity') assert.equal(f.n, 2);
			assert.ok(f.overlap, `${f.action} controls share a row at ${width}px`);
		}
		await ctx.close();
	}
});

test('submitting ?/setQuantity changes the quantity; ?/removeItem removes the row', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'en', { js: false });
	const row = () => page.locator('tr[data-testid="item-row"]').first();
	await row().locator('form[action="?/setQuantity"] input[name="quantity"]').fill('5');
	await Promise.all([page.waitForNavigation(), row().locator('form[action="?/setQuantity"] button').click()]);
	assert.equal(norm(await row().locator('[data-testid="item"]').textContent()), 'Rope ×5');
	assert.equal(await page.locator('tr[data-testid="item-row"]').count(), 2);
	await Promise.all([page.waitForNavigation(), row().locator('form[action="?/removeItem"] button').click()]);
	assert.equal(await page.locator('tr[data-testid="item-row"]').count(), 1);
	assert.ok(!(await page.locator('table').textContent()).includes('Rope'));
	await Promise.all([page.waitForNavigation(), row().locator('form[action="?/removeItem"] button').click()]);
	assert.equal(await page.locator('[data-testid="inventory"]').count(), 0, 'table gone when empty');
	await ctx.close();
});

test('buttons and inputs in the table: >=44px touch targets and teal focus outline', async () => {
	const id = await mk();
	const { ctx, page } = await open(id, 'en');
	const els = page.locator('table[data-testid="inventory"] button, table[data-testid="inventory"] input:not([type=hidden])');
	const n = await els.count();
	assert.equal(n, 6);
	for (let i = 0; i < n; i++) {
		const b = await els.nth(i).boundingBox();
		assert.ok(b.height >= 44 && b.width >= 44, `target ${i} ${b.width}x${b.height}`);
	}
	for (let i = 0; i < n; i++) {
		await els.nth(i).focus();
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab'); // keyboard modality so :focus-visible applies
		const s = await els.nth(i).evaluate((e) => {
			const c = getComputedStyle(e);
			const p = document.createElement('span'); p.style.color = 'var(--tea\\6c)'; document.body.append(p);
			const teal = getComputedStyle(p).color; p.remove();
			return { f: e === document.activeElement, w: parseFloat(c.outlineWidth), st: c.outlineStyle, col: c.outlineColor, teal };
		});
		assert.ok(s.f, `control ${i} focused by keyboard`);
		assert.ok(s.w >= 2 && s.st !== 'none' && s.col === s.teal, `control ${i} ${JSON.stringify(s)}`);
	}
	await ctx.close();
});
