import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const load = (l) => JSON.parse(fs.readFileSync(`src/lib/i18n/${l}.json`, 'utf8'));
const dict = { en: load('en'), fr: load('fr') };
const NOTES = 'Scar over left eye; owes Zorblax a favour';
const ITEMS = ['Zorblax lantern', 'Quux rope'];
let browser, rich, downed, bare;

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	const camp = (await api('POST', '/api/campaigns', { name: 'Zorblax Camp' })).id;
	const mk = async (name) => (await api('POST', `/api/campaigns/${camp}/characters`, {
		name, class: 'Wanderer', level: 3, evasion: 11, majorThreshold: 6, severeThreshold: 12,
		maxHp: 5, maxStress: 6, armorSlots: 3 })).id;
	rich = await mk('Rook');
	await api('POST', `/api/characters/${rich}/gold`, { handfuls: 123 }); // 1 chest, 2 bags, 3 handfuls
	await api('PATCH', `/api/characters/${rich}`, { notes: NOTES });
	for (const name of ITEMS) await api('POST', `/api/characters/${rich}/items`, { name, quantity: 2 });
	downed = await mk('Mira');
	await api('POST', `/api/characters/${downed}/hp`, { delta: 5 });
	await api('PUT', `/api/characters/${downed}/conditions`, { vulnerable: true, restrained: true, hidden: true });
	bare = await mk('Bare');
});
after(async () => { await browser?.close(); });

async function open(lang, id, tab) {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/characters/${id}${tab ? `?tab=${tab}` : ''}`);
	return { ctx, page };
}
// us-305: the sheet is split into tabs; whole-sheet checks collect every tab.
const TABS = ['play', 'traits', 'gear', 'cards', 'notes'];
async function eachTab(lang, id, fn) {
	const out = [];
	for (const tab of TABS) {
		const { ctx, page } = await open(lang, id, tab);
		out.push(await fn(page));
		await ctx.close();
	}
	return out;
}
// us-195 moved the class and level labels into the edit dialog: read it served open (?new=edit, no JavaScript)
async function editDialogText(lang, id) {
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/characters/${id}?new=edit`);
	const text = await bodyText(page);
	await ctx.close();
	return text;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, 'u').test(text);
// US-45: text inside lang="en" elements (SRD text) is ignored by the "no foreign language" rule.
const bodyText = (page) => page.evaluate(() => { const els = [...document.querySelectorAll('[lang="en"]:not(html)')]; const old = els.map((e) => e.style.display); els.forEach((e) => { e.style.display = 'none'; }); const t = document.body.innerText; els.forEach((e, i) => { e.style.display = old[i]; }); return t; });

async function interfaceTexts(page) {
	return page.evaluate(() => {
		const out = [];
		for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,button,summary,legend,th,[role="button"]')) {
			if (el.closest('[lang="en"]:not(html)') || el.matches('[data-testid="help-open"],[data-testid^="lang-"]')) continue; // US-45: SRD text, and the "?" helper toggle (named by aria-label)
			if (el.querySelector('[data-testid="character-name"]')) continue; // user data
			const clone = el.cloneNode(true);
			clone.querySelectorAll('input,select,textarea').forEach((i) => i.remove());
			const t = clone.textContent.replace(/\s+/g, ' ').trim();
			if (t) out.push({ kind: el.tagName, text: t });
		}
		for (const el of document.querySelectorAll('[placeholder]')) out.push({ kind: 'placeholder', text: el.getAttribute('placeholder') });
		for (const el of document.querySelectorAll('input[type=submit],input[type=button]')) out.push({ kind: 'input', text: el.value });
		for (const el of document.querySelectorAll('[data-testid^="condition-"],[data-testid="down"]')) out.push({ kind: 'badge', text: (el.querySelector('[data-testid="help-open"]') ?? el).textContent.trim() });
		return out.filter((x) => x.text);
	});
}
// Tracker labels may be written with a trailing colon ("HP:").
const norm = (s) => s.replace(/\s*:\s*$/, '');

test('every heading, label, button, placeholder and badge of /characters/:id comes from the dictionaries', async () => {
	for (const lang of ['en', 'fr']) {
		const values = new Set(Object.values(dict[lang]));
		for (const id of [rich, downed, bare]) {
			const texts = (await eachTab(lang, id, interfaceTexts)).flat();
			assert.ok(texts.some((t) => t.kind === 'H2'), 'a heading exists');
			assert.ok(texts.filter((t) => t.kind === 'BUTTON').length > 5, 'buttons exist');
			if (id === downed) assert.ok(texts.some((t) => t.kind === 'badge'), 'a badge exists');
			for (const t of texts) assert.ok(values.has(t.text) || values.has(norm(t.text)), `${lang}: ${t.kind} "${t.text}" is not in ${lang}.json`);
		}
	}
});

async function noForeignWords(lang, other) {
	for (const id of [rich, downed, bare]) {
		const text = (await eachTab(lang, id, bodyText)).join('\n');
		const bad = Object.keys(dict[other]).filter((k) =>
			dict[other][k] !== dict[lang][k] && hasWord(text, dict[other][k])).map((k) => `${k}=${dict[other][k]}`);
		assert.deepEqual(bad, [], `${lang} page shows ${other} text`);
	}
}
test('lang=fr: no differing en.json value appears as a whole word', () => noForeignWords('fr', 'en'));
test('lang=en: no differing fr.json value appears as a whole word', () => noForeignWords('en', 'fr'));

test('lang=fr: visible text contains Inventaire, Or, Notes, Niveau, Classe', async () => {
	const text = [...await eachTab('fr', rich, bodyText), await editDialogText('fr', rich)].join('\n');
	for (const w of ['Inventaire', 'Or', 'Notes', 'Niveau', 'Classe']) assert.ok(hasWord(text, w), `missing ${w}`);
});

test('lang=en: visible text contains Inventory, Gold, Notes, Level, Class', async () => {
	const text = [...await eachTab('en', rich, bodyText), await editDialogText('en', rich)].join('\n');
	for (const w of ['Inventory', 'Gold', 'Notes', 'Level', 'Class']) assert.ok(hasWord(text, w), `missing ${w}`);
});

test('gold line reads "1 chests, 2 bags, 3 handfuls" in English and "1 coffres, 2 bourses, 3 poignées" in French', async () => {
	const want = { en: '1 chests, 2 bags, 3 handfuls', fr: '1 coffres, 2 bourses, 3 poignées' };
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, rich, 'gear');
		const got = (await page.locator('[data-testid="gold"]').innerText()).replace(/\s+/g, ' ').trim();
		assert.equal(got, want[lang]);
		await ctx.close();
	}
});

test('notes and item names appear as entered in both languages', async () => {
	for (const lang of ['en', 'fr']) {
		let { ctx, page } = await open(lang, rich, 'notes');
		assert.equal(await page.locator('[data-testid="notes"]').inputValue(), NOTES);
		await ctx.close();
		({ ctx, page } = await open(lang, rich, 'gear'));
		const items = await page.locator('[data-testid="item"]').allInnerTexts();
		assert.equal(items.length, ITEMS.length);
		for (const name of ITEMS) assert.ok(items.some((t) => t.includes(name)), `${lang}: item ${name}`);
		assert.ok(hasWord(await bodyText(page), 'Rook'), 'character name as entered');
		assert.ok((await page.locator('[data-testid="character-name"]').innerText()).includes('Rook'));
		await ctx.close();
	}
});

test('badges and values: Down/Vulnerable/Restrained/Hidden translate, numbers do not change', async () => {
	const want = { fr: ['À terre', 'Vulnérable', 'Entravé', 'Caché'], en: ['Down', 'Vulnerable', 'Restrained', 'Hidden'] };
	const vals = {};
	for (const lang of ['fr', 'en']) {
		const { ctx, page } = await open(lang, downed);
		const got = [];
		for (const t of ['down', 'condition-vulnerable', 'condition-restrained', 'condition-hidden']) got.push((await page.locator(`[data-testid="${t}"]`).innerText()).trim());
		assert.deepEqual(got, want[lang]);
		vals[lang] = [];
		for (const k of ['hp', 'stress', 'hope', 'armor', 'evasion', 'thresholds']) vals[lang].push((await page.locator(`[data-testid="${k}"]`).innerText()).trim());
		await ctx.close();
	}
	assert.deepEqual(vals.fr, vals.en);
	assert.equal(vals.en[0], '5/5');
});
