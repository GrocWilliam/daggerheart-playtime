import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dict = { en: json('src/lib/i18n/en.json'), fr: json('src/lib/i18n/fr.json') };
const gloss = Object.fromEntries(json('src/lib/srd/glossary.json').map((g) => [g.id, g]));
let browser, camp, rook, mira;

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	camp = (await api('POST', '/api/campaigns', { name: 'Zorblax Helpers' })).id;
	const mk = (name) => api('POST', `/api/campaigns/${camp}/characters`, {
		name, class: 'Wanderer', level: 3, evasion: 11, majorThreshold: 6, severeThreshold: 12,
		maxHp: 5, maxStress: 6, armorSlots: 3 });
	rook = (await mk('Rook')).id;
	mira = (await mk('Mira')).id;
	await api('PUT', `/api/characters/${rook}/conditions`, { vulnerable: true, restrained: true, hidden: true });
	await api('POST', `/api/characters/${rook}/gold`, { handfuls: 123 });
});
after(async () => { await browser?.close(); });

// JavaScript is disabled in every context: helpers must work without it.
async function open(lang, path, viewport) {
	const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: viewport ?? { width: 1000, height: 800 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + path);
	return { ctx, page };
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// glossary id -> name in each language (from the existing dictionaries)
const NAME = {
	hp: ['tracker.hp'], stress: ['tracker.stress'], hope: ['tracker.hope'], armor: ['tracker.armor'], evasion: ['stat.evasion'],
	thresholds: ['stat.thresholds'], fear: ['campaign.fear'], vulnerable: ['badge.vulnerable'], restrained: ['badge.restrained'],
	hidden: ['badge.hidden'], gold: ['section.gold'], level: null
};
const nameOf = (id, lang) => (id === 'level' ? (lang === 'fr' ? 'Niveau' : 'Level') : dict[lang][NAME[id][0]]);
const helpName = (id, lang) => `${lang === 'fr' ? 'Aide : ' : 'Help: '}${nameOf(id, lang)}`;
const eqName = (a, b) => a.toLowerCase() === b.toLowerCase();

const CAMPAIGN = { path: () => `/campaigns/${camp}`, scope: (p) => p.locator('[data-testid="character-card"]').filter({ hasText: 'Rook' }),
	fear: true, ids: ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds', 'level', 'vulnerable', 'restrained', 'hidden'] };
const SHEET = { path: () => `/characters/${rook}`, scope: (p) => p.locator('body'), fear: false,
	ids: ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds', 'level', 'vulnerable', 'restrained', 'hidden', 'gold'] };
const PAGES = { 'campaign page': CAMPAIGN, 'sheet': SHEET };
const helper = (scope, id) => scope.locator(`details[data-testid="help"][data-help="${id}"]`).first();

for (const [label, P] of Object.entries(PAGES)) {
	test(`${label}: every tracker and term (${P.ids.join(', ')}${P.fear ? ', fear' : ''}) has a glossary helper, with no JavaScript`, async () => {
		for (const lang of ['en', 'fr']) {
			const { ctx, page } = await open(lang, P.path());
			const ids = P.fear ? [...P.ids, 'fear'] : P.ids;
			for (const id of ids) {
				const h = P.fear && id === 'fear' ? helper(page.locator('body'), id) : helper(P.scope(page), id);
				assert.equal(await h.count(), 1, `${lang} ${label}: helper ${id}`);
			}
			await ctx.close();
		}
	});

	test(`${label}: the helper is a <details> whose <summary> is "?" named "Help: <name>" / "Aide : <nom>"`, async () => {
		for (const lang of ['en', 'fr']) {
			const { ctx, page } = await open(lang, P.path());
			const ids = P.fear ? [...P.ids, 'fear'] : P.ids;
			for (const id of ids) {
				const s = helper(page.locator('body'), id).locator('> summary');
				assert.equal(await s.count(), 1, `${id} summary`);
				assert.equal(norm(await s.textContent()), '?', `${id} text`);
				const aria = await s.getAttribute('aria-label');
				assert.ok(aria && eqName(aria, helpName(id, lang)), `${lang} ${id}: aria-label "${aria}" should be "${helpName(id, lang)}"`);
			}
			await ctx.close();
		}
	});

	test(`${label}: each helper summary is at least 44 x 44 px`, async () => {
		const { ctx, page } = await open('en', P.path());
		const boxes = await page.locator('details[data-testid="help"] > summary').evaluateAll((els) =>
			els.map((e) => { const r = e.getBoundingClientRect(); return [e.parentElement.dataset.help, r.width, r.height]; }));
		assert.ok(boxes.length >= P.ids.length, 'helpers present');
		for (const [id, w, h] of boxes) assert.ok(w >= 43.99 && h >= 43.99, `${id}: ${w}x${h}`);
		await ctx.close();
	});

	test(`${label}: opened, a glossary helper shows its name then its text in the page's language (not in lang="en")`, async () => {
		for (const lang of ['en', 'fr']) {
			const { ctx, page } = await open(lang, P.path());
			const ids = P.fear ? [...P.ids.filter((i) => i !== 'level' && i !== 'gold'), 'fear'] : P.ids.filter((i) => i !== 'level' && i !== 'gold');
			for (const id of ids) {
				const h = helper(page.locator('body'), id);
				assert.equal(await h.evaluate((e) => e.open), false, `${id} closed by default`);
				await h.locator('> summary').click();
				assert.equal(await h.evaluate((e) => e.open), true, `${id} opens`);
				const text = norm(await h.evaluate((e) => e.innerText));
				const body = gloss[id][lang];
				const iText = text.indexOf(norm(body));
				assert.ok(iText >= 0, `${lang} ${id}: glossary text missing in "${text}"`);
				const iName = text.toLowerCase().indexOf(nameOf(id, lang).toLowerCase());
				assert.ok(iName >= 0 && iName < iText, `${lang} ${id}: name must come before the text`);
				assert.equal(await h.evaluate((e) => !!e.closest('[lang="en"]:not(html)') || !!e.querySelector('[lang="en"]')), false, `${id}: glossary text must not be lang=en`);
			}
			await ctx.close();
		}
	});
}

test('lang=fr: glossary helper text is not inside a lang="en" element, and <html lang> is fr', async () => {
	const { ctx, page } = await open('fr', CAMPAIGN.path());
	assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
	const h = helper(page.locator('body'), 'fear');
	assert.equal(await h.evaluate((e) => !!e.closest('[lang="en"]:not(html)') || !!e.querySelector('[lang="en"]')), false);
	await ctx.close();
});

test('the level helper sits next to the level on both pages, and gold helper next to the gold line', async () => {
	for (const lang of ['en', 'fr']) {
		const c = await open(lang, CAMPAIGN.path());
		const lvl = helper(CAMPAIGN.scope(c.page), 'level');
		assert.match(norm(await lvl.evaluate((e) => e.parentElement.textContent)), /3/);
		await c.ctx.close();
		const s = await open(lang, SHEET.path());
		const lv = helper(s.page.locator('body'), 'level');
		assert.match(norm(await lv.evaluate((e) => e.parentElement.textContent)), /3/);
		const g = helper(s.page.locator('body'), 'gold');
		assert.equal(await g.evaluate((e) => !!e.parentElement.querySelector('[data-testid="gold"]') || !!e.parentElement.parentElement.querySelector('[data-testid="gold"]')), true);
		await s.ctx.close();
	}
});

test('each tracker/stat helper is next to its own label (same row as its data-testid value)', async () => {
	for (const [P, ids] of [[CAMPAIGN, ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds']], [SHEET, ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds']]]) {
		const { ctx, page } = await open('en', P.path());
		const scope = P.scope(page);
		for (const id of ids) {
			const ok = await scope.locator(`[data-testid="${id}"]`).first().evaluate((v, id) => {
				const row = v.closest('form, p, li, tr');
				return !!row && !!row.querySelector(`details[data-testid="help"][data-help="${id}"]`) && !row.contains(document.querySelector(`details[data-help="${id === 'hp' ? 'stress' : 'hp'}"]`));
			}, id);
			assert.ok(ok, `${id} helper must be in the same row as its value`);
		}
		await ctx.close();
	}
	const { ctx, page } = await open('en', CAMPAIGN.path());
	assert.equal(await page.locator('[data-testid="fear"]').evaluate((v) => !!v.closest('form, p, div').querySelector('details[data-help="fear"]')), true);
	for (const c of ['vulnerable', 'restrained', 'hidden']) {
		assert.equal(await CAMPAIGN.scope(page).locator(`[data-testid="condition-${c}"]`).evaluate((v, c) => !!v.closest('p, li, div').querySelector(`details[data-help="${c}"]`), c), true, c);
	}
	await ctx.close();
});

test('existing data-testid values and content are unchanged by the helpers', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, CAMPAIGN.path());
		const card = CAMPAIGN.scope(page);
		const got = {};
		for (const k of ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds']) got[k] = norm(await card.locator(`[data-testid="${k}"]`).innerText());
		assert.match(got.hp, /^\d+\/5$/);
		assert.equal(got.evasion, '11');
		assert.equal(got.thresholds, '6/12');
		assert.equal(norm(await page.locator('[data-testid="fear"]').innerText()), '0');
		assert.equal(await page.locator('[data-testid="character-card"]').count(), 2);
		await ctx.close();
		const s = await open(lang, SHEET.path());
		assert.equal(norm(await s.page.locator('[data-testid="gold"]').innerText()).startsWith('1 '), true);
		assert.ok((await s.page.locator('[data-testid="character-name"]').innerText()).includes('Rook'));
		await s.ctx.close();
	}
});

test('mobile: at 360 px wide there is no horizontal overflow, even with every helper open', async () => {
	for (const path of [CAMPAIGN.path(), SHEET.path()]) {
		for (const lang of ['en', 'fr']) {
			const { ctx, page } = await open(lang, path, { width: 360, height: 740 });
			const n = await page.locator('details[data-testid="help"]').count();
			for (let i = 0; i < n; i++) await page.locator('details[data-testid="help"] > summary').nth(i).click();
			const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
			assert.ok(over <= 0, `${lang} ${path}: overflow ${over}px`);
			await ctx.close();
		}
	}
});
