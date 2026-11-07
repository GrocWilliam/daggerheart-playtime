import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const KINDS = ['classes', 'subclasses', 'ancestries', 'communities', 'domains', 'domain-cards', 'weapons', 'armors', 'consumables', 'items', 'rules', 'adversaries', 'environments'];
let browser, camp, ch;

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
const names = async (kind, lang) => (await (await fetch(`${BASE}/api/srd/${kind}`, { headers: { cookie: `lang=${lang}` } })).json()).map((e) => e.name);
const page = async (qs, lang = 'en') => {
	const r = await fetch(`${BASE}/reference${qs}`, { headers: { cookie: `lang=${lang}` } });
	assert.equal(r.status, 200, `/reference${qs}`);
	return r.text();
};
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
// Opens a page in a browser (JS on) and returns { kind -> [item texts] }
async function items(qs, lang = 'en') {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	await p.goto(`${BASE}/reference${qs}`);
	const out = {};
	for (const k of KINDS) {
		const sec = p.locator(`[data-testid="ref-${k}"]`);
		out[k] = (await sec.count()) === 0 ? [] : await sec.first().locator('[data-testid="ref-item"]').evaluateAll((els) => els.map((e) => e.innerText));
	}
	const total = await p.locator('[data-testid="ref-item"]').count();
	await ctx.close();
	return { out, total };
}

before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	camp = (await api('POST', '/api/campaigns', { name: 'Ref Camp' })).id;
	ch = (await api('POST', `/api/campaigns/${camp}/characters`, { name: 'Ref', class: 'Wanderer', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3 })).id;
});
after(async () => { await browser?.close(); });

for (const lang of ['en', 'fr']) {
	test(`every kind is a section ref-<kind> with every element as ref-item showing its name (${lang})`, async () => {
		const { out, total } = await items('', lang);
		let sum = 0;
		for (const k of KINDS) {
			const expected = await names(k, lang);
			assert.equal(out[k].length, expected.length, `${k}: item count`);
			sum += expected.length;
			expected.forEach((n, i) => assert.ok(out[k][i].toLowerCase().includes(n.toLowerCase()), `${k}[${i}] should contain "${n}", got "${out[k][i].slice(0, 80)}"`));
		}
		assert.equal(total, sum, 'no ref-item outside the sections');
	});
}

test('every ref-item has a helper (details data-testid=help)', async () => {
	const ctx = await browser.newContext();
	const p = await ctx.newPage();
	await p.goto(`${BASE}/reference`);
	const n = await p.locator('[data-testid="ref-item"]').count();
	assert.ok(n > 500);
	const without = await p.locator('[data-testid="ref-item"]').evaluateAll((els) => els.filter((e) => !e.querySelector('details[data-testid="help"]')).length);
	assert.equal(without, 0, 'items without helper');
	await ctx.close();
});

test('helpers open and explain the element with lang="en" SRD text; summary is at least 44x44', async () => {
	for (const lang of ['en', 'fr']) {
		const ctx = await browser.newContext();
		await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
		const p = await ctx.newPage();
		await p.goto(`${BASE}/reference?kind=weapons&q=sword`);
		const item = p.locator('[data-testid="ref-item"]').first();
		const sum = item.locator('details[data-testid="help"] > summary');
		const box = await sum.boundingBox();
		assert.ok(box.width >= 44 && box.height >= 44, `${lang} summary ${box.width}x${box.height}`);
		await sum.click();
		assert.equal(await item.locator('details[data-testid="help"]').evaluate((d) => d.open), true);
		const en = await item.locator('details[data-testid="help"] [lang="en"]').first().innerText();
		assert.ok(en.trim().length > 5, 'English SRD text in a lang="en" block');
		await ctx.close();
	}
});

test('no horizontal overflow at 360px', async () => {
	const ctx = await browser.newContext({ viewport: { width: 360, height: 700 } });
	const p = await ctx.newPage();
	await p.goto(`${BASE}/reference`);
	assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
	await ctx.close();
});

test('?kind= keeps only that kind', async () => {
	for (const k of ['weapons', 'domains', 'rules']) {
		const { out } = await items(`?kind=${k}`);
		assert.equal(out[k].length, (await names(k, 'en')).length, k);
		for (const o of KINDS.filter((x) => x !== k)) assert.equal(out[o].length, 0, `${o} should be empty when kind=${k}`);
	}
});

test('/reference?kind=weapons&q=sword lists only weapons whose name contains "sword" (case-insensitive)', async () => {
	const all = await names('weapons', 'en');
	const frAll = await names('weapons', 'fr');
	const idx = all.map((_, i) => i).filter((i) => all[i].toLowerCase().includes('sword') || frAll[i].toLowerCase().includes('sword'));
	assert.ok(idx.length > 0);
	for (const q of ['sword', 'SwOrD']) {
		const { out, total } = await items(`?kind=weapons&q=${q}`);
		assert.equal(out.weapons.length, idx.length, q);
		assert.equal(total, idx.length);
		idx.forEach((i, j) => assert.ok(out.weapons[j].toLowerCase().includes(all[i].toLowerCase())));
	}
});

// us-209: the French name is matched only when the page is French; an English page matches English names only.
test('q matches the French name too when the page is French', async () => {
	const all = await names('weapons', 'en');
	const frAll = await names('weapons', 'fr');
	const i = frAll.findIndex((n, j) => n !== all[j] && n.length > 3);
	assert.ok(i >= 0, 'a weapon with a distinct French name');
	const q = frAll[i].toLowerCase();
	const wantedBy = {
		fr: all.filter((n, j) => n.toLowerCase().includes(q) || frAll[j].toLowerCase().includes(q)).length,
		en: all.filter((n) => n.toLowerCase().includes(q)).length
	};
	for (const lang of ['en', 'fr']) {
		const { out } = await items(`?kind=weapons&q=${encodeURIComponent(q.toUpperCase())}`, lang);
		assert.equal(out.weapons.length, wantedBy[lang], `lang ${lang}`);
	}
	assert.ok(wantedBy.fr >= 1);
	// and the English name matches while the page is French
	const { out } = await items(`?kind=weapons&q=${encodeURIComponent(all[i])}`, 'fr');
	assert.ok(out.weapons.length >= 1);
});

test('q without kind searches every kind; no match lists nothing', async () => {
	const { out } = await items('?q=a');
	assert.ok(out.classes.length > 0 && out.weapons.length > 0 && out['domain-cards'].length > 0);
	const none = await items('?q=zzqqxxnotanelement');
	assert.equal(none.total, 0);
	const both = await items('?kind=classes&q=zzqqxxnotanelement');
	assert.equal(both.total, 0);
});

test('the page has a GET form with kind and q fields', async () => {
	const ctx = await browser.newContext();
	const p = await ctx.newPage();
	await p.goto(`${BASE}/reference`);
	const form = p.locator('form[method="get" i]').filter({ has: p.locator('[name="q"]') });
	assert.equal(await form.count(), 1);
	assert.equal(await form.locator('[name="kind"]').count() > 0, true);
	await form.locator('[name="kind"]').first().selectOption?.('weapons').catch(() => {});
	await ctx.close();
});

test('every page header links to /reference', async () => {
	for (const lang of ['en', 'fr']) {
		for (const path of ['/', `/campaigns/${camp}`, `/characters/${ch}`, '/reference']) {
			const ctx = await browser.newContext();
			await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
			const p = await ctx.newPage();
			await p.goto(BASE + path);
			const link = p.locator('header a[href="/reference"]');
			assert.ok((await link.count()) >= 1, `${lang} ${path}: no header link`);
			await ctx.close();
		}
	}
});

test('the page is served in the page language (html lang)', async () => {
	assert.match(decode(await page('', 'fr')), /<html[^>]*lang="fr"/);
	assert.match(await page('', 'en'), /<html[^>]*lang="en"/);
});
