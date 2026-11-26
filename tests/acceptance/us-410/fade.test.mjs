import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { sheetUrl } from '../support/pages.mjs';
import { sideScroll } from '../support/sheet.mjs';
import * as fade from '../support/tabfade.mjs';

const BASE = process.env.BASE_URL;
const NARROW = [375, 812];
let browser, url;
before(async () => {
	browser = await launchBrowser();
	const campaign = await createCampaign(BASE, 'Fade');
	const character = await createCharacter(BASE, campaign, 'Fadia');
	url = sheetUrl(BASE, character, 'play');
});
after(async () => { await browser?.close(); });

const narrow = async () => {
	const p = await openPage(browser, url, NARROW, { lang: 'fr' });
	const s = await fade.barScrolls(p);
	assert.ok(s.scrollWidth > s.clientWidth, `sheet-tabs must overflow at 375 in French: ${s.scrollWidth} vs ${s.clientWidth}`);
	await p.waitForFunction(() => !!document.querySelector('[data-testid="sheet-tabs"] ~ span[aria-hidden="true"]'), null, { timeout: 2000 }).catch(() => {});
	return p;
};

test('at 375x812 in French with the bar at its start, an aria-hidden 32px fade overlaps its right edge, as tall as the bar, with a gradient to the page background', async () => {
	const p = await narrow();
	assert.equal(await fade.fadeCount(p), 1);
	const bar = await fade.barBox(p);
	const f = await fade.fadeLook(p);
	assert.ok(Math.abs(f.right - bar.right) <= 1, `right ${f.right} vs ${bar.right}`);
	assert.ok(Math.abs(f.width - 32) <= 1, `width ${f.width}`);
	assert.ok(Math.abs(f.height - bar.height) <= 1, `height ${f.height} vs ${bar.height}`);
	assert.match(f.image, /^linear-gradient\(/);
	const bg = await fade.pageBackground(p);
	assert.ok(f.image.trim().endsWith(`${bg})`), `gradient ${f.image} should end in ${bg}`);
	await closePage(p);
});

test('scrolled to its end, the fade is gone within 500ms', async () => {
	const p = await narrow();
	await fade.scrollBarToEnd(p);
	await fade.waitFadeGone(p);
	assert.equal(await fade.fadeCount(p), 0);
	await closePage(p);
});

test('scrolled back to 0 after the end, the fade is present again', async () => {
	const p = await narrow();
	await fade.scrollBarToEnd(p);
	await fade.waitFadeGone(p);
	await fade.scrollBarToStart(p);
	await fade.waitFadePresent(p);
	assert.equal(await fade.fadeCount(p), 1);
	await closePage(p);
});

test('at 1280x900 where sheet-tabs does not overflow, there is no fade', async () => {
	const p = await openPage(browser, url, [1280, 900], { lang: 'fr' });
	const s = await fade.barScrolls(p);
	assert.ok(s.scrollWidth <= s.clientWidth, 'bar should not overflow at 1280');
	assert.equal(await fade.fadeCount(p), 0);
	await closePage(p);
});

test('clicking the visible part of the last tab under the fade navigates to its ?tab= link', async () => {
	const p = await narrow();
	const key = await fade.clickLastTabUnderFade(p);
	assert.ok(key, 'a tab link lies under the fade');
	await p.waitForURL((u) => u.searchParams.get('tab') === key);
	await closePage(p);
});

test('with JavaScript disabled at 375x812 there is no fade and every tab link works', async () => {
	const p = await openPage(browser, url, NARROW, { lang: 'fr', js: false });
	assert.equal(await fade.fadeCount(p), 0);
	const keys = await fade.tabLinkKeys(p);
	assert.ok(keys.length >= 5);
	for (const k of keys) {
		await p.getByTestId(`tab-${k}`).scrollIntoViewIfNeeded();
		await p.getByTestId(`tab-${k}`).click();
		await p.waitForURL((u) => u.searchParams.get('tab') === k);
		assert.equal(await p.getByTestId(`tab-${k}`).getAttribute('aria-current'), 'page');
	}
	assert.equal(await fade.fadeCount(p), 0);
	await closePage(p);
});

test('at 375x812 the page has no horizontal scroll', async () => {
	const p = await narrow();
	assert.ok((await sideScroll(p)) <= 0);
	await closePage(p);
});

test('docs/ui.md tab bar rule mentions the 2rem fade to --bg on the right edge of sheet-tabs while it can scroll further', () => {
	const rule = fade.tabBarRule().find((l) => /fade/i.test(l));
	assert.ok(rule, 'a docs/ui.md line about sheet-tabs mentions the fade');
	assert.match(rule, /2rem/);
	assert.match(rule, /--bg/);
	assert.match(rule, /right/i);
	assert.match(rule, /scroll/i);
});
