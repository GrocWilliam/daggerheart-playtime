import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let paths = ['/'];
let browser;

before(async () => {
	const c = await (await fetch(BASE + '/api/campaigns', {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lang campaign' })
	})).json();
	const ch = await (await fetch(`${BASE}/api/campaigns/${c.id}/characters`, {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Hero', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2 })
	})).json();
	paths = ['/', `/campaigns/${c.id}`, `/characters/${ch.id}`];
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

const htmlLang = (html) => /<html[^>]*\slang="([^"]*)"/.exec(html)?.[1];
const get = async (p, headers = {}) => (await fetch(BASE + p, { headers })).text();
const post = (body, raw) => fetch(BASE + '/api/language', {
	method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body)
});

test('dictionaries en.json and fr.json are flat, same keys, no empty value', () => {
	const load = (l) => JSON.parse(fs.readFileSync(`src/lib/i18n/${l}.json`, 'utf8'));
	const en = load('en'), fr = load('fr');
	for (const d of [en, fr]) {
		assert.ok(d && typeof d === 'object' && !Array.isArray(d));
		for (const [k, v] of Object.entries(d)) {
			assert.equal(typeof v, 'string', k);
			assert.ok(v.trim().length > 0, `empty value for ${k}`);
		}
	}
	assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
	assert.ok(Object.keys(en).length > 0);
});

test('language resolution: lang cookie wins when en or fr', async () => {
	for (const p of paths) {
		assert.equal(htmlLang(await get(p, { cookie: 'lang=fr', 'accept-language': 'en' })), 'fr');
		assert.equal(htmlLang(await get(p, { cookie: 'lang=en', 'accept-language': 'fr-FR' })), 'en');
	}
});

test('language resolution: invalid cookie falls back to Accept-Language', async () => {
	assert.equal(htmlLang(await get('/', { cookie: 'lang=de', 'accept-language': 'fr' })), 'fr');
	assert.equal(htmlLang(await get('/', { cookie: 'lang=', 'accept-language': 'en' })), 'en');
});

test('language resolution: first supported language of Accept-Language', async () => {
	assert.equal(htmlLang(await get('/', { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' })), 'fr');
	assert.equal(htmlLang(await get('/', { 'accept-language': 'de-DE,en;q=0.5' })), 'en');
	assert.equal(htmlLang(await get('/', { 'accept-language': 'de-DE,fr-CA;q=0.5,en;q=0.4' })), 'fr');
});

test('language resolution: defaults to en', async () => {
	assert.equal(htmlLang(await get('/', { 'accept-language': 'de-DE,es;q=0.5' })), 'en');
	assert.equal(htmlLang(await get('/', { 'accept-language': '' })), 'en');
});

test('every page has html lang matching the resolved language', async () => {
	for (const p of paths) {
		assert.equal(htmlLang(await get(p, { cookie: 'lang=fr' })), 'fr', p);
		assert.equal(htmlLang(await get(p, { 'accept-language': 'en' })), 'en', p);
	}
});

test('POST /api/language with fr or en answers 204 and sets the cookie', async () => {
	for (const l of ['fr', 'en']) {
		const res = await post({ lang: l });
		assert.equal(res.status, 204);
		const sc = res.headers.getSetCookie().find((c) => c.startsWith('lang='));
		assert.ok(sc, 'set-cookie lang');
		const parts = sc.split(/;\s*/).map((s) => s.toLowerCase());
		assert.equal(parts[0], `lang=${l}`);
		assert.ok(parts.includes('path=/'));
		assert.ok(parts.includes('max-age=31536000'));
		assert.ok(parts.includes('samesite=lax'));
	}
});

test('POST /api/language with another value or invalid JSON answers 400 with error and no cookie', async () => {
	const cases = [
		[{ lang: 'de' }], [{ lang: 'FR' }], [{ lang: 1 }], [{}], [null, '{not json'], [null, '']
	];
	for (const [b, raw] of cases) {
		const res = await post(b, raw);
		assert.equal(res.status, 400, JSON.stringify(b ?? raw));
		const j = await res.json();
		assert.equal(typeof j.error, 'string');
		assert.ok(j.error.length > 0);
		assert.equal(res.headers.getSetCookie().find((c) => c.startsWith('lang=')), undefined);
	}
});

test('every page shows the language switcher with two buttons and aria-pressed', async () => {
	for (const lang of ['en', 'fr']) {
		for (const p of paths) {
			const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, extraHTTPHeaders: { cookie: `lang=${lang}` } });
			const page = await ctx.newPage();
			await page.goto(BASE + p, { waitUntil: 'networkidle' });
			const sw = page.getByTestId('language-switcher');
			assert.equal(await sw.count(), 1, p);
			assert.equal(await sw.getByRole('button').count(), 2);
			const en = page.getByTestId('lang-en'), fr = page.getByTestId('lang-fr');
			assert.equal((await en.textContent()).trim(), 'English');
			assert.equal((await fr.textContent()).trim(), 'Français');
			assert.equal(await en.getAttribute('aria-pressed'), String(lang === 'en'), `${p} ${lang}`);
			assert.equal(await fr.getAttribute('aria-pressed'), String(lang === 'fr'), `${p} ${lang}`);
			await ctx.close();
		}
	}
});

test('language switcher buttons are at least 44x44 CSS px', async () => {
	for (const [w, h] of [[320, 568], [1280, 800]]) {
		for (const p of paths) {
			const ctx = await browser.newContext({ viewport: { width: w, height: h } });
			const page = await ctx.newPage();
			await page.goto(BASE + p, { waitUntil: 'networkidle' });
			for (const id of ['lang-en', 'lang-fr']) {
				const b = await page.getByTestId(id).boundingBox();
				assert.ok(b && b.width >= 43.99 && b.height >= 43.99, `${p} ${id} ${JSON.stringify(b)}`);
			}
			await ctx.close();
		}
	}
});

test('pressing Français reloads with html lang=fr and cookie; English brings it back', async () => {
	for (const p of paths) {
		const ctx = await browser.newContext({ extraHTTPHeaders: {} , locale: 'en-US' });
		const page = await ctx.newPage();
		await page.goto(BASE + p, { waitUntil: 'networkidle' });
		assert.equal(await page.getAttribute('html', 'lang'), 'en');
		await Promise.all([page.waitForEvent('load'), page.getByTestId('lang-fr').click()]);
		await page.waitForLoadState('networkidle');
		assert.equal(await page.getAttribute('html', 'lang'), 'fr', p);
		assert.equal((await ctx.cookies()).find((c) => c.name === 'lang')?.value, 'fr');
		assert.equal(await page.getByTestId('lang-fr').getAttribute('aria-pressed'), 'true');
		await Promise.all([page.waitForEvent('load'), page.getByTestId('lang-en').click()]);
		await page.waitForLoadState('networkidle');
		assert.equal(await page.getAttribute('html', 'lang'), 'en', p);
		assert.equal((await ctx.cookies()).find((c) => c.name === 'lang')?.value, 'en');
		await ctx.close();
	}
});
