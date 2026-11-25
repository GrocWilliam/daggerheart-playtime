import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter, addManyJournalEntries } from '../support/api.mjs';
import { runStepUrl, sheetUrl } from '../support/pages.mjs';
import {
	LANGS, BAND_VIEWPORTS, addFear, fearBandRead, labelColumnWidth, scrollRunDown, fearBandSticky, fearPlusButton,
	fearButtonSizes, fearValue, scrollOverflow, leftEdges, sheetTrackers, runCard
} from '../support/trackers.mjs';

const BASE = process.env.BASE_URL;
let browser, camp, firstChar;
before(async () => {
	browser = await launchBrowser();
	camp = await createCampaign(BASE, 'Sticky camp');
	firstChar = await createCharacter(BASE, camp, 'Aster');
	await createCharacter(BASE, camp, 'Briar');
	await createCharacter(BASE, camp, 'Cyra');
	await addFear(BASE, camp, 5);
	await addManyJournalEntries(BASE, camp, 30); // makes the Run step tall enough to scroll at every width
});
after(async () => { await browser?.close(); });

const within = (xs, tol, msg) => assert.ok(Math.max(...xs) - Math.min(...xs) <= tol, `${msg}: ${xs.join(', ')}`);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

for (const lang of LANGS) for (const vp of BAND_VIEWPORTS) {
	test(`the Fear band is one row and as wide as run (${lang} ${vp.join('x')})`, async () => {
		const p = await openPage(browser, runStepUrl(BASE, camp), vp, { lang });
		const g = await fearBandRead(p);
		assert.equal(g.pipCount, 12);
		within(g.centres, 6, 'label, −, value, + and pips centres');
		near(g.width, g.runWidth, 2, 'band width vs run');
		await closePage(p);
	});
}

test('at 375x812 the band is at most 60px tall, pips 10px 2px apart, label column under 96px', async () => {
	const p = await openPage(browser, runStepUrl(BASE, camp), [375, 812]);
	const g = await fearBandRead(p);
	assert.ok(g.height <= 60, `height ${g.height}`);
	for (const [w, h] of g.pipSizes) { near(w, 10, 0.5, 'pip width'); near(h, 10, 0.5, 'pip height'); }
	for (const gap of g.pipGaps) near(gap, 2, 0.5, 'pip gap');
	assert.ok(g.labelColumn < 96, `label column ${g.labelColumn}`);
	await closePage(p);
});

for (const vp of [[768, 1024], [1024, 768]]) {
	test(`at ${vp.join('x')} Fear pips are 20px and the label column is 6rem`, async () => {
		const p = await openPage(browser, runStepUrl(BASE, camp), vp);
		const g = await fearBandRead(p);
		for (const [w, h] of g.pipSizes) { near(w, 20, 0.5, 'pip width'); near(h, 20, 0.5, 'pip height'); }
		// The label column is the first cell of the form: 96px wide (the − button starts after it and the grid gap).
		near(g.labelColumn, 96, 2, 'label column');
		await closePage(p);
	});
}

for (const vp of [[375, 812], [1280, 900]]) {
	test(`scrolled down by 600px at ${vp.join('x')} the Fear band stays at the top, readable, on the surface colour`, async () => {
		const p = await openPage(browser, runStepUrl(BASE, camp), vp);
		const y = await scrollRunDown(p);
		assert.ok(y >= 599, `scrolled ${y}`);
		const s = await fearBandSticky(p);
		near(s.top, 0, 1, 'band top');
		assert.equal(s.text, '5');
		assert.ok(s.valueOnTop, 'nothing covers the value');
		assert.equal(s.bg, 'rgb(26, 42, 34)');
		await closePage(p);
	});
}

test('scrolled down at 375x812, Fear + gives 6 and the band stays at the top', async () => {
	const c = await createCampaign(BASE, 'Sticky plus');
	await createCharacter(BASE, c, 'Dax');
	await addFear(BASE, c, 5);
	await addManyJournalEntries(BASE, c, 30);
	const p = await openPage(browser, runStepUrl(BASE, c), [375, 812]);
	await scrollRunDown(p);
	await fearPlusButton(p).click();
	await p.waitForFunction(() => document.querySelector('[data-testid=fear]').textContent.trim() === '6');
	assert.equal(await fearValue(p), '6');
	near((await fearBandSticky(p)).top, 0, 1, 'band top');
	await closePage(p);
});

test('at 375x812 without JavaScript, Fear + reloads the Run step with Fear 6', async () => {
	const c = await createCampaign(BASE, 'Sticky nojs');
	await createCharacter(BASE, c, 'Eli');
	await addFear(BASE, c, 5);
	const p = await openPage(browser, runStepUrl(BASE, c), [375, 812], { js: false });
	assert.equal(await fearValue(p), '5');
	await Promise.all([p.waitForLoadState('load'), fearPlusButton(p).click()]);
	await p.waitForFunction(() => document.querySelector('[data-testid=fear]')?.textContent.trim() === '6');
	assert.equal(await fearValue(p), '6');
	assert.equal(await p.locator('[data-testid="run"]').count(), 1);
	await closePage(p);
});

test('at 375x812 the Fear −, + and label are at least 44x44 and the page does not scroll sideways', async () => {
	const p = await openPage(browser, runStepUrl(BASE, camp), [375, 812]);
	const s = await fearButtonSizes(p);
	for (const [n, b] of Object.entries(s)) assert.ok(b.w >= 43.5 && b.h >= 43.5, `${n}: ${b.w}x${b.h}`);
	assert.ok((await scrollOverflow(p)) <= 0, 'sideways scroll');
	await closePage(p);
});

for (const vp of [[375, 812], [1024, 768]]) {
	test(`row trackers of the sheet and a Run card keep a 96px label column and pips below − (${vp.join('x')})`, async () => {
		const sheet = await openPage(browser, sheetUrl(BASE, firstChar, 'play'), vp);
		const run = await openPage(browser, runStepUrl(BASE, camp), vp);
		for (const [page, scope] of [[sheet, sheetTrackers(sheet)], [run, runCard(run, 0)]]) {
			for (const n of ['hp', 'stress', 'hope', 'armor']) near(await labelColumnWidth(page, n, scope), 96, 2, `${n} label column`);
			const e = await leftEdges(scope);
			assert.deepEqual(e.below, [true, true, true, true], 'pips below the − button');
		}
		await closePage(sheet); await closePage(run);
	});
}

test('Pips.svelte accepts size band and no longer lg', () => {
	const src = readFileSync(new URL('../../../src/lib/components/Pips.svelte', import.meta.url), 'utf8');
	assert.match(src, /'band'/);
	assert.doesNotMatch(src, /'lg'/);
});
