import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
const mk = async (name) => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Edit modal camp' })).id;
	return (await api('POST', `/api/campaigns/${camp}/characters`, {
		name, class: 'Guardian', level: 1, evasion: 9, majorThreshold: 7, severeThreshold: 14, maxHp: 6, maxStress: 6, armorSlots: 3
	})).id;
};
async function open(path, { w = 1024, h = 768, js = true } = {}) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(15000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	if (js) await p.waitForLoadState('networkidle');
	return { ctx, p };
}
const EDIT = 'form[action^="?/edit"]';

test('no Edit h2 and no edit form outside a dialog', async () => {
	const id = await mk('Nora');
	const { ctx, p } = await open(`/characters/${id}`);
	const r = await p.evaluate(() => ({
		h2: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()),
		outside: [...document.querySelectorAll('form[action^="?/edit"]')].filter((f) => !f.closest('dialog')).length,
		inside: [...document.querySelectorAll('form[action^="?/edit"]')].filter((f) => f.closest('dialog')).length
	}));
	// the modal's own title is an h2 inside the dialog; only h2s outside a dialog count
	const outsideH2 = await p.evaluate(() => [...document.querySelectorAll('h2')].filter((h) => !h.closest('dialog')).map((h) => h.textContent.trim()));
	assert.ok(!outsideH2.includes('Edit'), JSON.stringify(outsideH2));
	assert.equal(r.outside, 0);
	assert.equal(r.inside, 1);
	await ctx.close();
});

test('new-edit opener is visible with href new=edit', async () => {
	const id = await mk('Opal');
	const { ctx, p } = await open(`/characters/${id}`);
	const o = p.locator('[data-testid="new-edit"]');
	await o.waitFor({ state: 'visible' });
	const href = await o.getAttribute('href');
	assert.equal(new URLSearchParams(href.split('?')[1] ?? '').get('new'), 'edit');
	assert.equal((await o.textContent()).trim(), 'Edit');
	await ctx.close();
});

test('?new=edit opens modal-edit with the form and cancel link', async () => {
	const id = await mk('Orin');
	const { ctx, p } = await open(`/characters/${id}?new=edit`);
	const m = p.locator('[data-testid="modal-edit"]');
	await m.waitFor({ state: 'visible' });
	assert.equal(await m.evaluate((d) => d.open), true);
	assert.equal(await m.locator(EDIT).count(), 1);
	assert.equal(await m.locator('[data-testid="modal-cancel"]').count(), 1);
	await ctx.close();
});

test('without JavaScript, saving a new name redirects 303 to the sheet', async () => {
	const id = await mk('Nell');
	const r = await fetch(`${BASE}/characters/${id}?/edit`, {
		method: 'POST', redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
		body: new URLSearchParams({ name: 'Nell Renamed', class: 'Guardian', level: '1', evasion: '9', majorThreshold: '7', severeThreshold: '14', maxHp: '6', maxStress: '6', armorSlots: '3' })
	});
	assert.equal(r.status, 303);
	assert.equal(new URL(r.headers.get('location'), BASE).pathname, `/characters/${id}`);
	const { ctx, p } = await open(`/characters/${id}?new=edit`, { js: false });
	await p.locator(`${EDIT} input[name="name"]`).fill('Nell Browser');
	await Promise.all([p.waitForLoadState('load'), p.locator(`${EDIT} button[type="submit"]`).click()]);
	await p.waitForURL((u) => u.pathname === `/characters/${id}`);
	assert.equal((await p.locator('[data-testid="character-name"]').textContent()).trim(), 'Nell Browser');
	await ctx.close();
});

test('with JavaScript, a valid edit closes the dialog without reload', async () => {
	const id = await mk('Jade');
	const { ctx, p } = await open(`/characters/${id}`);
	await p.evaluate(() => { window.__marker = 1; });
	await p.locator('[data-testid="new-edit"]').click();
	const m = p.locator('[data-testid="modal-edit"]');
	await m.waitFor({ state: 'visible' });
	await m.locator('input[name="name"]').fill('Jade Renamed');
	await m.locator('button[type="submit"]').click();
	await p.waitForFunction(() => !document.querySelector('[data-testid="modal-edit"]').open);
	await p.waitForFunction(() => document.querySelector('[data-testid="character-name"]')?.textContent.trim() === 'Jade Renamed');
	assert.equal(await p.evaluate(() => window.__marker), 1);
	await ctx.close();
});

test('empty name reopens the modal with an alert and the typed values', async () => {
	const id = await mk('Edda');
	const { ctx, p } = await open(`/characters/${id}?new=edit`, { js: false });
	const f = p.locator(EDIT);
	await f.evaluate((form) => form.querySelectorAll('[required]').forEach((e) => e.removeAttribute('required')));
	await f.locator('input[name="name"]').fill('');
	await f.locator('input[name="level"]').fill('3');
	await Promise.all([p.waitForLoadState('load'), f.locator('button[type="submit"]').click()]);
	const m = p.locator('[data-testid="modal-edit"]');
	assert.equal(await m.evaluate((d) => d.open), true);
	assert.ok((await m.locator('[role="alert"]').count()) >= 1);
	assert.equal(await m.locator('input[name="name"]').inputValue(), '');
	assert.equal(await m.locator('input[name="level"]').inputValue(), '3');
	await ctx.close();
});

async function grid(p) {
	return p.evaluate(() => {
		const f = document.querySelector('[data-testid="modal-edit"] form[action^="?/edit"]');
		const tops = [...f.querySelectorAll('input:not([type=hidden]), select')].map((e) => Math.round(e.getBoundingClientRect().top));
		const cols = getComputedStyle(f).gridTemplateColumns.split(' ').length;
		return { tops, cols, shared: tops.some((t, i) => tops.findIndex((u) => Math.abs(u - t) <= 3) !== i) };
	});
}
test('edit form grid: one column at 375, two at 1024', async () => {
	const id = await mk('Gwen');
	let r = await open(`/characters/${id}?new=edit`, { w: 375, h: 812 });
	await r.p.locator('[data-testid="modal-edit"]').waitFor({ state: 'visible' });
	let g = await grid(r.p);
	assert.equal(g.cols, 1);
	assert.equal(g.shared, false, JSON.stringify(g));
	await r.ctx.close();
	r = await open(`/characters/${id}?new=edit`, { w: 1024, h: 768 });
	await r.p.locator('[data-testid="modal-edit"]').waitFor({ state: 'visible' });
	g = await grid(r.p);
	assert.equal(g.cols, 2);
	assert.equal(g.shared, true, JSON.stringify(g));
	await r.ctx.close();
});
