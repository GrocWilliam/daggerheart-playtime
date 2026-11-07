import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const FILES = ['src/routes/+layout.svelte', 'src/routes/+page.svelte', 'src/lib/components/LanguageSwitcher.svelte'];

test('app.css has none of the old selectors for the layout, switcher and home page', () => {
	const css = stripComments(read('src/app.css'));
	const bad = [];
	for (const re of [/\.site-header\b/, /\.lang-switcher\b/, /(^|[\s,}{])nav\b/, /campaign-link/, /language-switcher/, /lang-(en|fr)/])
		if (re.test(css)) bad.push(String(re));
	assert.deepEqual(bad, [], 'old selectors still in app.css');
});

test('layout, home page and language switcher use utilities: no <style> block, no style= attribute, theme tokens only', () => {
	for (const f of FILES) {
		const src = read(f);
		assert.ok(!/<style[\s>]/.test(src), `${f} has a <style> block`);
		assert.ok(!/\sstyle\s*=/.test(src) && !/style:[a-z-]+/.test(src), `${f} has a style attribute/directive`);
		assert.ok(!/class="(site-header|lang-switcher)"/.test(src), `${f} keeps an old class`);
		const classes = [...src.matchAll(/class(?::\w+)?\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]).join(' ');
		assert.ok(/\b(flex|grid|gap-\d|p[xy]?-\d|m[bt]?-\d|border-\S+|min-h-\S+)/.test(classes), `${f} has no utility classes`);
		for (const c of classes.split(/\s+/)) {
			assert.ok(!/\[#|\[(rgb|hsl|oklch)/i.test(c), `${f}: arbitrary colour ${c}`);
			assert.ok(!/(^|:)(bg|text|border|outline|ring|fill|stroke|divide|decoration|accent|caret|shadow)-(white|black|teal|red|blue|green|gray|grey|slate|zinc|stone|neutral|amber|yellow|orange|purple|pink|cyan|indigo|violet)\b/.test(c), `${f}: default palette colour ${c}`);
			assert.ok(!/-(white|black|teal|gray|red|blue|green)-\d{2,3}$/.test(c), `${f}: default palette ${c}`);
		}
	}
	const sw = read('src/lib/components/LanguageSwitcher.svelte') + read('src/routes/+layout.svelte') + read('src/routes/+page.svelte');
	for (const id of ['nav-home', 'nav-reference', 'srd-licence', 'language-switcher', 'lang-en', 'lang-fr', 'campaign-link'])
		assert.ok(sw.includes(`data-testid="${id}"`) || sw.includes(`data-testid='${id}'`), `data-testid ${id} kept`);
});

function walk(dir, out = []) {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|css)$/.test(f)) out.push(p);
	}
	return out;
}

test('us-38 colour scan: no colour literal or colour name in any .svelte or .css under src', () => {
	const names = '(?:black|white|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|silver|gold|teal|navy|maroon|olive|lime|aqua|cyan|magenta|fuchsia|tan|beige|ivory|khaki|crimson|coral|salmon|indigo|violet|wheat|linen|snow)';
	const bad = [];
	for (const f of walk(join(ROOT, 'src'))) {
		let src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		src = src.replace(/^\s*--(?:bg|surface|text|muted|accent|teal|danger)\s*:[^;]*;/gm, '');
		const re = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\\(|:[^;{}]*\\b${names}\\b`, 'g');
		for (const m of src.matchAll(re)) bad.push(`${f}: ${m[0]}`);
	}
	assert.deepEqual(bad, []);
});

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const ACCENT = 'rgb(212, 160, 80)', MUTED = 'rgb(185, 176, 143)', SURFACE = 'rgb(26, 42, 34)', TEAL = 'rgb(108, 195, 181)';

for (const [name, w, h] of [['phone', 375, 667], ['desktop', 1280, 800]]) {
	for (const lang of ['en', 'fr']) {
		test(`computed styles unchanged on the layout and home page at ${name} (${w}px, ${lang})`, async () => {
			for (const n of ['Alpha', 'Beta'])
				await fetch(BASE + '/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${n} ${name}${lang}` }) });
			const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: lang, extraHTTPHeaders: { 'accept-language': lang } });
			await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
			const page = await ctx.newPage();
			await page.goto(BASE + '/', { waitUntil: 'networkidle' });
			await page.locator('[data-testid=new-campaign]').click(); // US-193: the create form lives in the New campaign modal
			await page.waitForFunction(() => document.querySelector('[data-testid=modal-campaign]')?.open);
			const r = await page.evaluate(() => {
				const q = (s) => document.querySelector(s);
				const cs = (el) => getComputedStyle(el);
				const pick = (el, props) => Object.fromEntries(props.map((p) => [p, cs(el)[p]]));
				const rect = (el) => el.getBoundingClientRect();
				const header = q('header'), nav = q('header nav'), home = q('[data-testid=nav-home]'), ref = q('[data-testid=nav-reference]');
				const sw = q('[data-testid=language-switcher]'), btns = [...sw.querySelectorAll('button')];
				const link = q('[data-testid=campaign-link]'), li = link.closest('li'), form = q('form');
				const input = q('form input[type=text]'), submit = q('form button[type=submit]'), foot = q('[data-testid=srd-licence]');
				return {
					header: pick(header, ['display', 'flexWrap', 'alignItems', 'justifyContent', 'columnGap', 'rowGap', 'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor', 'marginBottom']),
					nav: pick(nav, ['display', 'flexWrap', 'alignItems', 'columnGap', 'rowGap']),
					home: pick(home, ['borderBottomWidth', 'borderBottomStyle', 'borderBottomColor', 'fontWeight', 'textDecorationLine', 'color']),
					ref: pick(ref, ['borderBottomWidth', 'borderBottomStyle', 'fontWeight', 'textDecorationLine']),
					homeH: rect(home).height, refH: rect(ref).height,
					sw: pick(sw, ['display', 'columnGap', 'rowGap', 'paddingTop', 'paddingLeft']),
					btns: btns.map((b) => ({ pressed: b.getAttribute('aria-pressed'), fw: cs(b).fontWeight, h: rect(b).height, w: rect(b).width, fs: cs(b).fontSize })),
					li: pick(li, ['backgroundColor', 'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor', 'borderTopLeftRadius', 'marginBottom']),
					link: pick(link, ['display', 'paddingLeft', 'paddingRight', 'paddingTop', 'color']), linkH: rect(link).height, linkW: rect(link).width, liW: rect(li).width,
					form: pick(form, ['marginBottom']),
					input: { h: rect(input).height, fs: cs(input).fontSize },
					submit: { h: rect(submit).height, w: rect(submit).width, fs: cs(submit).fontSize },
					foot: { fam: cs(foot).fontFamily },
					h1: cs(q('h1')).fontFamily,
					scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
				};
			});
			assert.equal(r.header.display, 'flex');
			assert.equal(r.header.flexWrap, w >= 768 ? 'nowrap' : 'wrap'); // US-191: md:flex-nowrap
			assert.equal(r.header.alignItems, 'center');
			assert.equal(r.header.justifyContent, 'space-between');
			assert.equal(r.header.columnGap, '8px');
			assert.equal(r.header.borderBottomWidth, '1px');
			assert.equal(r.header.borderBottomStyle, 'solid');
			assert.equal(r.header.borderBottomColor, MUTED);
			assert.equal(r.header.marginBottom, '16px');
			assert.equal(r.nav.display, 'flex');
			assert.equal(r.nav.flexWrap, 'wrap');
			assert.equal(r.nav.alignItems, 'center');
			assert.equal(r.nav.columnGap, '16px');
			assert.equal(r.nav.rowGap, '8px');
			assert.equal(r.home.borderBottomWidth, '2px');
			assert.equal(r.home.borderBottomStyle, 'solid');
			assert.equal(r.home.borderBottomColor, ACCENT);
			assert.equal(r.home.fontWeight, '700');
			assert.equal(r.home.textDecorationLine, 'none');
			assert.equal(r.home.color, ACCENT);
			assert.ok(r.ref.borderBottomStyle === 'none' || r.ref.borderBottomWidth === '0px', 'non-current link has no underline border');
			assert.notEqual(r.ref.fontWeight, '700');
			assert.equal(r.ref.textDecorationLine, 'none');
			assert.ok(r.homeH >= 43.5 && r.refH >= 43.5, 'nav links 44px');
			assert.equal(r.sw.display, 'flex');
			assert.equal(r.sw.columnGap, '8px');
			assert.equal(r.sw.paddingTop, '8px');
			assert.equal(r.sw.paddingLeft, '8px');
			assert.equal(r.btns.length, 2);
			for (const b of r.btns) {
				assert.ok(b.h >= 43.5 && b.w >= 43.5, 'switcher buttons 44px');
				assert.equal(b.fs, '16px');
				assert.equal(b.fw, b.pressed === 'true' ? '700' : '400');
			}
			assert.equal(r.btns.filter((b) => b.pressed === 'true').length, 1);
			assert.equal(r.li.backgroundColor, SURFACE);
			assert.equal(r.li.borderLeftWidth, '3px');
			assert.equal(r.li.borderLeftStyle, 'solid');
			assert.equal(r.li.borderLeftColor, ACCENT);
			assert.equal(r.li.borderTopLeftRadius, '8px');
			assert.equal(r.link.display, 'flex');
			assert.equal(r.link.paddingLeft, '12px');
			assert.equal(r.link.paddingRight, '12px');
			assert.equal(r.link.paddingTop, '0px');
			assert.equal(r.link.color, ACCENT);
			assert.ok(r.linkH >= 43.5, 'campaign link 44px');
			assert.ok(r.linkW >= r.liW - 4, `campaign link fills its row (${r.linkW} vs ${r.liW})`);
			assert.equal(r.form.marginBottom, '12px');
			assert.ok(r.input.h >= 43.5 && r.input.fs === '16px');
			assert.ok(r.submit.h >= 43.5 && r.submit.w >= 43.5 && r.submit.fs === '16px');
			assert.match(r.foot.fam, /EB Garamond/);
			assert.match(r.h1, /Cinzel/);
			assert.ok(r.scroll <= 0, `horizontal scroll by ${r.scroll}`);

			// US-193: close the modal and start tabbing from the top of the page, as before
			await page.keyboard.press('Escape');
			await page.waitForFunction(() => !document.querySelector('[data-testid=modal-campaign]')?.open);
			await page.evaluate(() => document.activeElement?.blur());
			// keyboard focus: every control on the page shows the teal outline
			const seen = [];
			for (let i = 0; i < 12; i++) {
				await page.keyboard.press('Tab');
				seen.push(await page.evaluate(() => {
					const e = document.activeElement, s = getComputedStyle(e);
					return { tag: e.tagName, w: parseFloat(s.outlineWidth), st: s.outlineStyle, c: s.outlineColor };
				}));
			}
			const controls = seen.filter((s) => s.tag !== 'BODY');
			assert.ok(controls.length >= 5, 'nav links, switcher, campaigns and form are focusable');
			for (const s of controls) {
				assert.ok(s.w >= 2 && s.st !== 'none', 'focus outline visible');
				assert.equal(s.c, TEAL);
			}
			await ctx.close();
		});
	}
}
