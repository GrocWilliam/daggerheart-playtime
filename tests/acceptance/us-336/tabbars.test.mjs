import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { sheetUrl } from '../support/pages.mjs';
import { linkLook, barLook, pageScrolls, clickTab } from '../support/tabbars.mjs';

const BASE = process.env.BASE_URL;
const VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];
const LANGS = ['en', 'fr'];
const ACCENT = 'rgb(212, 160, 80)', BG_TEXT = 'rgb(15, 26, 21)', MUTED = 'rgb(185, 176, 143)', TRANSPARENT = 'rgba(0, 0, 0, 0)';
const TABS = ['play', 'traits', 'gear', 'cards', 'notes'];

let browser, campaign, character;
before(async () => {
	browser = await launchBrowser();
	campaign = await createCampaign(BASE, 'Tab bars');
	character = await createCharacter(BASE, campaign, 'Tabitha');
});
after(async () => { await browser?.close(); });

const open = async (url, vp, lang) => {
	const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(10000);
	await page.goto(url);
	await page.waitForLoadState('networkidle');
	return page;
};

for (const vp of VIEWPORTS) for (const lang of LANGS) {
	for (const step of ['build', 'run']) {
		test(`step switch at ${vp.join('x')} in ${lang}, ?step=${step}: current link accent-filled, other muted`, async () => {
			const page = await open(`${BASE}/campaigns/${campaign}?step=${step}`, vp, lang);
			const other = step === 'build' ? 'run' : 'build';
			const cur = await linkLook(page, `step-${step}`);
			assert.equal(cur.current, 'step');
			assert.equal(cur.bg, ACCENT);
			assert.equal(cur.color, BG_TEXT);
			assert.equal(cur.deco, 'none');
			assert.ok(cur.weight >= 700);
			assert.ok(cur.height >= 44, `height ${cur.height}`);
			const oth = await linkLook(page, `step-${other}`);
			assert.equal(oth.current, null);
			assert.equal(oth.color, MUTED);
			assert.equal(oth.bg, TRANSPARENT);
			assert.equal(oth.deco, 'none');
			assert.ok(oth.height >= 44, `height ${oth.height}`);
			await closePage(page);
		});
	}

	test(`sheet tabs at ${vp.join('x')} in ${lang}, ?tab=gear: gear current, others muted`, async () => {
		const page = await open(sheetUrl(BASE, character, 'gear'), vp, lang);
		const cur = await linkLook(page, 'tab-gear');
		assert.equal(cur.current, 'page');
		assert.equal(cur.bg, ACCENT);
		assert.equal(cur.color, BG_TEXT);
		assert.equal(cur.deco, 'none');
		assert.ok(cur.height >= 44, `height ${cur.height}`);
		for (const k of TABS.filter((k) => k !== 'gear')) {
			const l = await linkLook(page, `tab-${k}`);
			assert.equal(l.current, null, k);
			assert.equal(l.color, MUTED, k);
			assert.equal(l.bg, TRANSPARENT, k);
			assert.equal(l.deco, 'none', k);
			assert.ok(l.height >= 44, `${k} height ${l.height}`);
		}
		await closePage(page);
	});
}

test('both tab bars sit on a 1px solid border line painted accent at about 35% alpha', async () => {
	const check = (b, what) => {
		assert.equal(b.width, '1px', what);
		assert.equal(b.style, 'solid', what);
		const [r, g, bl, a] = b.pixel;
		assert.ok(Math.abs(r - 212) <= 2 && Math.abs(g - 160) <= 2 && Math.abs(bl - 80) <= 2 && Math.abs(a - 89) <= 3, `${what} pixel ${b.pixel}`);
	};
	const p1 = await open(`${BASE}/campaigns/${campaign}?step=run`, [1024, 768], 'en');
	check(await barLook(p1, 'step-run'), 'step switch');
	await closePage(p1);
	const p2 = await open(sheetUrl(BASE, character, 'play'), [1024, 768], 'en');
	check(await barLook(p2, 'tab-play'), 'sheet-tabs');
	await closePage(p2);
});

test('at 375x812 in French sheet-tabs fits on one row or scrolls inside itself, and the page never scrolls sideways', async () => {
	const page = await open(sheetUrl(BASE, character, 'play'), [375, 812], 'fr');
	const tops = [];
	for (const k of TABS) tops.push((await linkLook(page, `tab-${k}`)).top);
	const oneRow = tops.every((t) => Math.abs(t - tops[0]) <= 2);
	if (!oneRow) {
		const bar = await barLook(page, 'tab-play');
		assert.equal(bar.overflowX, 'auto');
		assert.ok(bar.scrollWidth > bar.clientWidth, `scrollWidth ${bar.scrollWidth} clientWidth ${bar.clientWidth}`);
	}
	const { scroll, client } = await pageScrolls(page);
	assert.ok(scroll <= client, `page scrollWidth ${scroll} > ${client}`);
	await closePage(page);
});

test('without JavaScript, clicking tab-traits loads ?tab=traits with tab-traits current', async () => {
	const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(10000);
	await page.goto(sheetUrl(BASE, character, 'play'));
	await clickTab(page, 'traits');
	await page.waitForURL((u) => u.searchParams.get('tab') === 'traits');
	assert.equal(await page.getByTestId('tab-traits').getAttribute('aria-current'), 'page');
	await ctx.close();
});
