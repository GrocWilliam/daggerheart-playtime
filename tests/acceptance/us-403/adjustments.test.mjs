import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, closePage } from '../support/browser.mjs';
import {
	setupScene, storedAdjustments, openBuild, adjustmentsState, checkboxesInDetails, openAdjustments, checkAdjustment, uncheckAdjustment,
	submitGenerate, generateButtonText, generateBoxes, deleteRow, rowLineCounts, horizontalOverflow, detailsAfterSubmit
} from '../support/encounters.mjs';

const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

for (const [lang, summary] of [['en', 'Adjustments'], ['fr', 'Ajustements']]) {
	test(`no adjustments stored: encounter-adjustments is closed, summary "${summary}" (${lang}), the three checkboxes inside and hidden`, async () => {
		const { pageUrl } = await setupScene(BASE);
		const page = await openBuild(browser, pageUrl, { lang });
		try {
			const s = await adjustmentsState(page);
			assert.equal(s.count, 1);
			assert.equal(s.open, false);
			assert.equal(s.summary, summary);
			assert.deepEqual(s.boxes.map((b) => b.value).sort(), ['damageBoost', 'easier', 'harder']);
			assert.ok(s.boxes.every((b) => !b.visible), 'checkboxes hidden');
			const c = await checkboxesInDetails(page);
			assert.equal(c.inside, 3);
			assert.equal(c.inForm, 3);
		} finally { await closePage(page); }
	});
}

test('opening the details, checking easier and damage boost and generating stores them sorted; the details is then open with both checked', async () => {
	const { campaignId, sceneId, pageUrl } = await setupScene(BASE);
	const page = await openBuild(browser, pageUrl);
	try {
		await openAdjustments(page);
		await checkAdjustment(page, /easier/i);
		await checkAdjustment(page, /damage boost/i);
		await submitGenerate(page);
		assert.deepEqual(await storedAdjustments(BASE, campaignId, sceneId), ['damageBoost', 'easier']);
		const s = await adjustmentsState(page);
		assert.equal(s.open, true);
		const checked = s.boxes.filter((b) => b.checked).map((b) => b.value).sort();
		assert.deepEqual(checked, ['damageBoost', 'easier']);
	} finally { await closePage(page); }
});

test('an encounter generated with harder: the details is open with harder checked; unchecking and Regenerate stores []', async () => {
	const { campaignId, sceneId, pageUrl } = await setupScene(BASE, { encounter: { adjustments: ['harder'] } });
	const page = await openBuild(browser, pageUrl);
	try {
		let s = await adjustmentsState(page);
		assert.equal(s.open, true);
		assert.deepEqual(s.boxes.filter((b) => b.checked).map((b) => b.value), ['harder']);
		await uncheckAdjustment(page, /harder/i);
		assert.equal(await generateButtonText(page), 'Regenerate');
		await submitGenerate(page);
		assert.deepEqual(await storedAdjustments(BASE, campaignId, sceneId), []);
		s = await adjustmentsState(page);
		assert.equal(s.open, false);
	} finally { await closePage(page); }
});

test('without JavaScript: open the details, check harder, submit Generate: the encounter includes harder', async () => {
	const { campaignId, sceneId, pageUrl } = await setupScene(BASE);
	const page = await openBuild(browser, pageUrl, { js: false });
	try {
		await openAdjustments(page);
		await checkAdjustment(page, /harder/i);
		await submitGenerate(page, false);
		assert.ok((await storedAdjustments(BASE, campaignId, sceneId)).includes('harder'));
	} finally { await closePage(page); }
});

test('at 1024x768 opening the details does not move party size, tier or Generate; their bottoms are within 4px', async () => {
	const { pageUrl } = await setupScene(BASE);
	const page = await openBuild(browser, pageUrl, { viewport: [1024, 768] });
	try {
		assert.equal((await adjustmentsState(page)).open, false);
		const before = await generateBoxes(page);
		await openAdjustments(page);
		const after = await generateBoxes(page);
		for (const k of ['party', 'tier', 'submit']) {
			assert.ok(Math.abs(after[k].top - before[k].top) <= 1, `${k} top ${before[k].top} -> ${after[k].top}`);
			assert.ok(Math.abs(after[k].left - before[k].left) <= 1, `${k} left ${before[k].left} -> ${after[k].left}`);
		}
		const bottoms = ['party', 'tier', 'submit'].map((k) => after[k].bottom);
		assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 4, `bottoms ${bottoms}`);
		const d = await detailsAfterSubmit(page);
		assert.ok(d.after, 'the details comes after the submit');
		assert.ok(d.classes.includes('basis-full'));
		assert.ok(d.formClasses.includes('flex') && d.formClasses.includes('flex-wrap'));
		assert.ok(d.width >= d.formWidth - 2, `full width ${d.width} of ${d.formWidth}`);
	} finally { await closePage(page); }
});

for (const viewport of [[375, 812], [1024, 768]]) {
	test(`at ${viewport.join('x')} Delete encounter is btn-danger, the last button, alone on its line and right-aligned`, async () => {
		const { pageUrl } = await setupScene(BASE, { encounter: { three: true } });
		const page = await openBuild(browser, pageUrl, { viewport });
		try {
			const d = await deleteRow(page);
			assert.ok(d, 'Delete encounter button');
			assert.ok(d.classes.includes('btn-danger'));
			assert.ok(d.isLastButton, 'last button of the encounter section');
			for (const m of d.rowMates) assert.ok(m.bottom <= d.top + 1 || m.top >= d.bottom - 1, `control shares the line: ${JSON.stringify(m)} vs ${d.top}-${d.bottom}`);
			assert.ok(Math.abs(d.right - d.contentRight) <= 2, `right edge ${d.right} vs ${d.contentRight}`);
		} finally { await closePage(page); }
	});
}

for (const lang of ['en', 'fr']) {
	test(`at 375x812 (${lang}) with the details open no row of the encounter section wraps onto more than 2 lines`, async () => {
		const { pageUrl } = await setupScene(BASE, { encounter: { three: true, adjustments: ['easier'] } });
		const page = await openBuild(browser, pageUrl, { lang, viewport: [375, 812] });
		try {
			assert.equal((await adjustmentsState(page)).open, true);
			const r = await rowLineCounts(page);
			assert.ok(r.generate <= 2, `generate form ${r.generate} lines`);
			assert.equal(r.cards.length, 3);
			r.cards.forEach((n, i) => assert.ok(n <= 2, `adversary card ${i} ${n} lines`));
			assert.ok(r.del !== null && r.del <= 2, `delete row ${r.del} lines`);
		} finally { await closePage(page); }
	});
}

test('at 375x812 with the encounter section open there is no sideways scroll', async () => {
	const { pageUrl } = await setupScene(BASE, { encounter: { three: true, adjustments: ['harder'] } });
	const page = await openBuild(browser, pageUrl, { viewport: [375, 812] });
	try { assert.ok((await horizontalOverflow(page)) <= 0); } finally { await closePage(page); }
});

test('docs/ui.md lists `encounter-adjustments`', () => {
	assert.ok(readFileSync('docs/ui.md', 'utf8').includes('`encounter-adjustments`'));
});

test('encounter.adjustments is in both catalogs with different values (make test itself runs in its own CI job)', () => {
	const en = JSON.parse(readFileSync('src/lib/i18n/en.json', 'utf8'));
	const fr = JSON.parse(readFileSync('src/lib/i18n/fr.json', 'utf8'));
	assert.equal(en['encounter.adjustments'], 'Adjustments');
	assert.equal(fr['encounter.adjustments'], 'Ajustements');
});
