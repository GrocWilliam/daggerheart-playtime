import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const SHEET_PAGE = 'src/routes/characters/[id]/+page.svelte';
const RUN_PAGE = 'src/routes/campaigns/[id]/+page.svelte';
const COMPONENTS = ['Tracker', 'DefenseLine', 'ConditionBadges', 'DamageForm'];
const TRACKERS = ['hp', 'stress', 'hope', 'armor'];
const LABELS = {
	en: JSON.parse(read('src/lib/i18n/en.json')),
	fr: JSON.parse(read('src/lib/i18n/fr.json'))
};
const ROW_TOL = 6;

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${await r.clone().text()}`);
	return r.status === 204 ? null : r.json();
};

const newCharacter = (camp, name) => api('POST', `/api/campaigns/${camp}/characters`, {
	name, class: 'Guardian', level: 1, evasion: 9, majorThreshold: 7, severeThreshold: 14, maxHp: 6, maxStress: 6, armorSlots: 3
});

let S;
async function setup() {
	if (S) return S;
	const camp = (await api('POST', '/api/campaigns', { name: 'Shared Components Camp' })).id;
	const a = (await newCharacter(camp, 'Aster')).id;
	const b = (await newCharacter(camp, 'Briar')).id;
	await api('PUT', `/api/characters/${a}/conditions`, { vulnerable: true, restrained: true, hidden: true });
	await api('POST', `/api/characters/${a}/hope`, { delta: 2 });
	return (S = { camp, a, b });
}

async function open(path, { w = 1024, h = 768, lang = 'en', js = true } = {}) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(15000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	if (js) await p.waitForLoadState('networkidle');
	return { ctx, p };
}

// For each tracker inside each scope (the page, or each character card): vertical centres and
// horizontal edges of the label text, the − and + buttons, the value and the pips.
const measureTrackers = (p, scopeSel, labels) => p.evaluate(({ scopeSel, labels, names }) => {
	const scopes = scopeSel ? [...document.querySelectorAll(scopeSel)] : [document];
	const box = (r) => ({ cy: (r.top + r.bottom) / 2, left: r.left, right: r.right, h: r.height });
	return scopes.map((scope) => names.map((name) => {
		const value = scope.querySelector(`[data-testid="${name}"]`);
		if (!value) return { name, error: 'no value' };
		const form = value.closest('form');
		if (!form) return { name, error: 'value not in a form' };
		const minus = form.querySelector('button[name="delta"][value="-1"]');
		const plus = form.querySelector('button[name="delta"][value="1"]');
		const pips = scope.querySelector(`[data-testid="${name}-pips"]`);
		let label = null;
		const walker = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const el = n.parentElement;
			if (el.closest('button, [data-testid^="help-"], [popover]')) continue;
			if (n.textContent.trim().replace(/\s*:$/, '') !== labels[name]) continue;
			const rg = document.createRange();
			rg.selectNodeContents(n);
			const r = rg.getBoundingClientRect();
			if (r.height > 0) { label = box(r); break; }
		}
		return {
			name,
			label, minus: minus && box(minus.getBoundingClientRect()), plus: plus && box(plus.getBoundingClientRect()),
			value: box(value.getBoundingClientRect()), pips: pips && box(pips.getBoundingClientRect())
		};
	}));
}, { scopeSel, labels, names: TRACKERS });

function checkRows(scopes, { withPips }, where) {
	assert.ok(scopes.length > 0, `${where}: no tracker scope`);
	for (const [i, rows] of scopes.entries()) {
		for (const r of rows) {
			const id = `${where} #${i} ${r.name}`;
			assert.equal(r.error, undefined, `${id}: ${r.error}`);
			assert.ok(r.label, `${id}: label text found in the tracker form`);
			assert.ok(r.minus && r.plus, `${id}: − and + buttons`);
			const parts = { label: r.label, minus: r.minus, value: r.value, plus: r.plus };
			if (withPips) {
				assert.ok(r.pips && r.pips.h > 0, `${id}: pips visible`);
				parts.pips = r.pips;
			}
			const cys = Object.values(parts).map((b) => b.cy);
			const spread = Math.max(...cys) - Math.min(...cys);
			assert.ok(spread <= ROW_TOL, `${id}: vertical centres differ by ${spread.toFixed(1)}px ${JSON.stringify(Object.fromEntries(Object.entries(parts).map(([k, b]) => [k, Math.round(b.cy)])))}`);
			assert.ok(r.value.left >= r.minus.right - 1 && r.value.right <= r.plus.left + 1,
				`${id}: value [${r.value.left}, ${r.value.right}] not between − (right ${r.minus.right}) and + (left ${r.plus.left})`);
		}
	}
}

const markedHp = async (loc) => Number((await loc.textContent()).trim().split('/')[0]);

test('the four components exist and both pages import Tracker, DefenseLine and DamageForm', () => {
	for (const c of COMPONENTS)
		assert.ok(existsSync(join(ROOT, `src/lib/components/${c}.svelte`)), `src/lib/components/${c}.svelte exists`);
	for (const page of [SHEET_PAGE, RUN_PAGE]) {
		const src = read(page);
		for (const c of ['Tracker', 'DefenseLine', 'DamageForm'])
			assert.match(src, new RegExp(`import\\s+${c}\\s+from\\s+['"][^'"]*components/${c}\\.svelte['"]`), `${page} imports ${c}`);
	}
});

test('the pages no longer contain their own tracker, defense line and damage form markup', () => {
	for (const page of [SHEET_PAGE, RUN_PAGE]) {
		const src = read(page);
		assert.ok(!/class:tracker\b/.test(src), `${page} still has tracker form markup`);
		assert.ok(!/data-testid="(evasion|thresholds)"/.test(src), `${page} still has the Evasion/thresholds markup`);
		assert.ok(!/name="useArmor"/.test(src), `${page} still has the damage form markup`);
	}
});

test('components import only $lib/i18n, $lib/forms/busy, Help and Pips, never routes', () => {
	const allowed = /^(\$lib\/i18n(\/index(\.ts)?)?|\$lib\/forms\/busy(\.ts)?|\$app\/forms|\.\/(Help|Pips)\.svelte|\$lib\/components\/(Help|Pips)\.svelte)$/;
	for (const c of COMPONENTS) {
		const f = `src/lib/components/${c}.svelte`;
		if (!existsSync(join(ROOT, f))) assert.fail(`${f} missing`);
		const src = read(f);
		for (const m of src.matchAll(/(?:import\s[^'"]*?from\s*|import\s*)['"]([^'"]+)['"]/g)) {
			assert.ok(!/routes/.test(m[1]), `${f} imports a route: ${m[1]}`);
			assert.ok(allowed.test(m[1]), `${f} imports ${m[1]}`);
		}
	}
});

test('sheet at 1024x768: label, −, value, + and pips of each tracker on one row, value between − and +', async () => {
	const { a } = await setup();
	for (const lang of ['en', 'fr']) {
		const labels = Object.fromEntries(TRACKERS.map((k) => [k, LABELS[lang][`tracker.${k}`]]));
		const { ctx, p } = await open(`/characters/${a}`, { lang });
		checkRows(await measureTrackers(p, null, labels), { withPips: true }, `sheet ${lang} 1024`);
		await ctx.close();
	}
});

test('sheet at 375x812: label, −, value and + of each tracker on one row', async () => {
	const { a } = await setup();
	for (const lang of ['en', 'fr']) {
		const labels = Object.fromEntries(TRACKERS.map((k) => [k, LABELS[lang][`tracker.${k}`]]));
		const { ctx, p } = await open(`/characters/${a}`, { w: 375, h: 812, lang });
		checkRows(await measureTrackers(p, null, labels), { withPips: false }, `sheet ${lang} 375`);
		await ctx.close();
	}
});

test('Run cards at 1024x768: each tracker on one row with its pips; at 375x812 label, −, value and + on one row', async () => {
	const { camp } = await setup();
	for (const lang of ['en', 'fr']) {
		const labels = Object.fromEntries(TRACKERS.map((k) => [k, LABELS[lang][`tracker.${k}`]]));
		for (const [w, h, withPips] of [[1024, 768, true], [375, 812, false]]) {
			const { ctx, p } = await open(`/campaigns/${camp}?step=run`, { w, h, lang });
			const scopes = await measureTrackers(p, '[data-testid="character-card"]', labels);
			assert.equal(scopes.length, 2, 'two character cards');
			checkRows(scopes, { withPips }, `run ${lang} ${w}`);
			await ctx.close();
		}
	}
});

test('Evasion and thresholds on one ul.stats line with a · on the sheet and on each Run card', async () => {
	const { camp, a } = await setup();
	for (const [path, scopeSel] of [[`/characters/${a}`, null], [`/campaigns/${camp}?step=run`, '[data-testid="character-card"]']]) {
		for (const [w, h] of [[1024, 768], [375, 812]]) {
			const { ctx, p } = await open(path, { w, h });
			const lines = await p.evaluate((scopeSel) => {
				const scopes = scopeSel ? [...document.querySelectorAll(scopeSel)] : [document];
				return scopes.map((s) => {
					const ev = s.querySelector('[data-testid="evasion"]');
					const th = s.querySelector('[data-testid="thresholds"]');
					if (!ev || !th) return { missing: true };
					const ul = ev.closest('ul');
					return {
						evTop: ev.getBoundingClientRect().top, thTop: th.getBoundingClientRect().top,
						ev: ev.textContent.trim(), th: th.textContent.trim(),
						isUl: !!ul, stats: !!ul && ul.classList.contains('stats'), same: !!ul && ul.contains(th),
						text: ul ? ul.textContent : ''
					};
				});
			}, scopeSel);
			assert.ok(lines.length > 0, path);
			for (const [i, l] of lines.entries()) {
				const id = `${path} ${w} #${i}`;
				assert.ok(!l.missing, `${id}: evasion and thresholds present`);
				assert.equal(l.ev, '9', `${id}: evasion value`);
				assert.equal(l.th, '7/14', `${id}: thresholds value`);
				assert.ok(Math.abs(l.evTop - l.thTop) <= 4, `${id}: tops ${l.evTop} vs ${l.thTop}`);
				assert.ok(l.isUl && l.stats, `${id}: the line is a ul.stats`);
				assert.ok(l.same, `${id}: evasion and thresholds in the same ul`);
				assert.ok(l.text.includes('·'), `${id}: the line contains ·`);
			}
			await ctx.close();
		}
	}
});

test('at 1024x768 the amount input and the submit button of each damage form have bottom edges within 4px', async () => {
	const { camp, a } = await setup();
	for (const path of [`/characters/${a}`, `/campaigns/${camp}?step=run`]) {
		const { ctx, p } = await open(path);
		const forms = await p.evaluate(() => [...document.querySelectorAll('form[action="?/damage"]')].map((f) => {
			const input = f.querySelector('input[name="amount"]');
			const btn = f.querySelector('button[type="submit"], button:not([type])');
			return { input: input?.getBoundingClientRect().bottom, btn: btn?.getBoundingClientRect().bottom };
		}));
		assert.ok(forms.length >= (path.startsWith('/characters') ? 1 : 2), `${path}: damage forms`);
		for (const [i, f] of forms.entries()) {
			assert.ok(f.input !== undefined && f.btn !== undefined, `${path} #${i}: amount input and button`);
			assert.ok(Math.abs(f.input - f.btn) <= 4, `${path} #${i}: input bottom ${f.input} vs button bottom ${f.btn}`);
		}
		await ctx.close();
	}
});

test('clicking + and − on the sheet HP tracker changes hp by 1', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'HP click camp' })).id;
	const id = (await newCharacter(camp, 'Clicker')).id;
	const { ctx, p } = await open(`/characters/${id}`);
	const hp = p.locator('[data-testid="hp"]');
	const form = p.locator('form', { has: p.locator('[data-testid="hp"]') });
	const start = await markedHp(hp);
	await form.locator('button[name="delta"][value="1"]').click();
	await p.waitForFunction((n) => document.querySelector('[data-testid="hp"]').textContent.trim().startsWith(`${n}/`), start + 1);
	assert.equal(await markedHp(hp), start + 1);
	await form.locator('button[name="delta"][value="-1"]').click();
	await p.waitForFunction((n) => document.querySelector('[data-testid="hp"]').textContent.trim().startsWith(`${n}/`), start);
	assert.equal(await markedHp(hp), start);
	await ctx.close();
	assert.equal((await api('GET', `/api/characters/${id}`)).hp.marked, start);
});

test('without JavaScript, + and − on the sheet HP tracker reload the page with the new value', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'HP no-JS camp' })).id;
	const id = (await newCharacter(camp, 'NoScript')).id;
	const { ctx, p } = await open(`/characters/${id}`, { js: false });
	const hp = p.locator('[data-testid="hp"]');
	const btn = (v) => p.locator('form', { has: p.locator('[data-testid="hp"]') }).locator(`button[name="delta"][value="${v}"]`);
	const start = await markedHp(hp);
	await Promise.all([p.waitForNavigation(), btn('1').click()]);
	assert.equal(await markedHp(hp), start + 1);
	await Promise.all([p.waitForNavigation(), btn('-1').click()]);
	assert.equal(await markedHp(hp), start);
	await ctx.close();
});

test('submitting damage 3 on a Run card marks 1 HP on that character only', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Damage camp' })).id;
	const a = (await newCharacter(camp, 'Target')).id;
	const b = (await newCharacter(camp, 'Bystander')).id;
	const { ctx, p } = await open(`/campaigns/${camp}?step=run`);
	const card = p.locator('[data-testid="character-card"]', { has: p.locator('[data-testid="character-name"]', { hasText: 'Target' }) });
	const other = p.locator('[data-testid="character-card"]', { has: p.locator('[data-testid="character-name"]', { hasText: 'Bystander' }) });
	assert.equal(await markedHp(card.locator('[data-testid="hp"]')), 0);
	const form = card.locator('form[action="?/damage"]');
	await form.locator('input[name="amount"]').fill('3');
	await form.locator('button[type="submit"]').click();
	await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="character-card"]')]
		.some((c) => c.textContent.includes('Target') && c.querySelector('[data-testid="hp"]').textContent.trim().startsWith('1/')));
	assert.equal(await markedHp(card.locator('[data-testid="hp"]')), 1);
	assert.equal(await markedHp(other.locator('[data-testid="hp"]')), 0);
	await ctx.close();
	assert.equal((await api('GET', `/api/characters/${a}`)).hp.marked, 1);
	assert.equal((await api('GET', `/api/characters/${b}`)).hp.marked, 0);
});
