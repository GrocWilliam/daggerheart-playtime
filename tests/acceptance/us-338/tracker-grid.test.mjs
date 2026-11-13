import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { runStepUrl, sheetUrl } from '../support/pages.mjs';
import { VIEWPORTS, LANGS, TRACKER_NAMES, addFear, leftEdges, sheetTrackers, runCard, rowGeometry, stepperLooks, fearBand, fearValue, clickPlus, hpText } from '../support/trackers.mjs';

const BASE = process.env.BASE_URL;
let browser, camp, a, b, fearCamp, fearChar;
before(async () => {
	browser = await launchBrowser();
	camp = await createCampaign(BASE, 'Grid camp');
	a = await createCharacter(BASE, camp, 'Aster');
	b = await createCharacter(BASE, camp, 'Briar');
	fearCamp = await createCampaign(BASE, 'Fear camp');
	fearChar = await createCharacter(BASE, fearCamp, 'Cyra');
	await addFear(BASE, fearCamp, 1);
});
after(async () => { await browser?.close(); });

const within = (xs, tol, msg) => assert.ok(Math.max(...xs) - Math.min(...xs) <= tol, `${msg}: ${xs.join(', ')}`);

for (const lang of LANGS) for (const vp of VIEWPORTS) {
	test(`sheet trackers: − buttons and pips are aligned (${lang} ${vp.join('x')})`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, a, 'play'), vp, { lang });
		const e = await leftEdges(sheetTrackers(p));
		within(e.minus, 1, '− left edges');
		within(e.pips, 1, 'pips left edges');
		await closePage(p);
	});
	test(`run cards: − buttons and pips are aligned in each card (${lang} ${vp.join('x')})`, async () => {
		const p = await openPage(browser, runStepUrl(BASE, camp), vp, { lang });
		for (const i of [0, 1]) {
			const e = await leftEdges(runCard(p, i));
			within(e.minus, 1, `card ${i} − left edges`);
			within(e.pips, 1, `card ${i} pips left edges`);
		}
		await closePage(p);
	});
}

test('a tracker\'s −, value and + share a vertical centre and the value sits between them', async () => {
	const p = await openPage(browser, sheetUrl(BASE, a, 'play'), [1024, 768]);
	for (const n of TRACKER_NAMES) {
		const g = await rowGeometry(p, n, sheetTrackers(p));
		within([g.minus.cy, g.value.cy, g.plus.cy], 4, `${n} centres`);
		assert.ok(g.minus.right <= g.value.left + 1 && g.value.right <= g.plus.left + 1, `${n}: value between − and +`);
	}
	const run = await openPage(browser, runStepUrl(BASE, camp), [375, 812]);
	const g = await rowGeometry(run, 'fear');
	within([g.minus.cy, g.value.cy, g.plus.cy], 4, 'fear centres');
	assert.ok(g.minus.right <= g.value.left + 1 && g.value.right <= g.plus.left + 1, 'fear: value between − and +');
	await closePage(p); await closePage(run);
});

test('− and + are btn-ghost, transparent, text-coloured and at least 44x44', async () => {
	const p = await openPage(browser, sheetUrl(BASE, a, 'play'), [375, 812]);
	const run = await openPage(browser, runStepUrl(BASE, camp), [375, 812]);
	const all = [];
	for (const n of TRACKER_NAMES) all.push(...await stepperLooks(p, n, sheetTrackers(p)));
	all.push(...await stepperLooks(run, 'fear'));
	assert.equal(all.length, 10);
	for (const s of all) {
		assert.ok(s.cls.includes('btn-ghost'), 'btn-ghost');
		assert.equal(s.bg, 'rgba(0, 0, 0, 0)');
		assert.equal(s.color, 'rgb(239, 228, 200)');
		assert.ok(s.w >= 43.5 && s.h >= 43.5, `44px: ${s.w}x${s.h}`);
	}
	await closePage(p); await closePage(run);
});

test('the Fear band is as wide as run, surface, 8px radius, 1px border, Cinzel label, 20px pips', async () => {
	const p = await openPage(browser, runStepUrl(BASE, fearCamp), [1024, 768]);
	const f = await fearBand(p);
	assert.ok(Math.abs(f.width - f.runWidth) <= 2, `${f.width} vs ${f.runWidth}`);
	assert.equal(f.bg, 'rgb(26, 42, 34)');
	assert.equal(f.radius, '8px');
	assert.equal(f.borderW, '1px');
	assert.equal(f.borderStyle, 'solid');
	assert.match(f.labelFont, /Cinzel/);
	assert.ok(f.pips.length > 0);
	for (const s of f.pips) assert.deepEqual(s, [20, 20]);
	await closePage(p);
});

for (const js of [true, false]) {
	test(`Fear at 1: + shows 2 ${js ? 'with' : 'without'} JavaScript`, async () => {
		const camp2 = await createCampaign(BASE, `Fear ${js}`);
		await createCharacter(BASE, camp2, 'Dax');
		await addFear(BASE, camp2, 1);
		const p = await openPage(browser, runStepUrl(BASE, camp2), [1024, 768], { js });
		assert.equal(await fearValue(p), '1');
		await clickPlus(p, 'fear');
		if (js) await p.waitForFunction(() => document.querySelector('[data-testid=fear]').textContent.trim() === '2');
		else await p.waitForLoadState('load');
		assert.equal(await fearValue(p), '2');
		await closePage(p);
	});
}

test('HP at 0: + shows 1 marked', async () => {
	const p = await openPage(browser, sheetUrl(BASE, b, 'play'), [1024, 768]);
	assert.match(await hpText(p), /^0\b/);
	await clickPlus(p, 'hp');
	await p.waitForFunction(() => /^1\b/.test(document.querySelector('[data-testid=hp]').textContent.trim()));
	assert.match(await hpText(p), /^1\b/);
	await closePage(p);
});
