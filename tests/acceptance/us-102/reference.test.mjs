import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir, out = []) {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|css)$/.test(f)) out.push(p);
	}
	return out;
}

test('src/app.css is under 150 lines', () => {
	const lines = read('src/app.css').replace(/\n$/, '').split('\n').length;
	assert.ok(lines < 150, `app.css has ${lines} lines`);
});

test('app.css keeps only import, palette, @theme, @layer base, pips and the help marker', () => {
	const css = stripComments(read('src/app.css'));
	assert.match(css, /@import\s+["']tailwindcss/);
	assert.match(css, /@theme\s+static/);
	assert.match(css, /@layer\s+base/);
	assert.match(css, /--accent\s*:/);
	assert.match(css, /::-webkit-details-marker/);
	for (const c of ['help-body', 'help-text', 'help-line', 'ref-list', 'ref-item', 'party', 'tracker', 'stats', 'form-grid', 'chosen', 'cards'])
		assert.ok(!new RegExp(`\\.${c}\\b`).test(css), `app.css still has .${c}`);
	assert.ok(!/(^|[\s,}])ul\.list\b|\.list\s*>/.test(css), 'app.css still has the .list rules');
	assert.ok(!/\.help\s*(\{|\[open\])/.test(css), 'app.css still has .help layout rules');
	assert.ok(existsSync(join(ROOT, 'src/app.css.test.ts')), 'app.css.test.ts exists');
	assert.match(read('src/app.css.test.ts'), /150/, 'app.css.test.ts asserts the line budget');
});

test('no <style> block and no style= attribute in any .svelte file', () => {
	const bad = [];
	for (const f of walk(join(ROOT, 'src')).filter((f) => f.endsWith('.svelte'))) {
		const s = readFileSync(f, 'utf8');
		if (/<style[\s>]/.test(s) || /\sstyle\s*=/.test(s) || /\sstyle:[a-z-]+/.test(s)) bad.push(f);
	}
	assert.deepEqual(bad, []);
});

test('reference page and Help use utilities, no old classes, theme tokens only; testids and escaped word kept', () => {
	for (const f of ['src/routes/reference/+page.svelte', 'src/lib/components/Help.svelte']) {
		const src = read(f);
		const classes = [...src.matchAll(/class(?::[\w-]+)?\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]).join(' ');
		assert.ok(/\b(flex|gap-\d|p[xy]?-\d|min-h-\S+|min-w-\S+|list-none|border\S*)/.test(classes), `${f} has no utility classes`);
		for (const c of classes.split(/\s+/)) {
			assert.ok(!/^(ref-list|ref-item|ref-name|list|help|help-body|help-text|help-line)$/.test(c), `${f} keeps old class ${c}`);
			assert.ok(!/\[#|\[(rgb|hsl|oklch)/i.test(c), `${f}: arbitrary colour ${c}`);
			assert.ok(!/(^|:)(bg|text|border|outline|ring|fill|stroke|divide)-(white|black|teal|red|blue|green|gray|grey|slate|zinc|stone|neutral|amber|yellow|orange|purple|pink|cyan|indigo|violet)\b/.test(c), `${f}: default palette colour ${c}`);
		}
	}
	const page = read('src/routes/reference/+page.svelte');
	for (const id of ['ref-item', 'ref-{s.kind}']) assert.ok(page.includes(`data-testid="${id}"`), `testid ${id} kept`);
	const help = read('src/lib/components/Help.svelte');
	assert.ok(help.includes('data-testid="help"') && help.includes('data-help={id}'), 'Help testids kept');
	assert.ok(/\(\[Vv\]\)\(ulnerable\)/.test(help) && /&#\$\{/.test(help), 'Help keeps the escaped word');
});

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

test('ui-style skill no longer describes the old app.css page rules', () => {
	const p = '.claude/skills/ui-style/SKILL.md';
	if (!existsSync(join(ROOT, p))) return; // deleted is acceptable
	const s = read(p);
	for (const re of [/other pages still use `?src\/app\.css/i, /old page rules/i, /ul\.list/, /\.list\s*>/, /\.ref-(list|item)/, /\.help-(body|text|line)/, /\.(tracker|form-grid|party)\b/])
		assert.ok(!re.test(s), `ui-style still mentions ${re}`);
});

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const SURFACE = 'rgb(26, 42, 34)', ACCENT = 'rgb(212, 160, 80)';

for (const [name, w, h] of [['phone', 375, 667], ['desktop', 1280, 800]]) {
	test(`computed styles unchanged on the reference page and Help at ${name} (${w}px)`, async () => {
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		await page.goto(BASE + '/reference?kind=classes');
		const r = await page.evaluate(() => {
			const q = (s) => document.querySelector(s), cs = (e) => getComputedStyle(e), rc = (e) => e.getBoundingClientRect();
			const pick = (e, ps) => Object.fromEntries(ps.map((x) => [x, cs(e)[x]]));
			const f = q('form[action="/reference"]');
			const li = q('[data-testid=ref-item]'), ul = li.parentElement, help = li.querySelector('[data-testid=help]'), btn = help.querySelector('[data-testid=help-open]'), panel = help.querySelector('[data-testid=help-panel]');
			const o = {};
			o.form = pick(f, ['display', 'flexWrap', 'columnGap', 'rowGap', 'paddingTop', 'paddingLeft', 'backgroundColor']);
			o.heights = [rc(q('form[action="/reference"] select')).height, rc(q('form[action="/reference"] input[name=q]')).height, rc(q('form[action="/reference"] button')).height];
			o.ul = pick(ul, ['listStyleType', 'paddingLeft', 'marginBottom', 'marginTop']);
			o.li = pick(li, ['display', 'flexWrap', 'alignItems', 'columnGap', 'rowGap', 'overflowWrap', 'paddingTop', 'paddingLeft', 'backgroundColor', 'borderLeftWidth', 'borderLeftColor', 'borderTopLeftRadius', 'marginBottom']);
			o.help = cs(help).display;
			o.btn = pick(btn, ['display', 'alignItems', 'justifyContent', 'minWidth', 'minHeight', 'fontWeight']);
			o.btnText = btn.textContent.trim();
			o.btnR = [rc(btn).width, rc(btn).height];
			panel.showPopover();
			o.open = panel.matches(':popover-open');
			o.panel = pick(panel, ['position', 'backgroundColor']);
			const pr = rc(panel);
			o.panelW = pr.width;
			o.centre = pr.left + pr.width / 2 - document.documentElement.clientWidth / 2;
			o.scroll = document.documentElement.scrollWidth - document.documentElement.clientWidth;
			return o;
		});
		assert.deepEqual(r.form, { display: 'flex', flexWrap: 'wrap', columnGap: '8px', rowGap: '8px', paddingTop: '8px', paddingLeft: '8px', backgroundColor: SURFACE });
		for (const hh of r.heights) assert.ok(hh >= 43.5, `control height ${hh}`);
		assert.deepEqual(r.ul, { listStyleType: 'none', paddingLeft: '0px', marginBottom: '12px', marginTop: '0px' });
		assert.deepEqual(r.li, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '8px', overflowWrap: 'anywhere', paddingTop: '8px', paddingLeft: '12px', backgroundColor: SURFACE, borderLeftWidth: '3px', borderLeftColor: ACCENT, borderTopLeftRadius: '8px', marginBottom: '12px' });
		// us-246: Help is an inline-level span with a "?" button and a popover panel
		assert.ok(r.help.startsWith('inline'), `help display ${r.help} is inline-level`);
		assert.deepEqual(r.btn, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', fontWeight: '700' });
		assert.equal(r.btnText, '?');
		assert.ok(r.btnR[0] >= 44 && r.btnR[1] >= 44, `help-open ${r.btnR}`);
		assert.equal(r.open, true, 'help-panel opens');
		assert.deepEqual(r.panel, { position: 'fixed', backgroundColor: SURFACE });
		assert.ok(r.panelW <= 512 + 0.5, `panel width ${r.panelW}`);
		assert.ok(Math.abs(r.centre) <= 2, `panel off centre by ${r.centre}px`);
		assert.equal(r.scroll, 0);
		await ctx.close();
	});
}
