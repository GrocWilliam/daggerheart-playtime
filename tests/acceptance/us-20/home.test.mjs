import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const load = (l) => JSON.parse(fs.readFileSync(`src/lib/i18n/${l}.json`, 'utf8'));
const dict = { en: load('en'), fr: load('fr') };
const NAMES = ['Zorblax Chronicles', 'Campagne des Ombres'];
let browser;

before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(lang) {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + '/');
	return { ctx, page };
}
const seed = () => Promise.all(NAMES.map((name) => fetch(BASE + '/api/campaigns', {
	method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
})));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, 'u').test(text);

async function interfaceTexts(page) {
	return page.evaluate(() => {
		const out = [];
		const skip = (el) => el.closest('[data-testid="campaign-link"]');
		for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,button,summary,legend,th,[role="button"]')) {
			if (skip(el)) continue;
			const clone = el.cloneNode(true);
			clone.querySelectorAll('input,select,textarea').forEach((i) => i.remove());
			const t = clone.textContent.replace(/\s+/g, ' ').trim();
			if (t) out.push({ kind: el.tagName, text: t });
		}
		for (const el of document.querySelectorAll('[placeholder]')) out.push({ kind: 'placeholder', text: el.getAttribute('placeholder') });
		for (const el of document.querySelectorAll('input[type=submit],input[type=button]')) out.push({ kind: 'input', text: el.value });
		return out.filter((x) => x.text);
	});
}

async function noForeignWords(lang, other) {
	const { ctx, page } = await open(lang);
	const text = await page.evaluate(() => document.body.innerText);
	const bad = Object.keys(dict[other]).filter((k) =>
		dict[other][k] !== dict[lang][k] && hasWord(text, dict[other][k])).map((k) => `${k}=${dict[other][k]}`);
	await ctx.close();
	assert.deepEqual(bad, [], `${lang} page shows ${other} text`);
}

// Run on an empty list first (empty-state texts), then again with data.
test('every heading, label, button and placeholder of / comes from the dictionaries (no campaigns)', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang);
		const values = new Set(Object.values(dict[lang]));
		const texts = await interfaceTexts(page);
		assert.ok(texts.some((t) => t.kind === 'H1'), 'a heading exists');
		assert.ok(texts.some((t) => t.kind === 'BUTTON'), 'a button exists');
		for (const t of texts) assert.ok(values.has(t.text), `${lang}: ${t.kind} "${t.text}" is not in ${lang}.json`);
		await ctx.close();
	}
});

test('lang=fr: no differing en.json value appears as a whole word (no campaigns)', () => noForeignWords('fr', 'en'));
test('lang=en: no differing fr.json value appears as a whole word (no campaigns)', () => noForeignWords('en', 'fr'));

test('every heading, label, button and placeholder of / comes from the dictionaries (with campaigns)', async () => {
	await seed();
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang);
		const values = new Set(Object.values(dict[lang]));
		for (const t of await interfaceTexts(page)) assert.ok(values.has(t.text), `${lang}: ${t.kind} "${t.text}" is not in ${lang}.json`);
		await ctx.close();
	}
});

test('lang=fr: no differing en.json value appears as a whole word (with campaigns)', () => noForeignWords('fr', 'en'));
test('lang=en: no differing fr.json value appears as a whole word (with campaigns)', () => noForeignWords('en', 'fr'));

test('lang=fr: visible text contains Campagne', async () => {
	await seed();
	const { ctx, page } = await open('fr');
	const text = await page.evaluate(() => document.body.innerText);
	assert.ok(hasWord(text, 'Campagne') || /Campagne/.test(text), 'Campagne missing');
	assert.ok(Object.values(dict.fr).some((v) => v.includes('Campagne')), 'fr.json has no Campagne value');
	await ctx.close();
});

test('campaign names appear as entered in both languages', async () => {
	await seed();
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang);
		const links = await page.locator('[data-testid="campaign-link"]').allInnerTexts();
		for (const n of NAMES) assert.ok(links.map((l) => l.trim()).includes(n), `${lang}: "${n}" not shown as entered`);
		await ctx.close();
	}
});
