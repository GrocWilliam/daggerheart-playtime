import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage, openPageIn, headerEdges, headerJustifyContent, headerLayout, headerHeight, horizontalOverflow, homeAccessibleName } from '../support/header.mjs';
import { homeUrl, runStepUrl, sheetUrl } from '../support/pages.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';

const BASE = process.env.BASE_URL;
const LANGS = ['en', 'fr'];
const PAGES = ['home', 'reference', 'run', 'sheet'];

// Left edges (px) recorded on main at 99e1db4 before this story, per viewport width and language.
// nav-reference is further right on Home, where the current nav-home link is bold.
const MAIN = {};
const rec = (w, sigil, home, ref, refHome, sw) => {
	for (const lang of LANGS) MAIN[`${w}-${lang}`] = {
		sigil, 'nav-home': home, 'nav-reference': { home: refHome, reference: ref, run: ref, sheet: ref },
		'language-switcher': sw[lang]
	};
};
rec(768, 24, 64, 211.921875, 226.34375, { en: 645.84375, fr: 645.390625 });
rec(1024, 24, 64, 211.921875, 226.34375, { en: 901.84375, fr: 901.390625 });
rec(1180, 38, 78, 225.921875, 240.34375, { en: 1043.84375, fr: 1043.390625 });

let browser, urls;
before(async () => {
	browser = await launchBrowser();
	const campaignId = await createCampaign(BASE, 'Headcamp');
	const characterId = await createCharacter(BASE, campaignId, 'Alyndra');
	urls = { home: homeUrl(BASE), reference: `${BASE}/reference`, run: runStepUrl(BASE, campaignId), sheet: sheetUrl(BASE, characterId) };
});
after(async () => { await browser?.close(); });

const withPage = async (url, vp, lang, fn) => {
	const page = await openPageIn(browser, url, vp, lang);
	try { await fn(page); } finally { await closePage(page); }
};

test('below 768px the nav sits right after the sigil, left-aligned, on every page in en and fr', async () => {
	for (const name of PAGES) for (const lang of LANGS)
		await withPage(urls[name], [375, 812], lang, async (page) => {
			const e = await headerEdges(page);
			const what = `${name} ${lang} ${JSON.stringify(e)}`;
			assert.ok(e['nav-home'].left >= e.sigil.right - 0.01, `home after sigil: ${what}`);
			assert.ok(e['nav-home'].left - e.sigil.right <= 16, `home within 16px of sigil: ${what}`);
			assert.ok(e['nav-reference'].left >= e['nav-home'].right - 0.01, `reference after home: ${what}`);
			assert.ok(e['nav-reference'].left - e['nav-home'].right <= 16, `reference within 16px of home: ${what}`);
		});
});

test('at 375px the switcher stays at the right end, the header is at most 60px tall, no sideways scroll (also at 360px)', async () => {
	for (const name of PAGES) for (const lang of LANGS) {
		await withPage(urls[name], [375, 812], lang, async (page) => {
			const l = await headerLayout(page);
			const what = `${name} ${lang} ${JSON.stringify(l)}`;
			assert.ok(Math.abs(l.switcherRight - l.contentRight) <= 1, what);
			assert.ok(await headerHeight(page) <= 60, what);
			const o = await horizontalOverflow(page);
			assert.ok(o.scrollWidth <= o.clientWidth, what + JSON.stringify(o));
		});
		await withPage(urls[name], [360, 740], lang, async (page) => {
			const o = await horizontalOverflow(page);
			assert.ok(o.scrollWidth <= o.clientWidth, `360 ${name} ${lang} ${JSON.stringify(o)}`);
		});
	}
});

test('at 375px nav-home is at least 44x44px and named "Daggerheart Playtime" in both languages', async () => {
	for (const lang of LANGS)
		await withPage(urls.home, [375, 812], lang, async (page) => {
			assert.equal(await homeAccessibleName(page), 'Daggerheart Playtime', lang);
			const b = await page.getByTestId('nav-home').boundingBox();
			assert.ok(b.width >= 43.99 && b.height >= 43.99, `${lang} ${JSON.stringify(b)}`);
		});
});

test('from 768px the left edges of sigil, nav-home, nav-reference and language-switcher match main', async () => {
	for (const w of [768, 1024, 1180]) for (const name of PAGES) for (const lang of LANGS)
		await withPage(urls[name], [w, w === 768 ? 1024 : w === 1024 ? 768 : 820], lang, async (page) => {
			const e = await headerEdges(page);
			const want = MAIN[`${w}-${lang}`];
			for (const id of ['sigil', 'nav-home', 'nav-reference', 'language-switcher']) {
				const exp = id === 'nav-reference' ? want[id][name] : want[id];
				assert.ok(Math.abs(e[id].left - exp) <= 1, `${w} ${name} ${lang} ${id}: ${e[id].left} vs ${exp}`);
			}
		});
});

test('below 768px the header no longer spreads its items with justify-between', async () => {
	for (const lang of LANGS)
		await withPage(urls.home, [375, 812], lang, async (page) => {
			const j = await headerJustifyContent(page);
			assert.notEqual(j, 'space-between', `${lang} ${j}`);
		});
});
