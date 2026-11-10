import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const VIEWPORTS = [['phone', 375, 667], ['desktop', 1280, 800]];
const LANGS = ['en', 'fr'];
const PALETTE = {
	'--bg': '#0f1a15', '--surface': '#1a2a22', '--text': '#efe4c8', '--muted': '#b9b08f',
	'--accent': '#d4a050', '--teal': '#6cc3b5', '--danger': '#ee8070'
};
const rgb = (hex) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
	});
	const json = res.status === 204 ? null : await res.json();
	assert.ok(res.status < 300, `${method} ${path}: ${res.status}`);
	return json;
}

let browser, campaignPath, chars = [];
before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Design campaign' });
	await api('POST', `/api/campaigns/${camp.id}/fear`, { delta: 3 });
	for (let i = 0; i < 3; i++) {
		const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
			name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
			severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
		});
		await api('PUT', `/api/characters/${ch.id}/conditions`, {
			vulnerable: i === 0, restrained: i === 1, hidden: i === 2
		});
		if (i === 0) await api('POST', `/api/characters/${ch.id}/hp`, { delta: 6 });
		await api('POST', `/api/characters/${ch.id}/items`, { name: `Item ${i}`, quantity: 2 });
		chars.push(ch.id);
	}
	campaignPath = `/campaigns/${camp.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function withPage(path, w, h, lang, fn) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	const requests = [];
	page.on('request', (r) => requests.push(r.url()));
	try {
		await page.goto(BASE + path, { waitUntil: 'networkidle' });
		return await fn(page, requests);
	} finally { await ctx.close(); }
}
const pages = () => [['/', 'home'], [campaignPath, 'campaign'], [`/characters/${chars[0]}`, 'character']];
async function eachCombo(fn) {
	for (const [path, name] of pages())
		for (const [vp, w, h] of VIEWPORTS)
			for (const lang of LANGS)
				await withPage(path, w, h, lang, (page, reqs) => fn(page, `${name} ${vp} ${lang}`, reqs));
}

test('palette: :root defines the seven custom properties', async () => {
	await withPage('/', 1280, 800, 'en', async (page) => {
		const vals = await page.evaluate((names) => names.map((n) =>
			getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase()),
			Object.keys(PALETTE));
		assert.deepEqual(vals, Object.values(PALETTE));
	});
});

test('palette: no colour literal in src outside the :root definitions', () => {
	const files = [];
	const walk = (d) => {
		for (const f of readdirSync(d)) {
			const p = join(d, f);
			if (statSync(p).isDirectory()) walk(p);
			else if (/\.(svelte|css)$/.test(f)) files.push(p);
		}
	};
	walk('src');
	assert.ok(files.length > 0);
	const names = '(?:black|white|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|silver|gold|teal|navy|maroon|olive|lime|aqua|cyan|magenta|fuchsia|tan|beige|ivory|khaki|crimson|coral|salmon|indigo|violet|wheat|linen|snow)';
	const bad = [];
	for (const f of files) {
		let src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		src = src.replace(/^\s*--(?:bg|surface|text|muted|accent|teal|danger)\s*:[^;]*;/gm, '');
		const re = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\\(|:[^;{}]*\\b${names}\\b`, 'g');
		for (const m of src.matchAll(re)) bad.push(`${f}: ${m[0]}`);
	}
	assert.deepEqual(bad, []);
});

test('body has the dark stone background and parchment text', async () => {
	await eachCombo(async (page, id) => {
		const s = await page.evaluate(() => {
			const c = getComputedStyle(document.body);
			return [c.backgroundColor, c.color];
		});
		assert.deepEqual(s, [rgb('#0f1a15'), rgb('#efe4c8')], id);
	});
});

test('character-card has surface background and 3px double accent border', async () => {
	for (const [vp, w, h] of VIEWPORTS) for (const lang of LANGS)
		await withPage(campaignPath, w, h, lang, async (page) => {
			const cards = await page.evaluate(() => [...document.querySelectorAll('[data-testid="character-card"]')].map((e) => {
				const c = getComputedStyle(e);
				return [c.backgroundColor, ...['Top', 'Right', 'Bottom', 'Left'].flatMap((s) =>
					[c[`border${s}Width`], c[`border${s}Style`], c[`border${s}Color`]])];
			}));
			assert.equal(cards.length, 3);
			for (const c of cards) {
				assert.equal(c[0], rgb('#1a2a22'), `${vp} ${lang}`);
				for (let i = 1; i < c.length; i += 3)
					assert.deepEqual(c.slice(i, i + 3), ['3px', 'double', rgb('#d4a050')], `${vp} ${lang}`);
			}
		});
});

test('every button has accent background and bg text colour', async () => {
	await eachCombo(async (page, id) => {
		const bs = await page.evaluate(() => [...document.querySelectorAll('button:not([data-testid^="help-"])')].map((b) => { // us-246: the help buttons have their own look
			const c = getComputedStyle(b); return [c.backgroundColor, c.color];
		}));
		for (const b of bs) assert.deepEqual(b, [rgb('#d4a050'), rgb('#0f1a15')], id);
	});
});

test('contrast: text of every visible element is at least 4.5:1', async () => {
	await eachCombo(async (page, id) => {
		const res = await page.evaluate(() => {
			const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
			const lum = ([r, g, b]) => {
				const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
				return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
			};
			const out = [];
			let n = 0;
			for (const e of document.querySelectorAll('h1,h2,h3,h4,a,button,label,p,span,li,textarea,input,legend,dt,dd,th,td,div,strong,em,small')) {
				const cs = getComputedStyle(e);
				const r = e.getBoundingClientRect();
				if (r.width === 0 || r.height === 0 || cs.visibility !== 'visible' || cs.display === 'none') continue;
				const isField = ['TEXTAREA', 'INPUT'].includes(e.tagName);
				if (e.tagName === 'INPUT' && ['hidden', 'checkbox', 'radio'].includes(e.type)) continue;
				const direct = [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
				if (!direct && !isField) continue;
				n++;
				let bg = null;
				for (let p = e; p; p = p.parentElement) {
					const c = parse(getComputedStyle(p).backgroundColor);
					if (c.length >= 3 && (c.length < 4 || c[3] > 0)) { bg = c; break; }
				}
				bg ??= [255, 255, 255];
				const fg = parse(cs.color);
				const [a, b] = [lum(fg), lum(bg)];
				const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				if (ratio < 4.5) out.push(`${e.tagName} "${(e.textContent || e.value).trim().slice(0, 20)}" ${cs.color} on rgb(${bg}) = ${ratio.toFixed(2)}`);
			}
			return { n, out };
		});
		assert.ok(res.n > 3, `${id}: no text elements found`);
		assert.deepEqual(res.out, [], id);
	});
});

test('focus: keyboard-focused controls get a 2px+ solid teal outline', async () => {
	await eachCombo(async (page, id) => {
		const total = await page.evaluate(() => document.querySelectorAll('button,a,input,select,textarea').length);
		let checked = 0;
		for (let i = 0; i < total + 2; i++) {
			await page.keyboard.press('Tab');
			const s = await page.evaluate(() => {
				const e = document.activeElement;
				if (!e || !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName)) return null;
				const c = getComputedStyle(e);
				return { tag: e.tagName, w: parseFloat(c.outlineWidth), style: c.outlineStyle, color: c.outlineColor };
			});
			if (!s) continue;
			checked++;
			assert.ok(s.w >= 2 && s.style !== 'none' && s.color === rgb('#6cc3b5'), `${id} ${JSON.stringify(s)}`);
		}
		assert.ok(checked > 0, `${id}: nothing focusable reached by Tab`);
	});
});

test('badges are pills with the specified colours', async () => {
	const want = {
		'condition-vulnerable': '#ee8070', 'condition-restrained': '#d4a050',
		'condition-hidden': '#6cc3b5', down: '#ee8070'
	};
	const targets = [[campaignPath, 'campaign'], [`/characters/${chars[0]}`, 'char0'],
		[`/characters/${chars[1]}`, 'char1'], [`/characters/${chars[2]}`, 'char2']];
	const seen = new Set();
	for (const [path, name] of targets) for (const [vp, w, h] of VIEWPORTS) for (const lang of LANGS)
		await withPage(path, w, h, lang, async (page) => {
			const bs = await page.evaluate((ids) => ids.flatMap((id) =>
				[...document.querySelectorAll(`[data-testid="${id}"]`)].map((e) => {
					const c = getComputedStyle(e);
					return { id, color: c.color, bg: c.backgroundColor, radius: parseFloat(c.borderTopLeftRadius), pct: c.borderTopLeftRadius.includes('%'), h: e.getBoundingClientRect().height };
				})), Object.keys(want));
			for (const b of bs) {
				seen.add(b.id);
				const r = b.pct ? b.radius / 100 * b.h : b.radius;
				assert.equal(b.color, rgb('#0f1a15'), `${name} ${vp} ${lang} ${b.id} text`);
				assert.equal(b.bg, rgb(want[b.id]), `${name} ${vp} ${lang} ${b.id} bg`);
				assert.ok(r >= 8, `${name} ${vp} ${lang} ${b.id} radius ${r}`);
			}
		});
	assert.deepEqual([...seen].sort(), Object.keys(want).sort());
});

test('styling adds no external requests', async () => {
	await eachCombo(async (page, id, reqs) => {
		const origin = new URL(BASE).origin;
		const ext = reqs.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
		assert.deepEqual(ext, [], id);
	});
});
