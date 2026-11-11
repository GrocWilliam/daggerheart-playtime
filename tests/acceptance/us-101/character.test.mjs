import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// us-178: forms update in place (use:enhance), so there is no navigation to wait for: wait for the POST response, then for the network to settle.
const afterSubmit = async (p, click) => {
	const res = p.waitForResponse((r) => r.request().method() === 'POST');
	await click;
	await res;
	await p.waitForLoadState('networkidle');
};

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const PAGE = 'src/routes/characters/[id]/+page.svelte';
const FILES = [PAGE, 'src/lib/components/Chosen.svelte'];

test('app.css no longer has the .tracker, .stats, .form-grid and .chosen rules', () => {
	const css = stripComments(read('src/app.css'));
	for (const c of ['tracker', 'stats', 'form-grid', 'chosen', 'cards'])
		assert.ok(!new RegExp(`\\.${c}\\b`).test(css), `app.css still has .${c}`);
	assert.ok(!/form:not\(\.tracker\)/.test(css), 'app.css still refers to .tracker');
});

test('character page and Chosen use utilities: no <style>, no style=, no old classes, theme tokens only, testids kept', () => {
	for (const f of FILES) {
		const src = read(f);
		assert.ok(!/<style[\s>]/.test(src), `${f} has a <style> block`);
		assert.ok(!/\sstyle\s*=/.test(src) && !/style:[a-z-]+/.test(src), `${f} has a style attribute/directive`);
		const classes = [...src.matchAll(/class(?::[\w-]+)?\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]).join(' ');
		assert.ok(/\b(flex|grid|gap-\d|p[xy]?-\d|m[bt]?-\d|border\S*|min-h-\S+|size-\S+|h-\S+|w-\S+|list-none)/.test(classes), `${f} has no utility classes`);
		for (const c of classes.split(/\s+/)) {
			assert.ok(!/^(tracker|form-grid|stats|cards|chosen|card-name)$/.test(c), `${f} keeps old class ${c}`);
			assert.ok(!/\[#|\[(rgb|hsl|oklch)/i.test(c), `${f}: arbitrary colour ${c}`);
			assert.ok(!/(^|:)(bg|text|border|outline|ring|fill|stroke|divide|decoration|accent|caret|shadow)-(white|black|teal|red|blue|green|gray|grey|slate|zinc|stone|neutral|amber|yellow|orange|purple|pink|cyan|indigo|violet)\b/.test(c), `${f}: default palette colour ${c}`);
			assert.ok(!/-(white|black|teal|gray|red|blue|green)-\d{2,3}$/.test(c), `${f}: default palette ${c}`);
		}
	}
	// us-301: tracker, defense line and condition markup moved to shared components.
	const src = read(PAGE) + ['Tracker', 'DefenseLine', 'ConditionBadges'].map((c) => read(`src/lib/components/${c}.svelte`)).join('');
	for (const id of ['character-name', 'down', 'evasion', 'thresholds', 'condition-vulnerable', 'condition-restrained', 'condition-hidden', 'notes', 'gold', 'inventory', 'item-row', 'item', 'card'])
		assert.ok(src.includes(`data-testid="${id}"`), `data-testid ${id} kept`);
	assert.ok(src.includes('data-testid={key}') || src.includes('data-testid={name}'), 'tracker testid kept');
	assert.ok(read('src/lib/components/Chosen.svelte').includes('data-testid={k}'), 'chosen testid kept');
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

const ACCENT = 'rgb(212, 160, 80)', MUTED = 'rgb(185, 176, 143)', SURFACE = 'rgb(26, 42, 34)', TEAL = 'rgb(108, 195, 181)', DANGER = 'rgb(238, 128, 112)', BG = 'rgb(15, 26, 21)', CLEAR = 'rgba(0, 0, 0, 0)';
const json = { 'content-type': 'application/json' };
const post = (path, body, method = 'POST') => fetch(BASE + path, { method, headers: json, body: JSON.stringify(body) });

async function setup(tag) {
	const camp = await (await post('/api/campaigns', { name: 'Camp ' + tag })).json();
	const ch = await (await post(`/api/campaigns/${camp.id}/characters`, { name: 'Aria', class: 'Wizard', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 })).json();
	await post(`/api/characters/${ch.id}`, { ancestry: 'core_ancestry_clank', community: 'core_community_highborne' }, 'PATCH');
	await post(`/api/characters/${ch.id}/conditions`, { vulnerable: true, restrained: true, hidden: true }, 'PUT');
	await post(`/api/characters/${ch.id}/items`, { name: 'Rope', quantity: 2 });
	await post(`/api/characters/${ch.id}/gold`, { handfuls: 3 });
	await post(`/api/characters/${ch.id}/hp`, { delta: 6 }).catch(() => {});
	// hold the first domain card the page offers
	const html = await (await fetch(BASE + `/characters/${ch.id}?tab=cards`)).text();
	const cardId = html.match(/<select name="cardId"[^>]*>[\s\S]*?<option value="([^"]+)"/)?.[1];
	if (cardId) await post(`/api/characters/${ch.id}/cards`, { cardId });
	return ch.id;
}

for (const [name, w, h] of [['phone', 375, 667], ['desktop', 1280, 800]]) {
	test(`computed styles unchanged on the character sheet at ${name} (${w}px)`, async () => {
		const id = await setup(name);
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		await page.goto(BASE + `/characters/${id}?new=edit`);
		// us-305: the sheet is split into tabs; bring the gear, cards and notes panels into this page so one snapshot covers them
		await page.evaluate(async () => {
			const grid = document.querySelector('[data-testid=sheet-sections]');
			for (const tab of ['gear', 'cards', 'notes']) {
				const doc = new DOMParser().parseFromString(await (await fetch(`${location.pathname}?tab=${tab}`)).text(), 'text/html');
				for (const el of [...doc.querySelector('[data-testid=sheet-sections]').children]) grid.append(document.importNode(el, true));
			}
		});
		const r = await page.evaluate(() => {
			const q = (s, r = document) => r.querySelector(s);
			const cs = (el) => getComputedStyle(el);
			const pick = (el, props) => Object.fromEntries(props.map((p) => [p, cs(el)[p]]));
			const rect = (el) => el.getBoundingClientRect();
			const trk = q('[data-testid=hp]').closest('form');
			const trkBtns = [...trk.querySelectorAll('button:not([data-testid^="help-"])')];
			const stats = q('[data-testid=evasion]').closest('ul');
			const edit = q('form[action="?/edit"]');
			const kids = [...edit.children];
			const damage = q('form[action="?/damage"]');
			const table = q('[data-testid=inventory]');
			const row = q('[data-testid=item-row]');
			const cards = q('[data-testid=card]').closest('ul');
			const chosenLi = q('[data-testid=ancestry]').closest('li');
			const chosen = chosenLi.closest('ul');
			const badge = (t) => pick(q(`[data-testid=${t}]`), ['display', 'backgroundColor', 'color', 'fontSize', 'paddingLeft', 'paddingTop']);
			const radius = (t) => parseFloat(cs(q(`[data-testid=${t}]`)).borderTopLeftRadius);
			return {
				trk: pick(trk, ['display', 'flexWrap', 'alignItems', 'columnGap', 'marginBottom', 'backgroundColor', 'paddingTop']),
				trkBtns: trkBtns.map((b) => ({ h: rect(b).height, w: rect(b).width, bg: cs(b).backgroundColor, fs: cs(b).fontSize })),
				val: pick(q('[data-testid=hp]'), ['textAlign', 'color']), valW: rect(q('[data-testid=hp]')).width,
				hope: cs(q('[data-testid=hope]')).color, stress: cs(q('[data-testid=stress]')).color,
				stats: pick(stats, ['listStyleType', 'paddingLeft', 'marginBottom', 'marginTop']),
				badges: { vulnerable: badge('condition-vulnerable'), restrained: badge('condition-restrained'), hidden: badge('condition-hidden'), down: badge('down') },
				radii: ['condition-vulnerable', 'condition-restrained', 'condition-hidden', 'down'].map(radius),
				name: pick(q('[data-testid=character-name]'), ['color', 'fontFamily', 'fontWeight']),
				damage: pick(damage, ['backgroundColor', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'marginBottom']),
				edit: pick(edit, ['display', 'columnGap', 'backgroundColor', 'borderTopLeftRadius', 'paddingTop', 'marginBottom']),
				editCols: cs(edit).gridTemplateColumns.split(' ').length,
				editXs: [...new Set(kids.map((k) => Math.round(rect(k).left)))].length,
				editBtn: { justify: cs(kids.at(-1)).justifySelf, left: rect(kids.at(-1)).left, formLeft: rect(edit).left, h: rect(kids.at(-1)).height, bg: cs(kids.at(-1)).backgroundColor, color: cs(kids.at(-1)).color },
				label: pick(q('label', edit), ['color', 'display', 'marginBottom']),
				input: pick(q('input[name=name]', edit), ['backgroundColor', 'color', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius', 'fontSize', 'width', 'paddingTop']),
				inputH: rect(q('input[name=name]', edit)).height, inputW: rect(q('input[name=name]', edit)).width, labelW: rect(q('label', edit)).width,
				select: { h: rect(q('select[name=class]', edit)).height, fs: cs(q('select[name=class]', edit)).fontSize },
				check: { w: rect(q('input[name=useArmor]')).width, h: rect(q('input[name=useArmor]')).height, label: pick(q('input[name=useArmor]').closest('label'), ['display', 'alignItems', 'columnGap']), lh: rect(q('input[name=useArmor]').closest('label')).height },
				notes: { w: rect(q('[data-testid=notes]')).width, formW: rect(q('[data-testid=notes]').closest('form')).width, h: rect(q('[data-testid=notes]')).height },
				gold: pick(q('[data-testid=gold]'), ['color', 'marginTop']),
				table: pick(table, ['display', 'borderCollapse']), tableW: rect(table).width, wrapW: rect(table.parentElement).width,
				th: pick(q('th', table), ['color', 'borderBottomWidth', 'borderBottomColor', 'textAlign']),
				row: pick(row, ['display', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'borderTopStyle', 'borderBottomWidth', 'borderTopLeftRadius', 'marginBottom']),
				td: pick(q('td', row), ['display', 'paddingTop', 'textAlign', 'verticalAlign', 'overflowWrap']),
				tdForm: pick(q('td form[action="?/removeItem"]', row), ['display', 'flexWrap', 'alignItems', 'columnGap', 'backgroundColor', 'paddingTop', 'marginBottom']),
				cards: pick(cards, ['listStyleType', 'paddingLeft']),
				cardLi: pick(q('[data-testid=card]'), ['overflowWrap']),
				cardMuted: cs(q('[data-testid=card] span:nth-of-type(2)')).color,
				chosen: pick(chosen, ['listStyleType', 'paddingLeft', 'marginBottom', 'marginTop']),
				chosenLi: pick(chosenLi, ['overflowWrap']),
				chosenMuted: cs(chosenLi.querySelector('span')).color,
				small: [...document.querySelectorAll('a, button, input:not([type=hidden]):not([type=checkbox]), select')].filter((e) => e.offsetParent !== null && rect(e).height < 43.5).length,
				scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
			};
		});
		assert.equal(r.trk.display, 'flex');
		assert.equal(r.trk.flexWrap, 'wrap'); // us-301: Tracker is flex-wrap (only the pips wrap)
		assert.equal(r.trk.alignItems, 'center');
		assert.equal(r.trk.columnGap, '8px');
		assert.equal(r.trk.marginBottom, '12px');
		assert.equal(r.trk.backgroundColor, CLEAR);
		assert.equal(r.trk.paddingTop, '0px');
		for (const b of r.trkBtns) {
			assert.ok(b.h >= 43.5 && b.w >= 43.5, 'tracker buttons 44px');
			assert.equal(b.bg, ACCENT);
			assert.equal(b.fs, '16px');
		}
		assert.equal(r.val.textAlign, 'center');
		assert.equal(r.val.color, DANGER);
		assert.ok(r.valW >= 15, 'value min-width 2ch');
		assert.equal(r.hope, TEAL);
		assert.notEqual(r.stress, DANGER);
		assert.notEqual(r.stress, TEAL);
		assert.equal(r.stats.listStyleType, 'none');
		assert.equal(r.stats.paddingLeft, '0px');
		assert.equal(r.stats.marginBottom, '12px');
		assert.equal(r.stats.marginTop, '0px');
		for (const [k, bg] of [['vulnerable', DANGER], ['restrained', ACCENT], ['hidden', TEAL], ['down', DANGER]]) {
			const b = r.badges[k];
			assert.equal(b.display, 'inline-block', `${k} display`);
			assert.equal(b.backgroundColor, bg, `${k} background`);
			assert.equal(b.color, BG, `${k} text colour`);
			assert.equal(b.fontSize, '14px');
			assert.equal(b.paddingTop, '0px');
			assert.equal(b.paddingLeft, '9.6px');
		}
		for (const x of r.radii) assert.ok(x >= 100, 'pill badges');
		assert.equal(r.name.color, ACCENT);
		assert.match(r.name.fontFamily, /Cinzel/);
		assert.equal(r.name.fontWeight, '700');
		for (const f of [r.damage, r.edit]) {
			assert.equal(f.backgroundColor, CLEAR);
			assert.equal(f.borderTopLeftRadius, '0px');
			assert.equal(f.paddingTop, '0px');
			assert.equal(f.marginBottom, '12px');
		}
		assert.equal(r.damage.paddingLeft, '0px');
		assert.equal(r.edit.display, 'grid');
		assert.equal(r.edit.columnGap, '16px');
		assert.equal(r.editCols, w >= 768 ? 2 : 1, 'edit form columns');
		assert.equal(r.editXs, w >= 768 ? 2 : 1, 'edit form fields laid out in columns');
		assert.equal(r.editBtn.justify, 'start');
		assert.equal(r.editBtn.left, r.editBtn.formLeft, 'save sits at the start of the first column');
		assert.ok(r.editBtn.h >= 43.5);
		assert.equal(r.editBtn.bg, ACCENT);
		assert.equal(r.editBtn.color, BG);
		assert.equal(r.label.color, MUTED);
		assert.equal(r.label.display, 'block');
		assert.equal(r.label.marginBottom, '8px');
		assert.equal(r.input.backgroundColor, BG);
		assert.equal(r.input.borderTopWidth, '1px');
		assert.equal(r.input.borderTopStyle, 'solid');
		assert.equal(r.input.borderTopColor, ACCENT);
		assert.equal(r.input.borderTopLeftRadius, '4px');
		assert.equal(r.input.fontSize, '16px');
		assert.equal(r.input.paddingTop, '8px');
		assert.ok(r.inputH >= 43.5);
		if (w < 768) assert.ok(Math.abs(r.inputW - r.labelW) < 1, 'inputs fill the label on phones');
		else assert.ok(r.inputW <= 384.5 && r.inputW >= 191, 'inputs 12rem..24rem wide on desktop');
		assert.ok(r.select.h >= 43.5);
		assert.equal(r.select.fs, '16px');
		assert.ok(r.check.w >= 24, 'checkbox width');
		assert.ok(r.check.h >= 24, 'checkbox height');
		assert.equal(r.check.label.display, 'flex');
		assert.equal(r.check.label.alignItems, 'center');
		assert.equal(r.check.label.columnGap, '8px');
		assert.ok(r.check.lh >= 43.5);
		assert.ok(Math.abs(r.notes.w - r.notes.formW) < 1, 'notes fill their form');
		assert.equal(r.table.display, w >= 600 ? 'table' : 'block');
		assert.equal(r.table.borderCollapse, 'collapse');
		assert.ok(r.tableW >= 0.9 * (r.wrapW - 48), `table full width (${r.tableW} in ${r.wrapW})`);
		assert.equal(r.th.color, MUTED);
		assert.equal(r.th.borderBottomWidth, '1px');
		assert.equal(r.th.borderBottomColor, ACCENT);
		assert.equal(r.th.textAlign, 'left');
		assert.equal(r.row.display, w >= 600 ? 'table-row' : 'block');
		if (w >= 600) {
			assert.equal(r.row.backgroundColor, CLEAR);
			assert.equal(r.row.borderTopWidth, '0px');
			assert.equal(r.row.borderBottomWidth, '1px');
			assert.equal(r.row.marginBottom, '0px');
		} else {
			assert.equal(r.row.backgroundColor, SURFACE);
			assert.equal(r.row.borderTopWidth, '1px');
			assert.equal(r.row.borderTopStyle, 'solid');
			assert.equal(r.row.borderTopColor, MUTED);
			assert.equal(r.row.borderTopLeftRadius, '8px');
			assert.equal(r.row.marginBottom, '12px');
		}
		assert.equal(r.td.display, w >= 600 ? 'table-cell' : 'block');
		assert.equal(r.td.paddingTop, '8px');
		assert.equal(r.td.textAlign, 'left');
		assert.equal(r.td.verticalAlign, 'top');
		assert.equal(r.td.overflowWrap, 'anywhere');
		assert.equal(r.tdForm.display, 'flex');
		assert.equal(r.tdForm.flexWrap, 'nowrap');
		assert.equal(r.tdForm.alignItems, 'center');
		assert.equal(r.tdForm.columnGap, '8px');
		assert.equal(r.tdForm.backgroundColor, CLEAR);
		assert.equal(r.tdForm.paddingTop, '0px');
		assert.equal(r.tdForm.marginBottom, '12px');
		assert.equal(r.cards.listStyleType, 'none');
		assert.equal(r.cards.paddingLeft, '0px');
		assert.equal(r.cardLi.overflowWrap, 'anywhere');
		assert.equal(r.cardMuted, MUTED);
		assert.equal(r.chosen.listStyleType, 'none');
		assert.equal(r.chosen.paddingLeft, '0px');
		assert.equal(r.chosen.marginBottom, '12px');
		assert.equal(r.chosen.marginTop, '0px');
		assert.equal(r.chosenLi.overflowWrap, 'anywhere');
		assert.equal(r.chosenMuted, MUTED);
		assert.equal(r.small, 0, 'all targets 44px');
		assert.ok(r.scroll <= 0, `horizontal scroll by ${r.scroll}`);
		await ctx.close();
	});
}

test('focus outline stays teal, 2px, offset 2px on the character sheet', async () => {
	const id = await setup('focus');
	const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
	const page = await ctx.newPage();
	for (const sel of ['[data-testid=hp]', 'form[action="?/edit"] button:not([data-testid^="help-"])', 'form[action="?/edit"] input[name=name]']) {
		await page.goto(BASE + `/characters/${id}${sel === '[data-testid=hp]' ? '' : '?new=edit'}`);
		const el = sel === '[data-testid=hp]' ? page.locator(sel).locator('xpath=..').locator('button:not([data-testid^="help-"])').first() : page.locator(sel).first();
		await el.focus();
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('Tab');
		const o = await el.evaluate((e) => { const s = getComputedStyle(e); return [s.outlineColor, s.outlineWidth, s.outlineStyle, s.outlineOffset]; });
		assert.deepEqual(o, [TEAL, '2px', 'solid', '2px'], sel);
	}
	await ctx.close();
});

test('the sheet still works: tracker, condition and card forms submit and stay visible', async () => {
	const id = await setup('works');
	const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
	const page = await ctx.newPage();
	await page.goto(BASE + `/characters/${id}`);
	await afterSubmit(page, page.locator('[data-testid=hope]').locator('xpath=..').locator('button[value="-1"]').click());
	assert.ok(await page.locator('[data-testid=condition-hidden]').isVisible());
	await page.goto(BASE + `/characters/${id}?tab=gear`);
	assert.ok(await page.locator('[data-testid=item]').isVisible());
	await page.goto(BASE + `/characters/${id}?tab=cards`);
	assert.ok(await page.locator('[data-testid=card]').isVisible());
	await ctx.close();
});
