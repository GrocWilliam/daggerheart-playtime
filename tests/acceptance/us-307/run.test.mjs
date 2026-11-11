import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const en = JSON.parse(readFileSync(new URL('../../../src/lib/i18n/en.json', import.meta.url), 'utf8'));
let browser, full, empty;
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return r.json().catch(() => null);
};
const ch = (name) => ({ name, class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 });
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	full = (await api('POST', '/api/campaigns', { name: 'Fullcamp' })).id;
	for (const n of ['Alyndra', 'Brom']) await api('POST', `/api/campaigns/${full}/characters`, ch(n));
	const s = await api('POST', `/api/campaigns/${full}/scenes`, { title: 'Alphaglade' });
	await api('PATCH', `/api/campaigns/${full}/scenes/${s.id}`, { status: 'current' });
	await api('POST', `/api/campaigns/${full}/journal`, { text: 'We met a fox.' });
	empty = (await api('POST', '/api/campaigns', { name: 'Emptycamp' })).id;
	await api('POST', `/api/campaigns/${empty}/characters`, ch('Cyra'));
});
after(async () => { await browser?.close(); });

async function open(id, [width, height], opts = {}) {
	const ctx = await browser.newContext({ viewport: { width, height }, ...opts });
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	await p.goto(`${BASE}/campaigns/${id}?step=run`);
	await p.waitForSelector('[data-testid=run]');
	return p;
}
const box = (p, id) => p.locator(`[data-testid=${id}]`).first().boundingBox();

test('run has no border and no padding', async () => {
	const p = await open(full, [1024, 768]);
	const s = await p.locator('[data-testid=run]').evaluate((e) => {
		const c = getComputedStyle(e);
		return [c.borderTopStyle, c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft];
	});
	assert.deepEqual(s, ['none', '0px', '0px', '0px', '0px']);
});

test('fear bar is the first block, full width, on one row at 1024x768', async () => {
	const p = await open(full, [1024, 768]);
	const r = await p.evaluate(() => {
		const run = document.querySelector('[data-testid=run]');
		const fear = document.querySelector('[data-testid=fear]');
		const form = fear.closest('form');
		const vis = [...run.children].filter((e) => e.getBoundingClientRect().height > 0);
		const rc = (e) => e.getBoundingClientRect();
		const cy = (b) => b.y + b.height / 2;
		let label = null;
		const w = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim()) { label = n; break; }
		const range = document.createRange();
		range.selectNodeContents(label);
		const minus = form.querySelector('button[name=delta][value="-1"]');
		const plus = form.querySelector('button[name=delta][value="1"]');
		const pips = document.querySelector('[data-testid=fear-pips]');
		return {
			first: vis[0] && vis[0].contains(fear),
			formW: rc(form).width, runW: rc(run).width,
			cys: [cy(range.getBoundingClientRect()), cy(rc(minus)), cy(rc(fear)), cy(rc(plus)), cy(rc(pips))],
			x: [rc(minus), rc(fear), rc(plus)].map((b) => b.x + b.width / 2)
		};
	});
	assert.ok(r.first, 'fear form is the first visible block in run');
	assert.ok(Math.abs(r.formW - r.runW) <= 2, `widths ${r.formW} ${r.runW}`);
	assert.ok(Math.max(...r.cys) - Math.min(...r.cys) <= 6, `centres ${r.cys}`);
	assert.ok(r.x[0] < r.x[1] && r.x[1] < r.x[2], `order ${r.x}`);
});

test('fear and its buttons are visible at 375x667 without scrolling', async () => {
	const p = await open(full, [375, 667]);
	for (const sel of ['[data-testid=fear]', '[data-testid=fear] >> xpath=ancestor::form//button[@value="-1"]', '[data-testid=fear] >> xpath=ancestor::form//button[@value="1"]']) {
		const b = await p.locator(sel).boundingBox();
		assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 375 && b.y + b.height <= 667, `${sel} ${JSON.stringify(b)}`);
	}
});

test('run at 375x812 stacks current-scene, party, journal in one column', async () => {
	const p = await open(full, [375, 812]);
	const [s, pa, j] = await Promise.all(['current-scene', 'party', 'journal'].map((i) => box(p, i)));
	assert.ok(pa.y >= s.y + s.height - 1, 'party below scene');
	assert.ok(j.y >= pa.y + pa.height - 1, 'journal below party');
	assert.ok(Math.abs(s.x - pa.x) <= 1 && Math.abs(s.x - j.x) <= 1, 'same left');
	const l = p.locator('[data-testid=character-card]');
	const a = await l.nth(0).boundingBox(), b = await l.nth(1).boundingBox();
	assert.ok(Math.abs(a.x - b.x) <= 1 && b.y > a.y, 'cards in 1 column');
});

test('run at 768x1024: scene full width, party in 2 columns, journal full width', async () => {
	const p = await open(full, [768, 1024]);
	const run = await box(p, 'run');
	const [s, pa, j] = await Promise.all(['current-scene', 'party', 'journal'].map((i) => box(p, i)));
	assert.ok(Math.abs(s.width - run.width) <= 2, `scene ${s.width} vs ${run.width}`);
	assert.ok(Math.abs(j.width - run.width) <= 2, `journal ${j.width} vs ${run.width}`);
	assert.ok(pa.y >= s.y + s.height - 1, 'party below scene');
	assert.ok(j.y >= pa.y + pa.height - 1, 'journal below party');
	const l = p.locator('[data-testid=character-card]');
	const a = await l.nth(0).boundingBox(), b = await l.nth(1).boundingBox();
	assert.ok(Math.abs(a.y - b.y) <= 2 && Math.abs(a.x - b.x) > 10, 'cards side by side');
});

for (const vp of [[1024, 768], [1180, 820]]) {
	test(`run at ${vp.join('x')}: scene and journal left (2/3), party right (1/3)`, async () => {
		const p = await open(full, vp);
		const [s, pa, j] = await Promise.all(['current-scene', 'party', 'journal'].map((i) => box(p, i)));
		assert.ok(Math.abs(s.y - pa.y) <= 4, `tops ${s.y} ${pa.y}`);
		assert.ok(pa.x >= s.x + s.width - 1, 'party right of scene');
		assert.ok(j.y >= s.y + s.height - 1, 'journal below scene');
		assert.ok(j.x + j.width <= pa.x + 1, 'journal left of party');
		const ratio = s.width / pa.width;
		assert.ok(ratio > 1.7 && ratio < 2.3, `ratio ${ratio}`);
		const l = p.locator('[data-testid=character-card]');
		const a = await l.nth(0).boundingBox(), b = await l.nth(1).boundingBox();
		assert.ok(Math.abs(a.x - b.x) <= 1 && b.y > a.y, 'cards stacked');
	});
}

test('no scene: one-line block with the text and the Build link on the same line', async () => {
	const p = await open(empty, [1024, 768]);
	const r = await p.locator('[data-testid=current-scene]').evaluate((e, text) => {
		const link = e.querySelector('a[href*="step=build"]');
		let node = null;
		const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.includes(text)) { node = n; break; }
		let ty = null;
		if (node) { const rg = document.createRange(); rg.selectNodeContents(node); const b = rg.getBoundingClientRect(); ty = b.y + b.height / 2; }
		const lb = link && link.getBoundingClientRect();
		return { hasLink: !!link, hasText: !!node, ty, ly: lb && lb.y + lb.height / 2, h: e.getBoundingClientRect().height };
	}, en['run.noScene']);
	assert.ok(r.hasText, 'no-scene text');
	assert.ok(r.hasLink, 'link to step=build');
	assert.ok(Math.abs(r.ty - r.ly) <= 6, `centres ${r.ty} ${r.ly}`);
	assert.ok(r.h < 100, `height ${r.h}`);
});

for (const js of [true, false]) {
	test(`clicking + on Fear increments it by 1 ${js ? 'with' : 'without'} JavaScript`, async () => {
		const p = await open(empty, [1024, 768], { javaScriptEnabled: js });
		const read = async () => Number((await p.locator('[data-testid=fear]').innerText()).trim());
		const before = await read();
		await p.locator('[data-testid=fear] >> xpath=ancestor::form//button[@value="1"]').click();
		await p.waitForFunction(([b]) => Number(document.querySelector('[data-testid=fear]').textContent.trim()) === b + 1, [before]);
		assert.equal(await read(), before + 1);
	});
}
