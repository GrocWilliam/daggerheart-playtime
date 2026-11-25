import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { runStepUrl, sheetUrl } from '../support/pages.mjs';
import { LANGS, TRACKER_NAMES, addFear, leftEdges, sheetTrackers, runCard, rowCentres, pipTops, stepperSizes, scrollOverflow, fearGeometry, cardHeights, clickPlus, hpText } from '../support/trackers.mjs';

const BASE = process.env.BASE_URL;
let browser, camp, a, b, big, bigCamp, fearCamp, cardCamp, hpChar;
before(async () => {
	browser = await launchBrowser();
	camp = await createCampaign(BASE, 'Pips camp');
	a = await createCharacter(BASE, camp, 'Aster');
	b = await createCharacter(BASE, camp, 'Briar');
	bigCamp = await createCampaign(BASE, 'Big camp');
	big = await createCharacter(BASE, bigCamp, 'Giant', { maxHp: 12, maxStress: 12, armorSlots: 12 });
	await createCharacter(BASE, bigCamp, 'Titan', { maxHp: 12, maxStress: 12, armorSlots: 12 });
	fearCamp = await createCampaign(BASE, 'Fear382');
	await createCharacter(BASE, fearCamp, 'Cyra');
	await addFear(BASE, fearCamp, 1);
	cardCamp = await createCampaign(BASE, 'Cards382');
	for (const n of ['Una', 'Dua', 'Tria']) await createCharacter(BASE, cardCamp, n);
	hpChar = await createCharacter(BASE, camp, 'Hopper');
});
after(async () => { await browser?.close(); });

const within = (xs, tol, msg) => assert.ok(Math.max(...xs) - Math.min(...xs) <= tol, `${msg}: ${xs.join(', ')}`);

test('sheet at 1024x768: label, −, value and + share a centre and the pips are below the − button', async () => {
	const p = await openPage(browser, sheetUrl(BASE, a, 'play'), [1024, 768]);
	const e = await leftEdges(sheetTrackers(p));
	assert.deepEqual(e.below, [true, true, true, true]);
	for (const n of TRACKER_NAMES) within(await rowCentres(p, n, sheetTrackers(p)), 4, `${n} centres`);
	await closePage(p);
});

test('Run step at 1024x768: in each card the pips are below the − button and the row shares a centre', async () => {
	const p = await openPage(browser, runStepUrl(BASE, camp), [1024, 768]);
	for (const i of [0, 1]) {
		const e = await leftEdges(runCard(p, i));
		assert.deepEqual(e.below, [true, true, true, true], `card ${i}`);
		for (const n of TRACKER_NAMES) within(await rowCentres(p, n, runCard(p, i)), 4, `card ${i} ${n} centres`);
	}
	await closePage(p);
});

for (const lang of LANGS) for (const vp of [[375, 812], [1024, 768], [1280, 900]]) {
	test(`− buttons, pips and labels share left edges on the sheet and in each card (${lang} ${vp.join('x')})`, async () => {
		let p = await openPage(browser, sheetUrl(BASE, a, 'play'), vp, { lang });
		let e = await leftEdges(sheetTrackers(p));
		within(e.minus, 1, 'sheet − edges');
		within([...e.pips, ...e.labels], 1, 'sheet pips and label edges');
		await closePage(p);
		p = await openPage(browser, runStepUrl(BASE, camp), vp, { lang });
		for (const i of [0, 1]) {
			e = await leftEdges(runCard(p, i));
			within(e.minus, 1, `card ${i} − edges`);
			within([...e.pips, ...e.labels], 1, `card ${i} pips and label edges`);
		}
		await closePage(p);
	});
}

for (const vp of [[375, 812], [1024, 768], [1280, 900]]) {
	test(`12 pips per tracker stay on one line (${vp.join('x')})`, async () => {
		let p = await openPage(browser, sheetUrl(BASE, big, 'play'), vp);
		for (const t of await pipTops(sheetTrackers(p))) {
			assert.ok(t.tops.length >= 6, `${t.name} has pips`);
			within(t.tops, 1, `sheet ${t.name} pip tops`);
		}
		await closePage(p);
		p = await openPage(browser, runStepUrl(BASE, bigCamp), vp);
		for (const i of [0, 1]) for (const t of await pipTops(runCard(p, i))) within(t.tops, 1, `card ${i} ${t.name} pip tops`);
		await closePage(p);
	});
}

test('Fear stays on one line with 20x20 pips', async () => {
	const p = await openPage(browser, runStepUrl(BASE, fearCamp), [1024, 768]);
	const g = await fearGeometry(p);
	within(g.cys, 8, 'fear centres');
	assert.ok(g.pips.length > 0);
	for (const s of g.pips) assert.deepEqual(s, [20, 20]);
	await closePage(p);
});

test('three cards with no condition are at most 440px tall at 1024x768', async () => {
	const p = await openPage(browser, runStepUrl(BASE, cardCamp), [1024, 768]);
	const hs = await cardHeights(p);
	assert.equal(hs.length, 3);
	for (const h of hs) assert.ok(h <= 440, `height ${h}`);
	await closePage(p);
});

test('no sideways scroll at 375x812 and every − and + is at least 44x44', async () => {
	for (const url of [runStepUrl(BASE, camp), sheetUrl(BASE, a, 'play')]) {
		const p = await openPage(browser, url, [375, 812]);
		assert.ok(await scrollOverflow(p) <= 0, `overflow on ${url}`);
		const scope = url.includes('tab=') ? sheetTrackers(p) : runCard(p, 0);
		for (const s of await stepperSizes(scope)) assert.ok(s.w >= 43.5 && s.h >= 43.5, `${s.name}: ${s.w}x${s.h}`);
		await closePage(p);
	}
});

test('HP at 0 without JavaScript: + reloads showing 1 marked', async () => {
	const p = await openPage(browser, sheetUrl(BASE, hpChar, 'play'), [1024, 768], { js: false });
	assert.match(await hpText(p), /^0\b/);
	await clickPlus(p, 'hp');
	await p.waitForLoadState('load');
	assert.match(await hpText(p), /^1\b/);
	await closePage(p);
});

test('docs/ui.md says 440px, not 360px, and describes the two-line row Tracker and the one-line Fear', () => {
	const d = readFileSync(new URL('../../../docs/ui.md', import.meta.url), 'utf8');
	assert.ok(d.includes('440px'));
	assert.ok(!d.includes('360px'));
	assert.match(d, /row[^\n]*second line|second line[^\n]*pips|pips on a second line/i);
	assert.match(d, /Fear[^\n]*(one line|single line)|(one line|single line)[^\n]*Fear/i);
});
