import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const PAGE = 'src/routes/campaigns/[id]/+page.svelte';
const FILES = [PAGE, 'src/lib/components/Pips.svelte'];

test('app.css no longer has the .party rules', () => {
	assert.ok(!/\.party\b/.test(stripComments(read('src/app.css'))));
});

test('campaign page and Pips use utilities: no <style>, no style=, no old classes, theme tokens only, testids kept', () => {
	for (const f of FILES) {
		const src = read(f);
		assert.ok(!/<style[\s>]/.test(src), `${f} has a <style> block`);
		assert.ok(!/\sstyle\s*=/.test(src) && !/style:[a-z-]+/.test(src), `${f} has a style attribute/directive`);
		const classes = [...src.matchAll(/class(?::[\w-]+)?\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]).join(' ');
		assert.ok(/\b(flex|grid|gap-\d|p[xy]?-\d|m[bt]?-\d|border\S*|min-h-\S+|size-\S+|h-\S+|w-\S+)/.test(classes), `${f} has no utility classes`);
		for (const c of classes.split(/\s+/)) {
			assert.ok(!/^(party|tracker|form-grid|stats)$/.test(c), `${f} keeps old class ${c}`);
			assert.ok(!/\[#|\[(rgb|hsl|oklch)/i.test(c), `${f}: arbitrary colour ${c}`);
			assert.ok(!/(^|:)(bg|text|border|outline|ring|fill|stroke|divide|decoration|accent|caret|shadow)-(white|black|teal|red|blue|green|gray|grey|slate|zinc|stone|neutral|amber|yellow|orange|purple|pink|cyan|indigo|violet)\b/.test(c), `${f}: default palette colour ${c}`);
			assert.ok(!/-(white|black|teal|gray|red|blue|green)-\d{2,3}$/.test(c), `${f}: default palette ${c}`);
		}
	}
	const src = read(PAGE);
	for (const id of ['campaign-name', 'fear', 'character-card', 'character-name', 'down', 'hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds', 'condition-vulnerable', 'condition-restrained', 'condition-hidden'])
		assert.ok(src.includes(`data-testid="${id}"`) || src.includes(`data-testid={${id}}`) || (['hp', 'stress', 'hope', 'armor'].includes(id) && src.includes('data-testid={key}')), `data-testid ${id} kept`);
	assert.ok(read('src/lib/components/Pips.svelte').includes('data-testid="{name}-pips"'));
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

const ACCENT = 'rgb(212, 160, 80)', MUTED = 'rgb(185, 176, 143)', SURFACE = 'rgb(26, 42, 34)', TEAL = 'rgb(108, 195, 181)', DANGER = 'rgb(238, 128, 112)', BG = 'rgb(15, 26, 21)';
const json = { 'content-type': 'application/json' };

async function setup(tag) {
	const camp = await (await fetch(BASE + '/api/campaigns', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Camp ' + tag }) })).json();
	await fetch(BASE + `/api/campaigns/${camp.id}/fear`, { method: 'POST', headers: json, body: JSON.stringify({ delta: 1 }) }).catch(() => {});
	const body = { name: 'Aria', class: 'Wizard', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };
	for (const n of ['Aria', 'Bram', 'Cyra', 'Dax'])
		await fetch(BASE + `/api/campaigns/${camp.id}/characters`, { method: 'POST', headers: json, body: JSON.stringify({ ...body, name: n }) });
	return camp.id;
}

for (const [name, w, h, cols] of [['phone', 375, 667, 1], ['tablet', 700, 800, 1], ['desktop', 1280, 800, 1]]) {
	test(`computed styles unchanged on the campaign page at ${name} (${w}px)`, async () => {
		const id = await setup(name);
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		await page.goto(BASE + `/campaigns/${id}`);
		const r = await page.evaluate(() => {
			const q = (s, r = document) => r.querySelector(s);
			const cs = (el) => getComputedStyle(el);
			const pick = (el, props) => Object.fromEntries(props.map((p) => [p, cs(el)[p]]));
			const rect = (el) => el.getBoundingClientRect();
			const cards = [...document.querySelectorAll('[data-testid=character-card]')];
			const card = cards[0], party = card.parentElement;
			const trk = q('[data-testid=hp]', card).closest('form');
			const trkBtns = [...trk.querySelectorAll('button')];
			const fearForm = q('[data-testid=fear]').closest('form');
			const pipInfo = (tid) => {
				const box = q(`[data-testid=${tid}-pips]`);
				const pips = [...box.children];
				const filled = pips.find((p) => cs(p).backgroundColor !== 'rgba(0, 0, 0, 0)');
				const empty = pips.find((p) => cs(p).backgroundColor === 'rgba(0, 0, 0, 0)');
				return {
					box: pick(box, ['display', 'flexWrap', 'columnGap', 'rowGap', 'marginBottom']), n: pips.length,
					pip: pick(pips[0], ['width', 'height', 'borderTopLeftRadius', 'borderTopWidth', 'borderTopStyle', 'borderTopColor']),
					rect: [rect(pips[0]).width, rect(pips[0]).height],
					fill: filled ? cs(filled).backgroundColor : null, empty: !!empty, aria: box.getAttribute('aria-hidden')
				};
			};
			return {
				n: cards.length,
				party: pick(party, ['display', 'columnGap', 'rowGap']), cols: cs(party).gridTemplateColumns.split(' ').length,
				card: pick(card, ['backgroundColor', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'marginBottom']),
				name: pick(q('[data-testid=character-name]', card), ['color']),
				trk: pick(trk, ['display', 'flexWrap', 'alignItems', 'columnGap', 'marginBottom', 'backgroundColor', 'paddingTop']),
				trkBtns: trkBtns.map((b) => ({ h: rect(b).height, w: rect(b).width, bg: cs(b).backgroundColor, fs: cs(b).fontSize })),
				val: pick(q('[data-testid=hp]', card), ['textAlign', 'color']), valW: rect(q('[data-testid=hp]', card)).width,
				hope: cs(q('[data-testid=hope]', card)).color,
				stats: pick(q('[data-testid=evasion]', card).closest('ul'), ['listStyleType', 'paddingLeft', 'marginBottom']),
				fear: pick(fearForm, ['backgroundColor', 'borderTopLeftRadius', 'paddingTop', 'marginBottom']),
				pips: { fear: pipInfo('fear'), hp: pipInfo('hp'), stress: pipInfo('stress'), hope: pipInfo('hope'), armor: pipInfo('armor') },
				small: [...document.querySelectorAll('a, button, input:not([type=hidden]):not([type=checkbox]), select')].filter((e) => e.offsetParent !== null && rect(e).height < 43.5).length,
				scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
			};
		});
		assert.equal(r.n, 4);
		assert.equal(r.party.display, 'grid');
		assert.equal(r.party.columnGap, '16px');
		assert.equal(r.party.rowGap, '16px');
		assert.equal(r.cols, cols, 'party columns');
		assert.equal(r.card.backgroundColor, SURFACE);
		assert.equal(r.card.borderTopWidth, '3px');
		assert.equal(r.card.borderTopStyle, 'double');
		assert.equal(r.card.borderTopColor, ACCENT);
		assert.equal(r.card.borderTopLeftRadius, '8px');
		assert.equal(r.card.paddingTop, '12px');
		assert.equal(r.card.paddingLeft, '12px');
		assert.equal(r.card.marginBottom, '0px');
		assert.equal(r.name.color, ACCENT);
		assert.equal(r.trk.display, 'flex');
		assert.equal(r.trk.flexWrap, 'nowrap');
		assert.equal(r.trk.alignItems, 'center');
		assert.equal(r.trk.columnGap, '8px');
		assert.equal(r.trk.backgroundColor, 'rgba(0, 0, 0, 0)');
		assert.equal(r.trk.paddingTop, '0px');
		assert.equal(r.trk.marginBottom, '12px');
		for (const b of r.trkBtns) {
			assert.ok(b.h >= 43.5 && b.w >= 43.5, 'tracker buttons 44px');
			assert.equal(b.bg, ACCENT);
			assert.equal(b.fs, '16px');
		}
		assert.equal(r.val.textAlign, 'center');
		assert.equal(r.val.color, DANGER);
		assert.ok(r.valW >= 2 * 8 - 1, 'value min-width 2ch');
		assert.equal(r.hope, TEAL);
		assert.equal(r.stats.listStyleType, 'none');
		assert.equal(r.stats.paddingLeft, '0px');
		assert.equal(r.stats.marginBottom, '12px');
		assert.equal(r.fear.backgroundColor, SURFACE);
		assert.equal(r.fear.borderTopLeftRadius, '8px');
		assert.equal(r.fear.paddingTop, '12px');
		assert.equal(r.fear.marginBottom, '12px');
		const want = { fear: [12, DANGER], hp: [6, DANGER], stress: [6, ACCENT], hope: [6, TEAL], armor: [3, MUTED] };
		for (const [k, [n, col]] of Object.entries(want)) {
			const p = r.pips[k];
			assert.equal(p.n, n, `${k} pip count`);
			assert.equal(p.aria, 'true');
			assert.equal(p.box.display, 'flex');
			assert.equal(p.box.flexWrap, 'wrap');
			assert.equal(p.box.columnGap, '4px');
			assert.equal(p.box.rowGap, '4px');
			assert.equal(p.box.marginBottom, '12px');
			assert.deepEqual(p.rect, [12, 12], `${k} pip size`);
			assert.equal(p.pip.borderTopWidth, '1px');
			assert.equal(p.pip.borderTopStyle, 'solid');
			assert.equal(p.pip.borderTopColor, col, `${k} pip colour`);
			assert.match(p.pip.borderTopLeftRadius, /^(50%|6px)$/, `${k} pip round`);
			if (k === 'fear') { assert.equal(p.fill, col, 'fear pips filled'); }
			if (k === 'armor') { assert.equal(p.fill, null, 'armor 0 marked: all empty'); }
		}
		assert.equal(r.small, 0, 'all targets 44px');
		assert.ok(r.scroll <= 0, `horizontal scroll by ${r.scroll}`);
		await ctx.close();
	});
}

test('filled pips follow the tracker value (fear 1 marked, others by values)', async () => {
	const id = await setup('fill');
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.goto(BASE + `/campaigns/${id}`);
	const r = await page.evaluate(() => {
		const card = document.querySelector('[data-testid=character-card]');
		const filled = (tid, root = document) => [...root.querySelector(`[data-testid=${tid}-pips]`).children]
			.filter((p) => getComputedStyle(p).backgroundColor !== 'rgba(0, 0, 0, 0)').length;
		const val = (tid) => card.querySelector(`[data-testid=${tid}]`).textContent.trim();
		return { fear: [document.querySelector('[data-testid=fear]').textContent.trim(), filled('fear')], hp: [val('hp'), filled('hp', card)], hope: [val('hope'), filled('hope', card)] };
	});
	assert.equal(Number(r.fear[0]), r.fear[1]);
	assert.equal(Number(r.hope[0]), r.hope[1]);
	assert.equal(Number(r.hp[0].split('/')[0]), r.hp[1]);
	await ctx.close();
});
