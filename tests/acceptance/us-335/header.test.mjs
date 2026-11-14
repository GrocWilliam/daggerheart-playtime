import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage, openPageIn, headerLayout, headerHeight, horizontalOverflow, homeAccessibleName, languageButton, switchLanguage, htmlLang } from '../support/header.mjs';
import { homeUrl, runStepUrl, sheetUrl } from '../support/pages.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';

const BASE = process.env.BASE_URL;
const VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];
const LANGS = ['en', 'fr'];
const ACCENT = 'rgb(212, 160, 80)', BG = 'rgb(15, 26, 21)', TEXT = 'rgb(239, 228, 200)', TRANSPARENT = 'rgba(0, 0, 0, 0)';

let browser, urls;
before(async () => {
	browser = await launchBrowser();
	const campaignId = await createCampaign(BASE, 'Headcamp');
	const characterId = await createCharacter(BASE, campaignId, 'Alyndra');
	urls = [homeUrl(BASE), `${BASE}/reference`, runStepUrl(BASE, campaignId), sheetUrl(BASE, characterId)];
});
after(async () => { await browser?.close(); });

const withPage = async (url, vp, lang, fn) => {
	const page = await openPageIn(browser, url, vp, lang);
	try { await fn(page); } finally { await closePage(page); }
};

test('the header is one row: sigil, nav-home, nav-reference and language-switcher aligned, switcher at the right end', async () => {
	for (const url of urls) for (const vp of VIEWPORTS) for (const lang of LANGS)
		await withPage(url, vp, lang, async (page) => {
			const l = await headerLayout(page);
			const cs = Object.values(l.centres);
			const what = `${url} ${vp} ${lang} ${JSON.stringify(l)}`;
			assert.ok(Math.max(...cs) - Math.min(...cs) <= 8, what);
			assert.ok(Math.abs(l.switcherRight - l.contentRight) <= 1, what);
		});
});

test('at 375px the header is at most 60px tall with no sideways scroll; also no scroll at 360px', async () => {
	for (const lang of LANGS) {
		await withPage(homeUrl(BASE), [375, 812], lang, async (page) => {
			assert.ok(await headerHeight(page) <= 60, `${lang} ${await headerHeight(page)}`);
			const o = await horizontalOverflow(page);
			assert.ok(o.scrollWidth <= o.clientWidth, JSON.stringify(o));
		});
		await withPage(homeUrl(BASE), [360, 740], lang, async (page) => {
			const o = await horizontalOverflow(page);
			assert.ok(o.scrollWidth <= o.clientWidth, `360 ${lang} ${JSON.stringify(o)}`);
		});
	}
});

test('at 375px nav-home keeps its accessible name and is at least 44x44px', async () => {
	for (const lang of LANGS)
		await withPage(homeUrl(BASE), [375, 812], lang, async (page) => {
			assert.equal(await homeAccessibleName(page), 'Daggerheart Playtime', lang);
			const b = await page.getByTestId('nav-home').boundingBox();
			assert.ok(b.width >= 43.99 && b.height >= 43.99, `${lang} ${JSON.stringify(b)}`);
		});
});

test('the language buttons show EN/FR, full-name aria-label, own lang, pressed state and variant look', async () => {
	const want = {
		en: { text: 'EN', ariaLabel: 'English', lang: 'en' },
		fr: { text: 'FR', ariaLabel: 'Français', lang: 'fr' }
	};
	for (const url of urls) for (const current of LANGS)
		await withPage(url, [1024, 768], current, async (page) => {
			for (const code of LANGS) {
				const b = await languageButton(page, code);
				const on = code === current;
				const what = `${url} ${current} ${code} ${JSON.stringify(b)}`;
				assert.equal(b.text, want[code].text, what);
				assert.equal(b.ariaLabel, want[code].ariaLabel, what);
				assert.equal(b.lang, want[code].lang, what);
				assert.equal(b.pressed, String(on), what);
				assert.ok(b.classes.includes(on ? 'btn-primary' : 'btn-ghost'), what);
				assert.ok(!b.classes.includes(on ? 'btn-ghost' : 'btn-primary'), what);
				assert.equal(b.background, on ? ACCENT : TRANSPARENT, what);
				assert.equal(b.color, on ? BG : TEXT, what);
			}
		});
});

test('the current language button is bold and the other normal weight', async () => {
	for (const current of LANGS)
		await withPage(homeUrl(BASE), [1024, 768], current, async (page) => {
			const w = (code) => page.getByTestId(`lang-${code}`).evaluate((e) => Number(getComputedStyle(e).fontWeight));
			const other = current === 'en' ? 'fr' : 'en';
			assert.ok(await w(current) >= 700, current);
			assert.ok(await w(other) <= 400, current);
		});
});

test('the language buttons are at least 44x44px and 8px apart', async () => {
	for (const url of urls) for (const vp of VIEWPORTS) for (const lang of LANGS)
		await withPage(url, vp, lang, async (page) => {
			const [en, fr] = [await languageButton(page, 'en'), await languageButton(page, 'fr')];
			const what = `${url} ${vp} ${lang} ${JSON.stringify([en, fr])}`;
			for (const b of [en, fr]) assert.ok(b.width >= 43.99 && b.height >= 43.99, what);
			const gap = Math.max(fr.left - en.right, en.left - fr.right);
			assert.ok(gap >= 7.99, what);
		});
});

test('clicking lang-fr on an English page reloads in French with lang-fr pressed', async () => {
	await withPage(homeUrl(BASE), [1024, 768], 'en', async (page) => {
		await switchLanguage(page, 'fr');
		assert.equal(await htmlLang(page), 'fr');
		assert.equal((await languageButton(page, 'fr')).pressed, 'true');
		assert.equal((await languageButton(page, 'en')).pressed, 'false');
	});
});
