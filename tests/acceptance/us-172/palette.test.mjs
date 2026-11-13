import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const PALETTE = {
	'--bg': '#0f1a15', '--surface': '#1a2a22', '--text': '#efe4c8', '--muted': '#b9b08f',
	'--accent': '#d4a050', '--teal': '#6cc3b5', '--danger': '#ee8070'
};
const rgb = (hex) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const api = async (method, path, body) => {
	const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	assert.ok(res.status < 300, `${method} ${path}: ${res.status}`);
	return res.status === 204 ? null : res.json();
};

let browser, campaignPath;
before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Palette campaign' });
	for (let i = 0; i < 2; i++) await api('POST', `/api/campaigns/${camp.id}/characters`, {
		name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
		severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
	});
	campaignPath = `/campaigns/${camp.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function withPage(path, w, fn, lang = 'en') {
	const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, extraHTTPHeaders: { 'accept-language': lang } });
	try {
		const page = await ctx.newPage();
		await page.goto(BASE + path);
		return await fn(page);
	} finally { await ctx.close(); }
}

test('html custom properties equal the seven forest-and-bronze values', async () => {
	await withPage(campaignPath, 1280, async (page) => {
		const v = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, getComputedStyle(document.documentElement).getPropertyValue(k).trim().toLowerCase()])), Object.keys(PALETTE));
		assert.deepEqual(v, PALETTE);
	});
});

test('app.css defines the palette, stays under 150 lines and keeps --teal escaped', () => {
	const css = readFileSync(join(process.env.ROOT, 'src/app.css'), 'utf8');
	for (const [k, v] of Object.entries(PALETTE)) {
		if (k === '--teal') continue;
		assert.ok(css.includes(`${k}: ${v};`), k);
	}
	assert.ok(css.includes('var(--tea\\6c)'));
	assert.ok(css.split('\n').length < 150, `${css.split('\n').length} lines`);
});

test('contrast >= 4.5:1 for text on bg and surface; buttons use bg text on accent', async () => {
	for (const w of [375, 1280]) for (const lang of ['en', 'fr'])
		await withPage(campaignPath, w, async (page) => {
			const r = await page.evaluate(() => {
				const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
				const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
				const root = getComputedStyle(document.documentElement);
				const bgs = [root.getPropertyValue('--bg').trim(), root.getPropertyValue('--surface').trim()];
				const colors = new Set();
				for (const e of document.querySelectorAll('body *')) {
					if (e.offsetParent === null || !(e.textContent || '').trim() || e.tagName === 'BUTTON' || e.matches('a[aria-current]')) continue;
					if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
					colors.add(getComputedStyle(e).color);
				}
				const bad = [];
				for (const c of colors) for (const bg of bgs) {
					const el = document.createElement('i'); el.style.color = bg; document.body.append(el);
					const bgc = getComputedStyle(el).color; el.remove();
					if (ratio(c, bgc) < 4.5) bad.push(`${c} on ${bgc}`);
				}
				const btns = [...document.querySelectorAll('button:not([data-testid^="help-"]):not([name=delta])')].filter((b) => b.offsetParent !== null).map((b) => [getComputedStyle(b).color, getComputedStyle(b).backgroundColor]);
				return { bad, btns };
			});
			assert.deepEqual(r.bad, [], `${w} ${lang}`);
			assert.ok(r.btns.length > 0);
			for (const [c, bg] of r.btns) assert.deepEqual([c, bg], [rgb(PALETTE['--bg']), rgb(PALETTE['--accent'])]);
		}, lang);
});

test('body has a fixed radial-gradient background', async () => {
	await withPage(campaignPath, 1280, async (page) => {
		const b = await page.evaluate(() => { const s = getComputedStyle(document.body); return [s.backgroundImage, s.backgroundAttachment]; });
		assert.ok(b[0].includes('radial-gradient'), b[0]);
		assert.equal(b[1], 'fixed');
	});
});

test('article has a 3px double accent border, radius 8px; forms have no box (us-300); character cards 3px double', async () => {
	for (const w of [375, 1280])
		await withPage(campaignPath, w, async (page) => {
			const r = await page.evaluate(() => {
				const pick = (e) => { const s = getComputedStyle(e); return ['Top', 'Right', 'Bottom', 'Left'].map((d) => [s[`border${d}Style`], s[`border${d}Width`], s[`border${d}Color`]]).concat([[s.borderTopLeftRadius, s.borderBottomRightRadius, s.backgroundColor]]); };
				const out = { article: [...document.querySelectorAll('article')].map(pick), form: [], cards: [...document.querySelectorAll('[data-testid="character-card"]')].map(pick) };
				out.form = [...document.querySelectorAll('form')].filter((f) => !f.closest('table, article, [data-testid="character-card"]') && !(f.getAttribute('action') || '').includes('/fear')).map(pick);
				return out;
			});
			const side = [['double', '3px', rgb(PALETTE['--accent'])]];
			const check = (p, name, bgToo) => {
				for (let i = 0; i < 4; i++) assert.deepEqual(p[i], side[0], name);
				if (bgToo) assert.deepEqual(p[4], ['8px', '8px', rgb(PALETTE['--surface'])], name);
			};
			assert.ok(r.cards.length >= 2);
			assert.ok(r.form.length >= 1, 'a form on the campaign page');
			for (const p of r.article) check(p, 'article', true);
			// us-300 removed the box around forms: no border, transparent background
			for (const p of r.form) { for (let i = 0; i < 4; i++) assert.equal(p[i][0], 'none', 'form'); assert.equal(p[4][2], 'rgba(0, 0, 0, 0)', 'form'); }
			for (const p of r.cards) check(p, 'character-card', false);
		});
});

test('h1 has letter-spacing 0.05em and the accent colour', async () => {
	for (const path of ['/', campaignPath])
		await withPage(path, 1280, async (page) => {
			const h = await page.evaluate(() => { const e = document.querySelector('h1'); const s = getComputedStyle(e); return [s.letterSpacing, s.color, s.fontSize]; });
			assert.ok(Math.abs(parseFloat(h[0]) - 0.05 * parseFloat(h[2])) < 0.05, JSON.stringify(h));
			assert.equal(h[1], rgb(PALETTE['--accent']));
		});
});

test('focus outline stays 2px solid teal and there is no sideways scroll', async () => {
	await withPage(campaignPath, 375, async (page) => {
		await page.keyboard.press('Tab');
		const o = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineColor, s.outlineWidth, s.outlineStyle, document.documentElement.scrollWidth - document.documentElement.clientWidth]; });
		assert.deepEqual(o, [rgb(PALETTE['--teal']), '2px', 'solid', 0]);
	});
});
