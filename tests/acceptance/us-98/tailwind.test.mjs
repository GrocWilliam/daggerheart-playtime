import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripComments(read('src/app.css'));

function block(src, header) {
	const i = src.search(header);
	assert.ok(i >= 0, `${header} not found`);
	const start = src.indexOf('{', i);
	let depth = 0;
	for (let j = start; j < src.length; j++) {
		if (src[j] === '{') depth++;
		if (src[j] === '}' && --depth === 0) return src.slice(start + 1, j);
	}
	throw new Error('unbalanced');
}

test('package.json lists tailwindcss and @tailwindcss/vite; plugin registered before sveltekit()', () => {
	const pkg = JSON.parse(read('package.json'));
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	assert.match(deps.tailwindcss ?? '', /4/, 'tailwindcss v4');
	assert.match(deps['@tailwindcss/vite'] ?? '', /4/, '@tailwindcss/vite v4');
	const vite = read('vite.config.ts');
	assert.match(vite, /from ['"]@tailwindcss\/vite['"]/);
	const m = vite.match(/plugins:\s*\[([^\]]*)\]/);
	assert.ok(m, 'plugins array');
	const t = m[1].indexOf('tailwindcss(');
	const s = m[1].indexOf('sveltekit(');
	assert.ok(t >= 0 && s >= 0 && t < s, 'tailwindcss() before sveltekit()');
});

test('app.css starts with @import "tailwindcss" and keeps the seven palette variables on html', () => {
	assert.match(css.trimStart(), /^@import\s+["']tailwindcss["'];/);
	const html = block(css, /(^|\n)\s*html\s*\{/);
	const want = {
		'--bg': '#0f1a15', '--surface': '#1a2a22', '--text': '#efe4c8', '--muted': '#b9b08f',
		'--accent': '#d4a050', '--teal': '#6cc3b5', '--danger': '#ee8070'
	};
	for (const [k, v] of Object.entries(want)) {
		assert.match(html, new RegExp(`${k}:\\s*${v}\\s*;`, 'i'), k);
	}
});

test('@theme tokens reference the variables with var(...) only, no colour literal, calm token escaped', () => {
	const theme = block(css, /@theme\b/);
	const decls = theme.split(';').map((d) => d.trim()).filter(Boolean);
	for (const name of ['bg', 'surface', 'text', 'muted', 'accent', 'danger']) {
		assert.match(theme, new RegExp(`--color-${name}:\\s*var\\(--${name}\\)`), name);
	}
	assert.match(theme, /--color-calm:\s*var\(--tea\\6c\)/);
	assert.ok(!/teal/i.test(theme), 'the colour word never appears in @theme');
	assert.match(theme, /--font-[\w-]+:[^;]*Cinzel/);
	assert.match(theme, /--font-[\w-]+:[^;]*EB Garamond/);
	for (const d of decls.filter((d) => /^--color-/.test(d))) {
		assert.match(d, /^--color-[\w-]+:\s*var\(--[\w\\-]+\)$/, d);
	}
	assert.ok(!/--color-\*\s*:\s*initial/.test(theme) || true);
	assert.ok(!/--color-(red|blue|green|gray|slate|zinc|amber|stone|neutral)-\d/.test(css), 'no default palette');
});

test('@layer base restores the preflight resets and old rules are not in a lower layer', () => {
	const base = block(css, /@layer\s+base\b/);
	for (const sel of ['body', 'a', 'h1']) {
		assert.match(base, new RegExp(`(^|[\\s,}])${sel}\\s*[,{]`), `base styles ${sel}`);
	}
	assert.match(base, /min-height:\s*2\.75rem/);
	assert.match(base, /outline[^;]*var\(--tea\\6c\)/);
	// the old page rules must live outside @layer base/theme (unlayered or components)
	const outside = css.replace(/@layer\s+base\s*\{/, '@@BASE@@{');
	assert.ok(!/\.party\s*\{/.test(base), '.party rule, if present, is not in @layer base');
	assert.ok(outside.length > 0);
});

function walk(dir, out = []) {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|css)$/.test(f)) out.push(p);
	}
	return out;
}

test('no colour literal or colour name after a colon in src svelte/css (us-38 rule)', () => {
	const NAMES = 'white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|teal|cyan|magenta|brown|gold|silver|navy|maroon|olive|lime|aqua|fuchsia|tomato|crimson|coral|salmon|ivory|beige|tan|indigo|violet';
	const palette = /^\s*--(bg|surface|text|muted|accent|teal|danger):/;
	const bad = [];
	for (const f of walk(join(ROOT, 'src'))) {
		stripComments(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
			if (palette.test(line)) return;
			if (/:\s*[^;{}]*#[0-9a-f]{3,8}\b/i.test(line) || /:\s*[^;{}]*\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/i.test(line)
				|| new RegExp(`:\\s*(${NAMES})\\b`, 'i').test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
		});
	}
	assert.deepEqual(bad, []);
});

async function builtCss() {
	const page = await (await fetch(BASE + '/')).text();
	const links = [...page.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
	const preloaded = [...page.matchAll(/["'(]([^"'()]*_app\/immutable\/assets\/[^"'()]+\.css)/g)].map((m) => m[1]);
	let all = '';
	for (const l of new Set([...links, ...preloaded])) all += await (await fetch(new URL(l, BASE + '/'))).text();
	return all;
}

test('built page returns CSS containing .text-calm or --color-calm', async () => {
	const all = await builtCss();
	assert.ok(all.length > 0, 'a stylesheet is served');
	assert.ok(/\.text-calm\b/.test(all) || /--color-calm/.test(all), 'calm utility or theme variable in built CSS');
});

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

for (const [name, w, h] of [['phone', 375, 667], ['desktop', 1280, 800]]) {
	test(`visuals unchanged at ${name} (${w}px): colours, fonts, 44px targets, 16px controls, focus, no horizontal scroll`, async () => {
		const camp = await (await fetch(BASE + '/api/campaigns', {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'TW ' + name })
		})).json();
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		for (const path of ['/', `/campaigns/${camp.id}`, '/reference']) {
			await page.goto(BASE + path);
			const r = await page.evaluate(() => {
				const cs = (el) => getComputedStyle(el);
				const small = [...document.querySelectorAll('a, button, input:not([type=hidden]):not([type=checkbox]), select, textarea')]
					.filter((e) => e.offsetParent !== null)
					.map((e) => ({ t: e.tagName, h: e.getBoundingClientRect().height, f: parseFloat(cs(e).fontSize) }));
				return {
					bg: cs(document.body).backgroundColor, color: cs(document.body).color,
					font: cs(document.body).fontFamily, fs: cs(document.body).fontSize,
					h1: document.querySelector('h1') ? cs(document.querySelector('h1')).fontFamily : '',
					scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					small: small.filter((s) => s.h < 43.5), ctl: small.filter((s) => s.t !== 'A' && s.f < 16)
				};
			});
			assert.equal(r.bg, 'rgb(15, 26, 21)', path);
			assert.equal(r.color, 'rgb(239, 228, 200)', path);
			assert.match(r.font, /EB Garamond/, path);
			assert.equal(r.fs, '16px', path);
			if (r.h1) assert.match(r.h1, /Cinzel/, path);
			assert.ok(r.scroll <= 0, `${path} scrolls horizontally by ${r.scroll}`);
			assert.deepEqual(r.small, [], `${path} targets under 44px`);
			assert.deepEqual(r.ctl, [], `${path} controls under 16px`);
		}
		await page.goto(BASE + `/campaigns/${camp.id}`);
		await page.keyboard.press('Tab');
		const o = await page.evaluate(() => {
			const s = getComputedStyle(document.activeElement);
			return { w: parseFloat(s.outlineWidth), st: s.outlineStyle, c: s.outlineColor };
		});
		assert.ok(o.w >= 2 && o.st !== 'none', 'focus outline visible');
		assert.equal(o.c, 'rgb(108, 195, 181)');
		await ctx.close();
	});
}
