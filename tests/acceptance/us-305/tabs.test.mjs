import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
let id;
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	id = await mk('Tabitha');
});
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
async function mk(name) {
	const camp = (await api('POST', '/api/campaigns', { name: 'Tabs camp' })).id;
	return (await api('POST', `/api/campaigns/${camp}/characters`, {
		name, class: 'Guardian', level: 1, evasion: 9, majorThreshold: 7, severeThreshold: 14, maxHp: 6, maxStress: 6, armorSlots: 3
	})).id;
}
async function open(path, { w = 1024, h = 768, js = true, lang = 'en' } = {}) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(15000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	if (js) await p.waitForLoadState('networkidle');
	return { ctx, p };
}

const TABS = ['play', 'traits', 'gear', 'cards', 'notes'];
const SECTIONS = {
	play: ['sheet-trackers', 'sheet-conditions'],
	traits: ['sheet-traits', 'sheet-experiences'],
	gear: ['sheet-equipment', 'sheet-gold', 'sheet-inventory'],
	cards: ['sheet-cards'],
	notes: ['sheet-notes']
};
const ALL = Object.values(SECTIONS).flat();
const tid = (p, t) => p.locator(`[data-testid="${t}"]`);
const count = (p, t) => tid(p, t).count();
const box = async (p, t) => {
	const b = await tid(p, t).boundingBox();
	assert.ok(b, `${t} has a box`);
	return b;
};
const params = (href) => new URLSearchParams((href ?? '').split('?')[1] ?? '');
const sorted = (sp) => [...sp.entries()].map(([k, v]) => `${k}=${v}`).sort();

for (const path of ['', '?tab=bogus']) {
	test(`/characters/:id${path} renders the play tab`, async () => {
		const { ctx, p } = await open(`/characters/${id}${path}`);
		assert.equal(await tid(p, 'tab-play').getAttribute('aria-current'), 'page');
		assert.equal(await count(p, 'sheet-trackers'), 1);
		assert.equal(await count(p, 'sheet-conditions'), 1);
		for (const t of ['sheet-inventory', 'sheet-traits', 'sheet-cards', 'sheet-notes']) assert.equal(await count(p, t), 0, t);
		await ctx.close();
	});
}

for (const k of TABS) {
	test(`?tab=${k} marks only tab-${k} as current, bold and underlined, and shows only its sections`, async () => {
		const { ctx, p } = await open(`/characters/${id}?tab=${k}`);
		const nav = p.locator('nav[data-testid="sheet-tabs"]');
		assert.equal(await nav.count(), 1);
		const current = nav.locator('[aria-current="page"]');
		assert.equal(await current.count(), 1);
		assert.equal(await current.getAttribute('data-testid'), `tab-${k}`);
		const st = await current.evaluate((e) => { const c = getComputedStyle(e); return { w: Number(c.fontWeight), d: c.textDecorationLine }; });
		assert.ok(st.w >= 700, `font-weight ${st.w}`);
		assert.ok(st.d.includes('underline'), `text-decoration-line ${st.d}`);
		for (const t of ALL) assert.equal(await count(p, t), SECTIONS[k].includes(t) ? 1 : 0, `${t} on ${k}`);
		await ctx.close();
	});
}

test('each tab-k links to ?tab=k, and without JavaScript tab-gear loads the gear tab', async () => {
	const { ctx, p } = await open(`/characters/${id}`, { js: false });
	for (const k of TABS) assert.equal(await tid(p, `tab-${k}`).getAttribute('href'), `?tab=${k}`, k);
	await tid(p, 'tab-gear').click();
	await p.waitForURL((u) => u.searchParams.get('tab') === 'gear');
	await tid(p, 'sheet-inventory').waitFor({ state: 'visible' });
	assert.equal(new URL(p.url()).pathname, `/characters/${id}`);
	assert.equal(await tid(p, 'tab-gear').getAttribute('aria-current'), 'page');
	await ctx.close();
});

test('on every tab the header shows character-name, divider, campaign-run-link and new-edit above sheet-tabs', async () => {
	for (const k of TABS) {
		const { ctx, p } = await open(`/characters/${id}?tab=${k}`);
		const tabs = await box(p, 'sheet-tabs');
		for (const t of ['character-name', 'divider', 'campaign-run-link', 'new-edit']) {
			assert.equal(await count(p, t), 1, `${t} on ${k}`);
			const b = await box(p, t);
			assert.ok(b.y + b.height <= tabs.y + 1, `${t} above sheet-tabs on ${k}: ${b.y + b.height} > ${tabs.y}`);
		}
		await ctx.close();
	}
});

test('new-edit href params carry the current tab (tab=gear on gear, tab=play by default)', async () => {
	let { ctx, p } = await open(`/characters/${id}?tab=gear`);
	assert.deepEqual(sorted(params(await tid(p, 'new-edit').getAttribute('href'))), ['new=edit', 'tab=gear']);
	await ctx.close();
	({ ctx, p } = await open(`/characters/${id}`));
	assert.deepEqual(sorted(params(await tid(p, 'new-edit').getAttribute('href'))), ['new=edit', 'tab=play']);
	await ctx.close();
});

test('?new=item&tab=gear opens modal-item whose cancel href params are exactly tab=gear', async () => {
	const { ctx, p } = await open(`/characters/${id}?new=item&tab=gear`);
	const m = tid(p, 'modal-item');
	await m.waitFor({ state: 'visible' });
	assert.equal(await m.evaluate((d) => d.open), true);
	const cancel = m.locator('[data-testid="modal-cancel"]');
	assert.equal(await cancel.count(), 1);
	assert.deepEqual(sorted(params(await cancel.getAttribute('href'))), ['tab=gear']);
	await ctx.close();
});

test('sheet-panel has the surface look (3px double border, background) and contains sheet-sections', async () => {
	const { ctx, p } = await open(`/characters/${id}`);
	const panel = tid(p, 'sheet-panel');
	assert.equal(await panel.count(), 1);
	const st = await panel.evaluate((e) => { const c = getComputedStyle(e); return { s: c.borderTopStyle, w: c.borderTopWidth, bg: c.backgroundColor }; });
	assert.equal(st.s, 'double');
	assert.equal(st.w, '3px');
	assert.ok(st.bg !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(st.bg), `background ${st.bg}`);
	assert.equal(await panel.locator('[data-testid="sheet-sections"]').count(), 1);
	await ctx.close();
});

test('at 768x1024 each tab lays out its sections in the stated grid', async () => {
	const W = { w: 768, h: 1024 };
	let { ctx, p } = await open(`/characters/${id}?tab=play`, W);
	let a = await box(p, 'sheet-trackers'), b = await box(p, 'sheet-conditions');
	assert.ok(a.x + a.width <= b.x + 4, `trackers left of conditions: ${JSON.stringify([a, b])}`);
	assert.ok(Math.abs(a.y - b.y) <= 4, `play tops ${a.y} ${b.y}`);
	await ctx.close();

	({ ctx, p } = await open(`/characters/${id}?tab=traits`, W));
	a = await box(p, 'sheet-traits'); b = await box(p, 'sheet-experiences');
	assert.ok(Math.abs(a.y - b.y) <= 4, `traits tops ${a.y} ${b.y}`);
	await ctx.close();

	({ ctx, p } = await open(`/characters/${id}?tab=gear`, W));
	a = await box(p, 'sheet-equipment'); b = await box(p, 'sheet-gold');
	const inv = await box(p, 'sheet-inventory'), grid = await box(p, 'sheet-sections');
	assert.ok(Math.abs(a.y - b.y) <= 4, `gear tops ${a.y} ${b.y}`);
	assert.ok(inv.y >= Math.max(a.y + a.height, b.y + b.height) - 4, `inventory below equipment and gold`);
	assert.ok(Math.abs(inv.width - grid.width) <= 2, `inventory width ${inv.width} vs ${grid.width}`);
	await ctx.close();

	({ ctx, p } = await open(`/characters/${id}?tab=cards`, W));
	const cards = await box(p, 'sheet-cards'), g2 = await box(p, 'sheet-sections');
	assert.ok(Math.abs(cards.width - g2.width) <= 2, `cards width ${cards.width} vs ${g2.width}`);
	await ctx.close();
});

test('at 375x812 every tab stacks its sections on one left x with no horizontal scroll', async () => {
	for (const k of TABS) {
		const { ctx, p } = await open(`/characters/${id}?tab=${k}`, { w: 375, h: 812 });
		const xs = [];
		for (const t of SECTIONS[k]) xs.push((await box(p, t)).x);
		assert.ok(Math.max(...xs) - Math.min(...xs) <= 1, `${k} left x ${xs}`);
		const sw = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
		assert.ok(sw.s <= sw.c, `${k} scrollWidth ${sw.s} > ${sw.c}`);
		await ctx.close();
	}
});

test('in French (lang-fr) the tab labels are Jeu, Caractéristiques, Équipement, Cartes and section.notes', async () => {
	const fr = createRequire(import.meta.url)(process.env.ROOT + '/src/lib/i18n/fr.json');
	const { ctx, p } = await open(`/characters/${id}`);
	await Promise.all([p.waitForEvent('load'), tid(p, 'lang-fr').click()]);
	await p.waitForLoadState('networkidle');
	const want = { play: 'Jeu', traits: 'Caractéristiques', gear: 'Équipement', cards: 'Cartes', notes: fr['section.notes'] };
	for (const k of TABS) assert.equal((await tid(p, `tab-${k}`).textContent()).trim(), want[k], k);
	await ctx.close();
});
