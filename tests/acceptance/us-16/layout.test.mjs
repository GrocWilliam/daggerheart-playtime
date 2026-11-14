import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;

// [name, width, height, expected columns]
const VIEWPORTS = [
	['small phone', 320, 568, 1],
	['phone', 375, 667, 1],
	['just below 600', 599, 800, 1],
	['600 boundary', 600, 800, 1],
	['tablet portrait', 768, 1024, 2],
	['just below 1024', 1023, 768, 3],
	['tablet landscape', 1024, 768, 2],
	['wide laptop', 1180, 820, 2],
	['desktop', 1280, 800, 3]
];

async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const json = await res.json();
	assert.ok(res.status < 300, `${method} ${path}: ${res.status}`);
	return json;
}

let browser;
let path;

before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Layout campaign' });
	for (let i = 0; i < 3; i++) {
		const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
			name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
			severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
		});
		await api('PATCH', `/api/characters/${ch.id}`, { notes: 'n'.repeat(500) });
		for (let j = 0; j < 3; j++) {
			await api('POST', `/api/characters/${ch.id}/items`, { name: `Item ${i}-${j}`, quantity: j + 1 });
		}
	}
	path = `/campaigns/${camp.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function visit(w, h) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	await page.goto(BASE + path, { waitUntil: 'networkidle' });
	return { page, close: () => ctx.close() };
}

test('character cards sit in 1 column below 768px, auto-fill 18rem columns, with a sidebar from 1024px (us-192, #339)', async () => {
	for (const [name, w, h, cols] of VIEWPORTS) {
		const v = await visit(w, h);
		try {
			const lefts = await v.page.$$eval('[data-testid="character-card"]', (els) =>
				els.map((e) => Math.round(e.getBoundingClientRect().left)));
			assert.equal(lefts.length, 3, `${name}: expected 3 cards`);
			const distinct = new Set(lefts).size;
			assert.equal(distinct, cols, `${name} ${w}x${h}: ${distinct} columns (lefts ${lefts})`);
		} finally { await v.close(); }
	}
});

test('every card lies fully inside the viewport width at every viewport', async () => {
	for (const [name, w, h] of VIEWPORTS) {
		const v = await visit(w, h);
		try {
			const boxes = await v.page.$$eval('[data-testid="character-card"]', (els) =>
				els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
			assert.equal(boxes.length, 3, `${name}: expected 3 cards`);
			for (const [l, r, bw] of boxes) {
				assert.ok(bw > 0, `${name}: empty card`);
				assert.ok(l >= -0.5 && r <= w + 0.5, `${name} ${w}x${h}: card spans ${l}..${r}`);
			}
		} finally { await v.close(); }
	}
});

test('at 375x667 the fear value and its - and + buttons are visible without scrolling', async () => {
	const v = await visit(375, 667);
	try {
		const boxes = await v.page.evaluate(() => {
			const fear = document.querySelector('[data-testid="fear"]');
			const form = fear.closest('form');
			const els = [fear, ...(form ? form.querySelectorAll('button:not([data-testid^="help-"])') : [])];
			return els.map((e) => {
				const r = e.getBoundingClientRect();
				return { t: e.textContent.trim(), top: r.top, bottom: r.bottom, w: r.width, h: r.height };
			});
		});
		assert.equal(boxes.length, 3, 'fear value plus - and + buttons expected');
		for (const b of boxes) {
			assert.ok(b.w > 0 && b.h > 0, `"${b.t}" not rendered`);
			assert.ok(b.top >= 0 && b.bottom <= 667, `"${b.t}" spans ${b.top}..${b.bottom}, beyond 667`);
		}
	} finally { await v.close(); }
});
