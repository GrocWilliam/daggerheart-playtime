import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const load = (l) => JSON.parse(fs.readFileSync(`src/lib/i18n/${l}.json`, 'utf8'));
const dict = { en: load('en'), fr: load('fr') };
let browser, empty, full;

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	empty = (await api('POST', '/api/campaigns', { name: 'Zorblax Empty' })).id;
	full = (await api('POST', '/api/campaigns', { name: 'Zorblax Full' })).id;
	await api('POST', `/api/campaigns/${full}/fear`, { delta: 4 });
	const mk = (name, extra) => api('POST', `/api/campaigns/${full}/characters`, {
		name, class: 'Wanderer', level: 3, evasion: 11, majorThreshold: 6, severeThreshold: 12,
		maxHp: 5, maxStress: 6, armorSlots: 3, ...extra });
	const a = await mk('Rook');
	await api('POST', `/api/characters/${a.id}/hp`, { delta: 5 });
	await api('POST', `/api/characters/${a.id}/stress`, { delta: 2 });
	await api('POST', `/api/characters/${a.id}/hope`, { delta: 1 });
	await api('POST', `/api/characters/${a.id}/armor`, { delta: 1 });
	await api('PUT', `/api/characters/${a.id}/conditions`, { vulnerable: true, restrained: true, hidden: true });
	await mk('Mira');
});
after(async () => { await browser?.close(); });

async function open(lang, id) {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/campaigns/${id}`);
	return { ctx, page };
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, 'u').test(text);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function interfaceTexts(page) {
	return page.evaluate(() => {
		const out = [];
		for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,button,summary,legend,th,[role="button"]')) {
			if (el.matches('[data-testid="campaign-name"]') || el.querySelector('[data-testid="character-name"]')) continue; // user data
			const clone = el.cloneNode(true);
			clone.querySelectorAll('input,select,textarea,[data-testid="character-name"]').forEach((i) => i.remove());
			const t = clone.textContent.replace(/\s+/g, ' ').trim();
			if (t) out.push({ kind: el.tagName, text: t });
		}
		for (const el of document.querySelectorAll('[placeholder]')) out.push({ kind: 'placeholder', text: el.getAttribute('placeholder') });
		for (const el of document.querySelectorAll('input[type=submit],input[type=button]')) out.push({ kind: 'input', text: el.value });
		for (const el of document.querySelectorAll('[data-testid^="condition-"],[data-testid="down"]')) out.push({ kind: 'badge', text: el.textContent.trim() });
		return out.filter((x) => x.text);
	});
}
// Tracker labels may be written with a trailing colon ("Fear:").
const norm = (s) => s.replace(/\s*:\s*$/, '');

test('every heading, label, button, placeholder and badge of /campaigns/:id comes from the dictionaries', async () => {
	for (const lang of ['en', 'fr']) {
		const values = new Set(Object.values(dict[lang]));
		for (const id of [empty, full]) {
			const { ctx, page } = await open(lang, id);
			const texts = await interfaceTexts(page);
			assert.ok(texts.some((t) => t.kind === 'H2'), 'a heading exists');
			assert.ok(texts.some((t) => t.kind === 'BUTTON'), 'a button exists');
			for (const t of texts) assert.ok(values.has(t.text) || values.has(norm(t.text)), `${lang}: ${t.kind} "${t.text}" is not in ${lang}.json`);
			await ctx.close();
		}
	}
});

async function noForeignWords(lang, other) {
	for (const id of [empty, full]) {
		const { ctx, page } = await open(lang, id);
		const text = await bodyText(page);
		const bad = Object.keys(dict[other]).filter((k) =>
			dict[other][k] !== dict[lang][k] && hasWord(text, dict[other][k])).map((k) => `${k}=${dict[other][k]}`);
		await ctx.close();
		assert.deepEqual(bad, [], `${lang} page shows ${other} text`);
	}
}
test('lang=fr: no differing en.json value appears as a whole word', () => noForeignWords('fr', 'en'));
test('lang=en: no differing fr.json value appears as a whole word', () => noForeignWords('en', 'fr'));

test('lang=fr: visible text contains Peur, PV, Stress, Espoir, Armure, Évasion, Seuils', async () => {
	const { ctx, page } = await open('fr', full);
	const text = await bodyText(page);
	for (const w of ['Peur', 'PV', 'Stress', 'Espoir', 'Armure', 'Évasion', 'Seuils']) assert.ok(hasWord(text, w), `missing ${w}`);
	await ctx.close();
});
test('lang=en: visible text contains Fear, HP, Stress, Hope, Armor, Evasion, Thresholds', async () => {
	const { ctx, page } = await open('en', full);
	const text = await bodyText(page);
	for (const w of ['Fear', 'HP', 'Stress', 'Hope', 'Armor', 'Evasion', 'Thresholds']) assert.ok(hasWord(text, w), `missing ${w}`);
	await ctx.close();
});

test('badges read À terre, Vulnérable, Entravé, Caché in French and Down, Vulnerable, Restrained, Hidden in English', async () => {
	const want = { fr: ['À terre', 'Vulnérable', 'Entravé', 'Caché'], en: ['Down', 'Vulnerable', 'Restrained', 'Hidden'] };
	for (const lang of ['fr', 'en']) {
		const { ctx, page } = await open(lang, full);
		const card = page.locator('[data-testid="character-card"]').filter({ hasText: 'Rook' });
		const got = [];
		for (const t of ['down', 'condition-vulnerable', 'condition-restrained', 'condition-hidden']) got.push((await card.locator(`[data-testid="${t}"]`).innerText()).trim());
		assert.deepEqual(got, want[lang]);
		await ctx.close();
	}
});

test('values of hp, stress, hope, armor, evasion, thresholds and fear are unchanged by the language', async () => {
	const read = async (lang) => {
		const { ctx, page } = await open(lang, full);
		const card = page.locator('[data-testid="character-card"]').filter({ hasText: 'Rook' });
		const o = { fear: (await page.locator('[data-testid="fear"]').innerText()).trim() };
		for (const k of ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds']) o[k] = (await card.locator(`[data-testid="${k}"]`).innerText()).trim();
		await ctx.close();
		return o;
	};
	const en = await read('en'), fr = await read('fr');
	assert.deepEqual(fr, en);
	assert.equal(en.fear, '4');
	assert.equal(en.hp, '5/5');
	assert.equal(en.evasion, '11');
	assert.equal(en.thresholds, '6/12');
});
