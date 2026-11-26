import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { sheetUrl } from '../support/pages.mjs';
import * as S from '../support/sheet.mjs';

const BASE = process.env.BASE_URL;
const ACCENT = 'rgb(212, 160, 80)', CLEAR = 'rgba(0, 0, 0, 0)';
let browser, id, tenId;
before(async () => {
	browser = await launchBrowser();
	id = await S.levelThreeCharacter(BASE, 'Sable');
	tenId = await createCharacter(BASE, await createCampaign(BASE, 'Ten camp'), 'Elder', { level: 10 });
});
after(async () => { await browser?.close(); });

const within = (xs, tol, msg) => assert.ok(Math.max(...xs) - Math.min(...xs) <= tol, `${msg}: ${xs.join(', ')}`);

test('level-3 character: level-up, campaign-run-link, new-edit in that order; level-up btn-primary, others btn-secondary', async () => {
	const html = await S.fetchSheetHtml(BASE, id, { tab: 'play' });
	assert.deepEqual(S.headerOrderInHtml(html), ['level-up', 'campaign-run-link', 'new-edit']);
	assert.ok(S.classesInHtml(html, 'level-up').includes('btn-primary'));
	assert.ok(!S.classesInHtml(html, 'level-up').includes('btn-secondary'));
	for (const t of ['campaign-run-link', 'new-edit']) assert.ok(S.classesInHtml(html, t).includes('btn-secondary'), t);
});

test('level-10 character: no level-up, campaign-run-link before new-edit', async () => {
	const html = await S.fetchSheetHtml(BASE, tenId, { tab: 'play' });
	assert.ok(!S.hasTestId(html, 'level-up'));
	assert.deepEqual(S.headerOrderInHtml(html), ['campaign-run-link', 'new-edit']);
});

for (const lang of ['en', 'fr']) for (const tab of S.SHEET_TABS) {
	test(`at 375x812 the header buttons share a top edge, are 44px and 8px apart, no sideways scroll (${lang} ${tab})`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, tab), [375, 812], { lang });
		const b = await S.headerButtons(p);
		const ks = Object.keys(b);
		assert.deepEqual(ks, ['level-up', 'campaign-run-link', 'new-edit']);
		within(ks.map((k) => b[k].top), 2, 'tops');
		for (const k of ks) assert.ok(b[k].w >= 43.5 && b[k].h >= 43.5, `${k} size ${b[k].w}x${b[k].h}`);
		for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++)
			assert.ok(S.gapBetween(b[ks[i]], b[ks[j]]) >= 7.5, `${ks[i]} / ${ks[j]} gap`);
		assert.ok((await S.sideScroll(p)) <= 0, 'sideways scroll');
		await closePage(p);
	});
}

test('level-up has the accent background; campaign-run-link and new-edit are transparent with accent text', async () => {
	const p = await openPage(browser, sheetUrl(BASE, id, 'play'), [1280, 900]);
	const b = await S.headerButtons(p);
	assert.equal(b['level-up'].bg, ACCENT);
	for (const k of ['campaign-run-link', 'new-edit']) { assert.equal(b[k].bg, CLEAR, k); assert.equal(b[k].color, ACCENT, k); }
	await closePage(p);
});

test('at 1280x900 on play, sheet-conditions is below sheet-trackers, same left edge, trackers as wide as sheet-sections', async () => {
	const p = await openPage(browser, sheetUrl(BASE, id, 'play'), [1280, 900]);
	const tr = await S.boxOf(p, 'sheet-trackers'), co = await S.boxOf(p, 'sheet-conditions'), se = await S.boxOf(p, 'sheet-sections');
	assert.ok(co.top >= tr.bottom - 0.5, `conditions top ${co.top} vs trackers bottom ${tr.bottom}`);
	assert.ok(Math.abs(co.left - tr.left) <= 1, `left ${co.left} ${tr.left}`);
	assert.ok(Math.abs(tr.w - se.w) <= 2, `trackers ${tr.w} vs sections ${se.w}`);
	await closePage(p);
});

for (const vp of [[768, 1024], [375, 812]]) {
	test(`at ${vp.join('x')} on play, sheet-conditions is below sheet-trackers with the same left edge`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, 'play'), vp);
		const tr = await S.boxOf(p, 'sheet-trackers'), co = await S.boxOf(p, 'sheet-conditions');
		assert.ok(co.top >= tr.bottom - 0.5, `conditions top ${co.top} vs trackers bottom ${tr.bottom}`);
		assert.ok(Math.abs(co.left - tr.left) <= 1, `left ${co.left} ${tr.left}`);
		await closePage(p);
	});
}

test('at 1280x900 the defense line and proficiency share a vertical centre, between the last tracker and the damage form', async () => {
	const p = await openPage(browser, sheetUrl(BASE, id, 'play'), [1280, 900]);
	assert.equal(await S.proficiencyInTrackers(p), 1, 'proficiency inside sheet-trackers');
	const d = await S.defenseLineBox(p), pr = await S.boxOf(p, 'proficiency');
	const last = await S.lastTrackerBox(p), dmg = await S.damageFormBox(p);
	assert.ok(Math.abs((d.top + d.bottom) / 2 - (pr.top + pr.bottom) / 2) <= 4, `centres ${d.top}-${d.bottom} vs ${pr.top}-${pr.bottom}`);
	for (const b of [d, pr]) {
		assert.ok(b.top >= last.bottom - 1, `below last tracker: ${b.top} vs ${last.bottom}`);
		assert.ok(b.bottom <= dmg.top + 1, `above damage form: ${b.bottom} vs ${dmg.top}`);
	}
	await closePage(p);
});

for (const vp of [[375, 812], [1280, 900]]) {
	test(`at ${vp.join('x')} on play the three condition toggles share a top edge`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, 'play'), vp);
		within((await S.conditionToggleBoxes(p)).map((t) => t.top), 2, 'toggle tops');
		await closePage(p);
	});
}

for (const [tab, a, b] of [['traits', 'sheet-traits', 'sheet-experiences'], ['gear', 'sheet-equipment', 'sheet-gold']]) {
	test(`at 1280x900 on ${tab}, ${a} and ${b} share a top edge`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, tab), [1280, 900]);
		const x = await S.boxOf(p, a), y = await S.boxOf(p, b);
		assert.ok(Math.abs(x.top - y.top) <= 1, `${x.top} vs ${y.top}`);
		await closePage(p);
	});
}

test('docs/ui.md: header line names level-up as btn-primary and first; Play line says one column with sheet-conditions below sheet-trackers', async () => {
	const lines = readFileSync(new URL('../../../docs/ui.md', import.meta.url), 'utf8').split('\n');
	const header = lines.filter((l) => /header/i.test(l) && l.includes('level-up') && l.includes('campaign-run-link'));
	assert.ok(header.length >= 1, 'a header line names the buttons');
	for (const l of header) {
		assert.ok(l.includes('btn-primary'), l);
		assert.ok(l.indexOf('level-up') < l.indexOf('campaign-run-link'), `level-up first: ${l}`);
	}
	const play = lines.filter((l) => /Play/.test(l) && l.includes('sheet-conditions') && l.includes('sheet-trackers'));
	assert.ok(play.some((l) => /one column|1 column/i.test(l) && /below/i.test(l)), 'a Play line: one column, conditions below trackers');
	const primary = lines.find((l) => l.startsWith('- `btn-primary`:')) ?? '';
	const secondary = lines.find((l) => l.startsWith('- `btn-secondary`:')) ?? '';
	assert.ok(primary.includes('`level-up`'), 'btn-primary list has level-up');
	assert.ok(!secondary.includes('`level-up`'), 'btn-secondary list no longer has level-up');
});
