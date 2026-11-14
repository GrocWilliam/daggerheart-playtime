import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;

const VIEWPORTS = [
	['small phone', 320, 568],
	['phone', 375, 667],
	['tablet portrait', 768, 1024],
	['tablet landscape', 1024, 768],
	['desktop', 1280, 800]
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
let pages = [];

before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Mobile campaign' });
	const ids = [];
	for (let i = 0; i < 3; i++) {
		const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
			name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
			severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
		});
		await api('PATCH', `/api/characters/${ch.id}`, { notes: 'n'.repeat(500) });
		for (let j = 0; j < 3; j++) {
			await api('POST', `/api/characters/${ch.id}/items`, { name: `Item ${i}-${j}`, quantity: j + 1 });
		}
		ids.push(ch.id);
	}
	pages = [['/', 'home'], [`/campaigns/${camp.id}`, 'campaign'], [`/characters/${ids[0]}`, 'character']];
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function visit(path, w, h) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	await page.goto(BASE + path, { waitUntil: 'networkidle' });
	return { page, close: () => ctx.close() };
}

function each(name, fn) {
	test(name, async () => {
		for (const [path, label] of pages) {
			for (const [vn, w, h] of VIEWPORTS) {
				const v = await visit(path, w, h);
				try { await fn(v.page, `${label} @ ${vn} ${w}x${h}`); } finally { await v.close(); }
			}
		}
	});
}

each('page has <meta name="viewport" content="width=device-width, initial-scale=1">', async (page, where) => {
	const content = await page.evaluate(() =>
		document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
	assert.ok(content, `${where}: viewport meta missing`);
	assert.equal(content.replace(/\s+/g, ''), 'width=device-width,initial-scale=1', where);
});

each('document.documentElement.scrollWidth <= window.innerWidth', async (page, where) => {
	const { sw, iw } = await page.evaluate(() => ({
		sw: document.documentElement.scrollWidth, iw: window.innerWidth
	}));
	assert.ok(sw <= iw, `${where}: scrollWidth ${sw} > innerWidth ${iw}`);
});

each('every input, select and textarea has computed font-size >= 16px', async (page, where) => {
	const bad = await page.evaluate(() =>
		[...document.querySelectorAll('input, select, textarea')]
			.map((e) => [e.tagName + (e.name ? `[${e.name}]` : ''), parseFloat(getComputedStyle(e).fontSize)])
			.filter(([, s]) => !(s >= 16)));
	assert.deepEqual(bad, [], `${where}: small controls`);
});

each('every element with data-testid has computed font-size >= 16px', async (page, where) => {
	const { n, bad } = await page.evaluate(() => {
		const els = [...document.querySelectorAll('[data-testid]')];
		return {
			n: els.length,
			bad: els.map((e) => [e.dataset.testid, parseFloat(getComputedStyle(e).fontSize)])
				.filter(([id, s]) => id !== 'srd-licence' && !(s >= 16))
		};
	});
	assert.ok(n > 0, `${where}: no data-testid elements`);
	assert.deepEqual(bad, [], `${where}: small text`);
});
