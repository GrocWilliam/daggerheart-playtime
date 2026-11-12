import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${await r.clone().text()}`);
	return r.status === 204 ? null : r.json();
};
const TOL = 4;
let S;
async function setup(tag) {
	const camp = (await api('POST', '/api/campaigns', { name: 'Rows Camp ' + tag })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Rowan ' + tag, class: 'Guardian', level: 1, evasion: 9, majorThreshold: 7, severeThreshold: 14, maxHp: 6, maxStress: 6, armorSlots: 3
	})).id;
	await api('POST', `/api/characters/${ch}/experiences`, { name: 'Tracking', modifier: 2 });
	await api('POST', `/api/characters/${ch}/items`, { name: 'Rope', quantity: 2 });
	return { camp, ch };
}
const shared = async () => (S ??= await setup('shared'));

async function open(path, { w = 1024, h = 768, js = true } = {}) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(15000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	if (js) await p.waitForLoadState('networkidle');
	return { ctx, p };
}

// Sheet forms, found by their (unchanged) action name, scoped to their section when the story names one.
const SHEET_FORMS = [
	{ key: 'gold', tab: 'gear', scope: null, sel: 'form[action*="?/gold"]', field: 'input[name="handfuls"]' },
	{ key: 'primary', tab: 'gear', scope: 'sheet-equipment', sel: 'form[action*="?/equip"]:has(select[name="primaryWeapon"])', field: 'select' },
	{ key: 'secondary', tab: 'gear', scope: 'sheet-equipment', sel: 'form[action*="?/equip"]:has(select[name="secondaryWeapon"])', field: 'select' },
	{ key: 'armor', tab: 'gear', scope: 'sheet-equipment', sel: 'form[action*="?/equip"]:has(select[name="armorId"])', field: 'select' },
	{ key: 'experience', tab: 'traits', scope: 'sheet-experiences', sel: 'form[action*="?/setExperience"]', field: 'input[name="modifier"]' },
	{ key: 'quantity', tab: 'gear', scope: 'sheet-inventory', sel: 'form[action*="?/setQuantity"]', field: 'input[name="quantity"]' }
];
const RUN_FORM = { key: 'journal', scope: 'journal', sel: 'form[action*="?/addJournal"]', field: 'textarea[name="text"]' };

const measure = (p, f) => p.evaluate(({ f }) => {
	const root = f.scope ? document.querySelector(`[data-testid="${f.scope}"]`) : document;
	const forms = root ? root.querySelectorAll(f.sel) : [];
	if (forms.length !== 1) return { error: `${f.key}: ${forms.length} forms` };
	const form = forms[0];
	const field = form.querySelector(f.field);
	const button = form.querySelector('button[type="submit"]');
	if (!field || !button) return { error: `${f.key}: field or button missing` };
	const a = field.getBoundingClientRect(), b = button.getBoundingClientRect();
	const cs = getComputedStyle(form);
	return {
		display: cs.display, wrap: cs.flexWrap,
		field: { top: a.top, bottom: a.bottom, left: a.left, right: a.right, w: a.width },
		button: { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }
	};
}, { f });

// us-305: sheet forms live on their tab
const toTab = async (p, f) => {
	const u = new URL(p.url());
	if (!f.tab || !u.pathname.startsWith('/characters/') || u.searchParams.get('tab') === f.tab) return;
	await p.goto(`${u.origin}${u.pathname}?tab=${f.tab}`);
	await p.waitForLoadState('networkidle').catch(() => {});
};
const get = async (p, f) => { await toTab(p, f); const m = await measure(p, f); assert.ok(!m.error, m.error); return m; };

test('gold input and button share a bottom edge, button to the right (1024x768)', async () => {
	const { ch } = await shared();
	const { ctx, p } = await open(`/characters/${ch}`);
	const m = await get(p, SHEET_FORMS[0]);
	assert.ok(Math.abs(m.field.bottom - m.button.bottom) <= TOL, JSON.stringify(m));
	assert.ok(m.button.left >= m.field.right - 1, `button not right of input: ${JSON.stringify(m)}`);
	await ctx.close();
});

test('each equip select and its button share a bottom edge (1024x768)', async () => {
	const { ch } = await shared();
	const { ctx, p } = await open(`/characters/${ch}`);
	for (const f of SHEET_FORMS.slice(1, 4)) {
		const m = await get(p, f);
		assert.ok(Math.abs(m.field.bottom - m.button.bottom) <= TOL, `${f.key} ${JSON.stringify(m)}`);
	}
	await ctx.close();
});

test('experience value form and quantity form share a bottom edge (1024x768)', async () => {
	const { ch } = await shared();
	const { ctx, p } = await open(`/characters/${ch}`);
	for (const f of SHEET_FORMS.slice(4)) {
		const m = await get(p, f);
		assert.ok(Math.abs(m.field.bottom - m.button.bottom) <= TOL, `${f.key} ${JSON.stringify(m)}`);
	}
	await ctx.close();
});

test('journal textarea and button sit on one row at 768x1024, textarea wider', async () => {
	const { camp } = await shared();
	const { ctx, p } = await open(`/campaigns/${camp}?step=run`, { w: 768, h: 1024 });
	const m = await get(p, RUN_FORM);
	const sameRow = Math.abs(m.field.top - m.button.top) <= TOL || Math.abs(m.field.bottom - m.button.bottom) <= TOL;
	assert.ok(sameRow, JSON.stringify(m));
	assert.ok(m.field.w > m.button.w, JSON.stringify(m));
	await ctx.close();
});

test('no horizontal scroll and 44x44 buttons at 375x812', async () => {
	const { camp, ch } = await shared();
	for (const [path, forms] of [[`/characters/${ch}`, SHEET_FORMS], [`/campaigns/${camp}?step=run`, [RUN_FORM]]]) {
		const { ctx, p } = await open(path, { w: 375, h: 812 });
		const scroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(scroll <= 0, `${path} scrolls by ${scroll}`);
		for (const f of forms) {
			const m = await get(p, f);
			assert.ok(m.button.w >= 43.5 && m.button.h >= 43.5, `${f.key} button ${m.button.w}x${m.button.h}`);
		}
		await ctx.close();
	}
});

test('these forms are display:flex with flex-wrap:wrap', async () => {
	const { camp, ch } = await shared();
	for (const [path, forms] of [[`/characters/${ch}`, SHEET_FORMS], [`/campaigns/${camp}?step=run`, [RUN_FORM]]]) {
		const { ctx, p } = await open(path);
		for (const f of forms) {
			const m = await get(p, f);
			assert.equal(m.display, 'flex', f.key);
			assert.equal(m.wrap, 'wrap', f.key);
		}
		await ctx.close();
	}
});

for (const js of [true, false]) {
	test(`setting gold to 12 and equipping armor work ${js ? 'with' : 'without'} JavaScript`, async () => {
		const { ch } = await setup(js ? 'js' : 'nojs');
		const { ctx, p } = await open(`/characters/${ch}?tab=gear`, { js });
		await p.locator('form[action*="?/gold"] input[name="handfuls"]').fill('12');
		await Promise.all([
			js ? p.waitForResponse((r) => r.request().method() === 'POST') : p.waitForNavigation(),
			p.locator('form[action*="?/gold"] button[type="submit"]').click()
		]);
		const total = async () => { const g = (await api('GET', `/api/characters/${ch}`)).gold; return g.chests * 100 + g.bags * 10 + g.handfuls; };
		assert.equal(await total(), 12);
		if (!js) await p.goto(`${BASE}/characters/${ch}?tab=gear`);
		const armor = p.locator('form[action*="?/equip"]:has(select[name="armorId"])');
		await armor.locator('select').selectOption('core_armor_gambeson_armor');
		await Promise.all([
			js ? p.waitForResponse((r) => r.request().method() === 'POST') : p.waitForNavigation(),
			armor.locator('button[type="submit"]').click()
		]);
		if (!js) await p.goto(`${BASE}/characters/${ch}?tab=gear`);
		await p.locator('[data-testid="equipped-armor"]').waitFor();
		const c = await api('GET', `/api/characters/${ch}`);
		assert.equal(c.armorId, 'core_armor_gambeson_armor');
		await ctx.close();
	});
}
