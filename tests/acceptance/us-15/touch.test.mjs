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

each('every visible button, a, input, select and textarea is at least 44x44 CSS px', async (page, where) => {
	const { n, bad } = await page.evaluate(() => {
		const visible = (e) => {
			const r = e.getBoundingClientRect();
			const cs = getComputedStyle(e);
			return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
		};
		const desc = (e) => {
			const r = e.getBoundingClientRect();
			return `${e.tagName.toLowerCase()}${e.type ? '[' + e.type + ']' : ''}${e.dataset.testid ? '#' + e.dataset.testid : ''} "${(e.textContent || e.name || '').trim().slice(0, 20)}" ${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`;
		};
		const bad = [];
		let n = 0;
		for (const e of document.querySelectorAll('button, a, input, select, textarea')) {
			if (e.tagName === 'INPUT' && e.type === 'hidden') continue;
			const isCheck = e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio');
			const target = isCheck ? e.closest('label') : e;
			if (isCheck) {
				// the control may be visually hidden; only the label must be visible and large
				if (!target) { bad.push('no containing label: ' + desc(e)); n++; continue; }
				if (!visible(target) && !visible(e)) continue;
			} else if (!visible(e)) continue;
			n++;
			const r = target.getBoundingClientRect();
			if (r.width < 43.99 || r.height < 43.99) bad.push(desc(target));
		}
		return { n, bad };
	});
	assert.ok(n > 0, `${where}: no interactive elements found`);
	assert.deepEqual(bad, [], `${where}: touch targets smaller than 44x44`);
});

each('document.documentElement.scrollWidth <= window.innerWidth', async (page, where) => {
	const { sw, iw } = await page.evaluate(() => ({
		sw: document.documentElement.scrollWidth, iw: window.innerWidth
	}));
	assert.ok(sw <= iw, `${where}: scrollWidth ${sw} > innerWidth ${iw}`);
});
