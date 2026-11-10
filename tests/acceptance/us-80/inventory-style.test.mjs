import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const LONG = 'L'.repeat(100);
let browser, charId;
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	const api = async (path, body) => {
		const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		return { status: r.status, json: await r.json() };
	};
	const camp = await api('/api/campaigns', { name: 'Style' });
	const c = await api(`/api/campaigns/${camp.json.id}/characters`, {
		name: 'Rook', class: 'Ranger', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	assert.equal(c.status, 201);
	charId = c.json.id;
	assert.equal((await api(`/api/characters/${charId}/items`, { name: 'Rope', quantity: 2 })).status, 201);
	assert.equal((await api(`/api/characters/${charId}/items`, { name: LONG, quantity: 1 })).status, 201);
});
after(async () => { await browser?.close(); });

async function open(lang, width, height) {
	const ctx = await browser.newContext({ viewport: { width, height } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	await page.goto(BASE + `/characters/${charId}`);
	await page.locator('table[data-testid="inventory"]').waitFor();
	return { ctx, page };
}

// Resolve a CSS colour to [r,g,b,a] in the page.
const RESOLVE = `(c) => { const e = document.createElement('i'); e.style.color = c; document.body.append(e);
	const v = getComputedStyle(e).color; e.remove(); return v; }`;
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function var_(page, name) {
	return page.evaluate(`(() => { const v = getComputedStyle(document.documentElement).getPropertyValue('${name}').trim(); return (${RESOLVE})(v); })()`);
}

test('table width equals container width and border-collapse is collapse', async () => {
	for (const [w, h] of [[1280, 800], [375, 667]]) {
		const { ctx, page } = await open('en', w, h);
		const r = await page.locator('table[data-testid="inventory"]').evaluate((t) => {
			const s = getComputedStyle(t), p = (() => { let q = t.parentElement; while (getComputedStyle(q).display === 'contents') q = q.parentElement; return q; })(), ps = getComputedStyle(p);
			const inner = p.getBoundingClientRect().width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
			return { collapse: s.borderCollapse, w: t.getBoundingClientRect().width, inner };
		});
		assert.equal(r.collapse, 'collapse');
		assert.ok(Math.abs(r.w - r.inner) <= 1, `width ${r.w} vs container ${r.inner} at ${w}`);
		await ctx.close();
	}
});

test('th: muted colour, left aligned, 1px accent bottom border; tbody tr: 1px muted bottom border; padding >= 8px; contrast >= 4.5', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, 1280, 800);
		const muted = await var_(page, '--muted'), accent = await var_(page, '--accent');
		const ths = await page.locator('table[data-testid="inventory"] th').evaluateAll((l) => l.map((e) => {
			const s = getComputedStyle(e);
			return { color: s.color, align: s.textAlign, bw: s.borderBottomWidth, bs: s.borderBottomStyle, bc: s.borderBottomColor,
				pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat) };
		}));
		assert.equal(ths.length, 3);
		for (const t of ths) {
			assert.equal(t.color, muted);
			assert.ok(['left', 'start'].includes(t.align), t.align);
			assert.equal(t.bw, '1px'); assert.equal(t.bs, 'solid'); assert.equal(t.bc, accent);
			for (const p of t.pad) assert.ok(p >= 8, `th padding ${p}`);
		}
		const rows = await page.locator('table[data-testid="inventory"] tbody tr').evaluateAll((l) => l.map((e) => {
			const s = getComputedStyle(e);
			return { bw: s.borderBottomWidth, bs: s.borderBottomStyle, bc: s.borderBottomColor };
		}));
		assert.ok(rows.length >= 2);
		for (const r of rows) { assert.equal(r.bw, '1px'); assert.equal(r.bs, 'solid'); assert.equal(r.bc, muted); }
		const cells = await page.locator('table[data-testid="inventory"] th, table[data-testid="inventory"] td').evaluateAll((l) => l.map((e) => {
			const s = getComputedStyle(e);
			let bg = 'rgba(0, 0, 0, 0)', n = e;
			while (n) { const c = getComputedStyle(n).backgroundColor; if (!/rgba?\(.*,\s*0\)$/.test(c) && c !== 'transparent') { bg = c; break; } n = n.parentElement; }
			return { color: s.color, bg, pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat) };
		}));
		assert.equal(cells.length, 9);
		for (const c of cells) {
			for (const p of c.pad) assert.ok(p >= 8, `cell padding ${p}`);
			const ratio = contrast(parse(c.color), parse(c.bg));
			assert.ok(ratio >= 4.5, `contrast ${ratio} (${c.color} on ${c.bg})`);
		}
		await ctx.close();
	}
});

test('at 1280x800 the three tds of a row have the same top (within 1px)', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, 1280, 800);
		const rows = await page.locator('table[data-testid="inventory"] tbody tr').evaluateAll((l) => l.map((r) => [...r.querySelectorAll(':scope > td')].map((d) => d.getBoundingClientRect().top)));
		assert.equal(rows.length, 2);
		for (const tops of rows) {
			assert.equal(tops.length, 3);
			assert.ok(Math.max(...tops) - Math.min(...tops) <= 1, `tops ${tops}`);
		}
		await ctx.close();
	}
});

test('at 375x667 rows are stacked cards: thead visually hidden but 3 columnheaders, td block, no sideways scroll', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, 375, 667);
		assert.equal(await page.getByRole('columnheader').count(), 3);
		const r = await page.evaluate(() => {
			const t = document.querySelector('table[data-testid="inventory"]');
			const th = t.querySelector('thead'), s = getComputedStyle(th);
			const heads = [...t.querySelectorAll('th')].map((e) => {
				const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
				return { visible: cs.display !== 'none' && cs.visibility !== 'hidden', tiny: b.width <= 1 || b.height <= 1 || b.right <= 0 || b.bottom <= 0, clip: cs.clip !== 'auto' || cs.clipPath !== 'none' };
			});
			const tb = th.getBoundingClientRect();
			return {
				display: s.display, vis: s.visibility, heads, theadTiny: tb.width <= 1 || tb.height <= 1 || tb.right <= 0 || tb.bottom <= 0,
				tds: [...t.querySelectorAll('td')].map((e) => getComputedStyle(e).display),
				sw: t.scrollWidth, cw: t.clientWidth,
				docSw: document.documentElement.scrollWidth, docCw: document.documentElement.clientWidth,
				bodySw: document.body.scrollWidth, bodyCw: document.body.clientWidth,
				tdWidths: [...t.querySelectorAll('td')].map((e) => e.getBoundingClientRect().right),
			};
		});
		assert.notEqual(r.display, 'none');
		assert.notEqual(r.vis, 'hidden');
		for (const h of r.heads) { assert.ok(h.visible); assert.ok(h.tiny || h.clip || r.theadTiny, 'header not visually hidden'); }
		assert.equal(r.tds.length, 6);
		for (const d of r.tds) assert.equal(d, 'block');
		assert.ok(r.sw <= r.cw, `table scrollWidth ${r.sw} > clientWidth ${r.cw}`);
		assert.ok(r.docSw <= r.docCw, `page scrolls sideways ${r.docSw} > ${r.docCw}`);
		assert.ok(r.bodySw <= r.bodyCw, `body scrolls sideways ${r.bodySw} > ${r.bodyCw}`);
		for (const x of r.tdWidths) assert.ok(x <= 375, `td overflows viewport (${x})`);
		await ctx.close();
	}
});

test('en and fr: 44px touch targets and 16px text still hold in the table at both sizes', async () => {
	for (const lang of ['en', 'fr']) {
		for (const [w, h] of [[1280, 800], [375, 667]]) {
			const { ctx, page } = await open(lang, w, h);
			const r = await page.locator('table[data-testid="inventory"]').evaluate((t) => ({
				ctl: [...t.querySelectorAll('button:not([data-testid^="help-"]), input:not([type=hidden])')].map((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height, parseFloat(getComputedStyle(e).fontSize)]; }),
				text: [...t.querySelectorAll('th, td, td *')].map((e) => parseFloat(getComputedStyle(e).fontSize)),
			}));
			assert.ok(r.ctl.length >= 4);
			for (const [bw, bh, fs] of r.ctl) { assert.ok(bw >= 44 - 0.5 && bh >= 44 - 0.5, `target ${bw}x${bh}`); assert.ok(fs >= 16, `control font ${fs}`); }
			for (const fs of r.text) assert.ok(fs >= 16, `font ${fs}`);
			await ctx.close();
		}
	}
});
