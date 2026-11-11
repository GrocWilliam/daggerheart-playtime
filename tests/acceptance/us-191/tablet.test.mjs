import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const VPS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];
const SECTIONS = ['trackers', 'traits', 'equipment', 'experiences', 'inventory', 'cards', 'notes'];
let browser, paths, campaignIds = [];

async function api(method, path, body) {
	const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const json = await res.json();
	assert.ok(res.status < 300, `${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
	return json;
}

before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Tablet campaign' });
	await api('POST', '/api/campaigns', { name: 'Tablet two' });
	await api('POST', '/api/campaigns', { name: 'Tablet three' });
	const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
		name: 'Tablet hero', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
		severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
	});
	await api('POST', `/api/characters/${ch.id}/items`, { name: 'Rope', quantity: 2 });
	await api('POST', `/api/characters/${ch.id}/experiences`, { name: 'Sailor', modifier: 2 });
	const cards = JSON.parse(readFileSync(new URL('../../../src/lib/srd/core/domain-cards.json', import.meta.url), 'utf8'));
	await api('POST', `/api/characters/${ch.id}/cards`, { cardId: (Array.isArray(cards) ? cards : cards.cards ?? Object.values(cards))[0].id });
	paths = ['/', '/reference', `/characters/${ch.id}`];
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function open(path, w, h) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	await page.goto(BASE + path, { waitUntil: 'networkidle' });
	return { page, close: () => ctx.close() };
}

const CONTROLS = 'a, button, input:not([type=hidden]), select, summary';
async function eachPage(fn) {
	for (const [w, h] of VPS) for (const path of paths) {
		const v = await open(path, w, h);
		try { await fn(v.page, `${path.replace(/\d+/, ':id')} @ ${w}x${h}`, w, h); } finally { await v.close(); }
	}
}
const boxes = (page, ids) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
	const els = document.querySelectorAll(`[data-testid="${id}"]`);
	if (els.length !== 1) return [id, null];
	const r = els[0].getBoundingClientRect();
	return [id, { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom }];
})), ids);

test('no sideways scroll on any page at any viewport', async () => {
	await eachPage(async (page, where, w) => {
		const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
		assert.ok(sw[0] <= sw[1], `${where}: scrollWidth ${sw[0]} > ${sw[1]}`);
	});
});

test('every visible a, button, input, select and summary is at least 44x44', async () => {
	await eachPage(async (page, where) => {
		const small = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => {
			const s = getComputedStyle(e), r = e.getBoundingClientRect();
			return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && e.type !== 'checkbox' && e.type !== 'radio';
		}).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName + (e.dataset.testid ? '#' + e.dataset.testid : ''), r.width, r.height]; })
			.filter(([, w, h]) => w < 43.5 || h < 43.5), CONTROLS);
		assert.deepEqual(small, [], `${where}: small controls`);
	});
});

test('every text input has a 16px font size', async () => {
	await eachPage(async (page, where) => {
		const bad = await page.evaluate(() => [...document.querySelectorAll('input')]
			.filter((e) => ['text', 'search', 'number', 'email', 'password', 'url', 'tel'].includes(e.type) && e.getBoundingClientRect().width > 0)
			.map((e) => getComputedStyle(e).fontSize).filter((f) => f !== '16px'));
		assert.deepEqual(bad, [], `${where}: input font sizes`);
	});
});

test('with the pointer never moved, controls are visible and opaque', async () => {
	await eachPage(async (page, where) => {
		const bad = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0 && e.type !== 'hidden')
			.map((e) => { const s = getComputedStyle(e); return [e.tagName + (e.dataset.testid ? '#' + e.dataset.testid : ''), s.visibility, s.opacity]; })
			.filter(([, v, o]) => v !== 'visible' || !(parseFloat(o) > 0)), CONTROLS);
		assert.deepEqual(bad, [], `${where}: hidden controls`);
	});
});

test('from 768px the sigil, nav links and language switcher overlap vertically (one row)', async () => {
	for (const [w, h] of VPS.slice(1)) for (const path of paths) {
		const v = await open(path, w, h);
		try {
			const ids = ['sigil', 'nav-home', 'nav-reference', 'language-switcher'];
			const b = await boxes(v.page, ids);
			for (const id of ids) assert.ok(b[id], `${id} missing`);
			const top = Math.max(...ids.map((i) => b[i].y)), bottom = Math.min(...ids.map((i) => b[i].b));
			assert.ok(top < bottom, `${path} @ ${w}: header not on one row (${JSON.stringify(b)})`);
		} finally { await v.close(); }
	}
});

async function linkBoxes(w, h) {
	const v = await open('/', w, h);
	try {
		const r = await v.page.$$eval('[data-testid="campaign-link"]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; }));
		assert.ok(r.length >= 3, 'at least 3 campaigns');
		return r.slice(0, 3);
	} finally { await v.close(); }
}

test('home at 375x812: 3 campaigns in 1 column (3 different y)', async () => {
	const r = await linkBoxes(375, 812);
	assert.equal(new Set(r.map((b) => b.y)).size, 3, JSON.stringify(r));
});

test('home at 768x1024: 2 columns (first two share y, third below)', async () => {
	const r = await linkBoxes(768, 1024);
	assert.equal(r[0].y, r[1].y, JSON.stringify(r));
	assert.notEqual(r[0].x, r[1].x);
	assert.ok(r[2].y > r[0].y);
});

test('home at 1024x768: 3 columns (same y, 3 different x)', async () => {
	const r = await linkBoxes(1024, 768);
	assert.equal(new Set(r.map((b) => b.y)).size, 1, JSON.stringify(r));
	assert.equal(new Set(r.map((b) => b.x)).size, 3);
});

const IDS = SECTIONS.map((s) => `sheet-${s}`);

// us-305: the sheet is split into tabs; the grid checks are per tab.
const TAB_SECTIONS = { play: ['sheet-trackers', 'sheet-conditions'], traits: ['sheet-traits', 'sheet-experiences'], gear: ['sheet-equipment', 'sheet-gold', 'sheet-inventory'], cards: ['sheet-cards'], notes: ['sheet-notes'] };

test('character sheet at 768x1024: on ?tab=traits, sheet-traits and sheet-experiences share a top edge', async () => {
	const v = await open(paths[2] + '?tab=traits', 768, 1024);
	try {
		const b = await boxes(v.page, ['sheet-traits', 'sheet-experiences']);
		for (const id of ['sheet-traits', 'sheet-experiences']) assert.ok(b[id], `${id} missing`);
		assert.ok(Math.abs(b['sheet-traits'].y - b['sheet-experiences'].y) <= 1, JSON.stringify(b));
	} finally { await v.close(); }
});

test('character sheet at 768x1024: on ?tab=gear, sheet-inventory spans the full width', async () => {
	const v = await open(paths[2] + '?tab=gear', 768, 1024);
	try {
		const b = await boxes(v.page, ['sheet-sections', 'sheet-inventory']);
		assert.ok(b['sheet-inventory'] && Math.abs(b['sheet-inventory'].w - b['sheet-sections'].w) <= 2, `width ${b['sheet-inventory']?.w} vs ${b['sheet-sections']?.w}`);
	} finally { await v.close(); }
});

test('character sheet at 375x812: on every tab, all sheet sections share the same left x', async () => {
	for (const [tab, ids] of Object.entries(TAB_SECTIONS)) {
		const v = await open(`${paths[2]}?tab=${tab}`, 375, 812);
		try {
			const b = await boxes(v.page, ids);
			for (const id of ids) assert.ok(b[id], `${id} missing on ${tab}`);
			assert.equal(new Set(ids.map((i) => Math.round(b[i].x))).size, 1, JSON.stringify(b));
		} finally { await v.close(); }
	}
});

test('reference: 2 columns of entries at 768x1024, 1 column at 375x812', async () => {
	let v = await open('/reference', 768, 1024);
	try {
		const r = await v.page.$$eval('[data-testid="ref-item"]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left)]; }));
		assert.ok(r.length >= 2);
		assert.ok(r.some((a, i) => r.some((b, j) => i < j && a[0] === b[0] && a[1] !== b[1])), 'no two entries side by side');
	} finally { await v.close(); }
	v = await open('/reference', 375, 812);
	try {
		const lefts = await v.page.$$eval('[data-testid="ref-item"]', (els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
		assert.ok(lefts.length >= 2);
		assert.equal(new Set(lefts).size, 1);
	} finally { await v.close(); }
});
