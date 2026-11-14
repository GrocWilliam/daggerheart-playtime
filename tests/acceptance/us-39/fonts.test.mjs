import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const VIEWPORTS = [['phone', 375, 667], ['desktop', 1280, 800]];
const LANGS = ['en', 'fr'];

async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
	});
	const json = res.status === 204 ? null : await res.json();
	assert.ok(res.status < 300, `${method} ${path}: ${res.status}`);
	return json;
}

let browser, campaignPath, chars = [];
before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Fonts campaign' });
	await api('POST', `/api/campaigns/${camp.id}/fear`, { delta: 3 });
	for (let i = 0; i < 3; i++) {
		const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
			name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
			severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
		});
		await api('PUT', `/api/characters/${ch.id}/conditions`, {
			vulnerable: i === 0, restrained: i === 1, hidden: i === 2
		});
		if (i === 0) await api('POST', `/api/characters/${ch.id}/hp`, { delta: 6 });
		await api('POST', `/api/characters/${ch.id}/items`, { name: `Item ${i}`, quantity: 2 });
		chars.push(ch.id);
	}
	campaignPath = `/campaigns/${camp.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function withPage(path, w, h, lang, fn) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	const requests = [];
	page.on('request', (r) => requests.push(r.url()));
	try {
		await page.goto(BASE + path, { waitUntil: 'networkidle' });
		return await fn(page, requests);
	} finally { await ctx.close(); }
}
const pages = () => [['/', 'home'], [campaignPath, 'campaign'], [`/characters/${chars[0]}`, 'character']];
async function eachCombo(fn) {
	for (const [path, name] of pages())
		for (const [vp, w, h] of VIEWPORTS)
			for (const lang of LANGS)
				await withPage(path, w, h, lang, (page, reqs) => fn(page, `${name} ${vp} ${lang}`, reqs));
}

test('headings (h1, h2, h3) and character-name use Cinzel 700, then serif', async () => {
	await eachCombo(async (page, id) => {
		const els = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, [data-testid="character-name"]')].map((e) => {
			const c = getComputedStyle(e); return [e.tagName, e.dataset.testid ?? '', c.fontFamily, c.fontWeight];
		}));
		assert.ok(els.length > 0, id);
		for (const [tag, tid, fam, wt] of els) {
			assert.match(fam, /^"?Cinzel"?\s*,.*\bserif$/, `${id} ${tag} ${tid}: ${fam}`);
			assert.ok(!/EB Garamond/.test(fam), id);
			assert.equal(wt, '700', `${id} ${tag} ${tid}`);
		}
	});
	// the character-name link exists on the campaign page
	await withPage(campaignPath, 1280, 800, 'en', async (page) => {
		assert.equal(await page.locator('[data-testid="character-name"]').count(), 3);
	});
});

test('all other text uses EB Garamond, then serif', async () => {
	await eachCombo(async (page, id) => {
		const bad = await page.evaluate(() => {
			const out = []; let n = 0;
			for (const e of document.body.querySelectorAll('*')) {
				if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(e.tagName)) continue;
				if (e.closest('h1, h2, h3, [data-testid="character-name"], [data-testid="campaign-name"]')) continue;
				if (e.matches('[data-testid="ref-item"] > span:first-child')) continue;
				const own = [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim());
				const control = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(e.tagName);
				if (!own && !control) continue;
				n++;
				const f = getComputedStyle(e).fontFamily;
				if (!/^"EB Garamond"\s*,.*\bserif$/.test(f)) out.push(`${e.tagName}: ${f}`);
			}
			if (n === 0) out.push('no text elements found');
			return out;
		});
		assert.deepEqual(bad, [], id);
	});
});

test('fonts are npm dependencies imported in the root layout', () => {
	const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
	assert.ok(pkg.dependencies?.['@fontsource/cinzel'], 'dependency @fontsource/cinzel');
	assert.ok(pkg.dependencies?.['@fontsource/eb-garamond'], 'dependency @fontsource/eb-garamond');
	const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
	assert.match(layout, /import\s+['"]@fontsource\/cinzel[^'"]*['"]/);
	assert.match(layout, /import\s+['"]@fontsource\/eb-garamond[^'"]*['"]/);
});

test('offline: nothing is requested outside the app origin; font files come from the app', async () => {
	await eachCombo(async (page, id, reqs) => {
		const external = reqs.filter((u) => !/^(data|blob|about):/.test(u) && new URL(u).origin !== ORIGIN);
		assert.deepEqual(external, [], id);
		assert.ok(reqs.some((u) => u.startsWith(ORIGIN) && /\.woff2?(\?|$)/.test(u)), `${id}: a font file is served by the app`);
	});
});

test('offline: fonts are loaded after document.fonts.ready', async () => {
	await eachCombo(async (page, id) => {
		const r = await page.evaluate(async () => {
			await document.fonts.ready;
			const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '') + ' ' + f.weight);
			return {
				cinzel: document.fonts.check('700 16px Cinzel'),
				garamond: document.fonts.check('16px "EB Garamond"'),
				loaded
			};
		});
		assert.equal(r.cinzel, true, id);
		assert.equal(r.garamond, true, id);
		assert.ok(r.loaded.some((l) => l.startsWith('Cinzel')), `${id} Cinzel loaded: ${r.loaded}`);
		assert.ok(r.loaded.some((l) => l.startsWith('EB Garamond')), `${id} EB Garamond loaded: ${r.loaded}`);
	});
});
