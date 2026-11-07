import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser, campaigns = [], characterPath;
const json = (b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

before(async () => {
	for (const n of ['Card one', 'Card two', 'Card three']) {
		campaigns.push(await (await fetch(BASE + '/api/campaigns', json({ name: n }))).json());
	}
	const ch = await (await fetch(`${BASE}/api/campaigns/${campaigns[0].id}/characters`, json({
		name: 'Hero', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
	}))).json();
	characterPath = `/characters/${ch.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function open(path, width = 1280) {
	const ctx = await browser.newContext({ viewport: { width, height: 800 } });
	const page = await ctx.newPage();
	await page.goto(BASE + path);
	return { page, close: () => ctx.close() };
}

const PAGES = [['/', 'home'], ['/reference', 'reference']];
const LIST = { '/': 'ul.list', '/reference': 'ul.list.ref-list, .ref-list.list' };

// Returns data about every list.
const collect = (page) => page.evaluate(() => {
	const root = getComputedStyle(document.documentElement);
	const probe = (prop) => { const e = document.createElement('i'); e.style.color = `var(${prop})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
	const lists = [...document.querySelectorAll('ul.list, ol.list')].map((ul) => {
		const cs = getComputedStyle(ul);
		const lis = [...ul.children].filter((c) => c.tagName === 'LI').map((li) => {
			const s = getComputedStyle(li), r = li.getBoundingClientRect();
			return {
				bg: s.backgroundColor, bw: s.borderLeftWidth, bs: s.borderLeftStyle, bc: s.borderLeftColor,
				radius: Math.min(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((k) => parseFloat(s[k]))),
				top: r.top, bottom: r.bottom, left: r.left, right: r.right
			};
		});
		return { lst: cs.listStyleType, pl: cs.paddingLeft, cls: ul.className, lis };
	});
	return { lists, surface: probe('--surface'), accent: probe('--accent') };
});

for (const [path, name] of PAGES) {
	test(`${name}: list element has class list, list-style-type none, padding-left 0`, async () => {
		const { page, close } = await open(path);
		try {
			const d = await collect(page);
			assert.ok(d.lists.length >= 1, 'no .list element');
			if (path === '/reference') assert.equal(await page.locator('.ref-list:not(.list)').count(), 0);
			for (const l of d.lists) { assert.equal(l.lst, 'none'); assert.equal(l.pl, '0px'); }
			if (path === '/') assert.ok(d.lists[0].lis.length >= 2);
		} finally { await close(); }
	});

	test(`${name}: each li has surface background, 3px solid accent left border, radius >= 8px, gap >= 8px`, async () => {
		const { page, close } = await open(path);
		try {
			const d = await collect(page);
			let n = 0;
			for (const l of d.lists) {
				l.lis.forEach((li, i) => {
					n++;
					assert.equal(li.bg, d.surface);
					assert.equal(li.bw, '3px');
					assert.equal(li.bs, 'solid');
					assert.equal(li.bc, d.accent);
					assert.ok(li.radius >= 8, `radius ${li.radius}`);
					if (i > 0) {
						const p = l.lis[i - 1];
						// side by side in a grid row: check the column gap; otherwise the row gap
						const sameRow = li.top < p.bottom && p.top < li.bottom;
						const gap = sameRow ? li.left - p.right : li.top - p.bottom;
						assert.ok(gap >= 8, `gap ${gap}`);
					}
				});
			}
			assert.ok(n >= 2);
		} finally { await close(); }
	});
}

test('home: campaign-link width equals li content width and height >= 44px', async () => {
	const { page, close } = await open('/');
	try {
		const res = await page.evaluate(() => [...document.querySelectorAll('[data-testid="campaign-link"]')].map((a) => {
			const li = a.closest('li'), s = getComputedStyle(li), r = a.getBoundingClientRect();
			const cw = li.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
			return { w: r.width, cw, h: r.height };
		}));
		assert.ok(res.length >= 2);
		for (const r of res) {
			assert.ok(Math.abs(r.w - r.cw) <= 1, `width ${r.w} vs ${r.cw}`);
			assert.ok(r.h >= 44, `height ${r.h}`);
		}
	} finally { await close(); }
});

test('home: clicking at the right end of the row navigates to that campaign', async () => {
	const { page, close } = await open('/');
	try {
		const a = page.locator('[data-testid="campaign-link"]', { hasText: 'Card two' });
		const li = a.locator('xpath=ancestor::li');
		const b = await a.boundingBox();
		const lb = await li.boundingBox();
		const x = Math.min(b.x + b.width - 3, lb.x + lb.width - 4);
		await page.mouse.click(x, b.y + b.height / 2);
		await page.waitForURL(`**/campaigns/${campaigns[1].id}`);
	} finally { await close(); }
});

test('ul.stats keeps its computed styles', async () => {
	const { page, close } = await open(characterPath);
	try {
		const s = await page.evaluate(() => {
			const cs = getComputedStyle(document.querySelector('ul.stats'));
			return { ls: cs.listStyleType, pl: cs.paddingLeft, bg: cs.backgroundColor, bw: ['Top', 'Right', 'Bottom', 'Left'].map((k) => cs['border' + k + 'Width']), bs: cs.borderLeftStyle };
		});
		assert.equal(s.ls, 'none');
		assert.equal(s.pl, '0px');
		assert.equal(s.bg, 'rgba(0, 0, 0, 0)');
		assert.deepEqual(s.bw, ['0px', '0px', '0px', '0px']);
		assert.equal(s.bs, 'none');
		assert.equal(await page.locator('ul.stats.list').count(), 0);
	} finally { await close(); }
});

for (const [path, name] of PAGES) {
	test(`${name}: no sideways scroll at 375px and text contrast >= 4.5`, async () => {
		const { page, close } = await open(path, 375);
		try {
			const r = await page.evaluate(() => {
				const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
				const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
				const out = [];
				for (const li of document.querySelectorAll('ul.list > li')) {
					const bg = getComputedStyle(li).backgroundColor;
					for (const el of [li, ...li.querySelectorAll('a, span')]) {
						if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
						out.push(ratio(getComputedStyle(el).color, bg));
					}
				}
				return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, out };
			});
			assert.ok(r.sw <= r.cw, `scrollWidth ${r.sw} > ${r.cw}`);
			assert.ok(r.out.length > 0);
			for (const c of r.out) assert.ok(c >= 4.5, `contrast ${c}`);
		} finally { await close(); }
	});
}
