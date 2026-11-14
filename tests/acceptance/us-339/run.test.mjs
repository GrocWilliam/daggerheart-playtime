import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { runStepUrl } from '../support/pages.mjs';
import { setupRunCampaign, characterMarkedHp, boxes, cardTops, cardBoxes, bodyWidth, sidewaysScroll, cardOf, cardHeader, damageFormLook,
	applyDamage, addToJournalLook, deleteJournalLook, unitButtonLook, battleAddLook, runTargets } from '../support/runstep.mjs';

const BASE = process.env.BASE_URL;
let browser, camp;
before(async () => { browser = await launchBrowser(); camp = await setupRunCampaign(BASE); });
after(async () => { await browser?.close(); });
const run = (vp, opts) => openPage(browser, runStepUrl(BASE, camp.campaignId), vp, opts);
const ids = ['party', 'current-scene', 'journal'];

for (const lang of ['en', 'fr'])
	for (const vp of [[375, 812], [768, 1024]])
		test(`${vp.join('x')} in ${lang}: party above current scene above journal, same left within 1px`, async () => {
			const p = await run(vp, { lang });
			const b = await boxes(p, ids);
			assert.ok(b.party.y + b.party.height <= b['current-scene'].y + 1, 'party above scene');
			assert.ok(b['current-scene'].y + b['current-scene'].height <= b.journal.y + 1, 'scene above journal');
			assert.ok(Math.abs(b.party.x - b['current-scene'].x) <= 1 && Math.abs(b.party.x - b.journal.x) <= 1, 'same left');
			await closePage(p);
		});

for (const vp of [[1024, 768], [1180, 820]])
	test(`${vp.join('x')}: party left, current scene right (288px), journal below the scene`, async () => {
		const p = await run(vp);
		const b = await boxes(p, ids);
		assert.ok(b.party.x < b['current-scene'].x, 'party left');
		assert.ok(Math.abs(b.party.y - b['current-scene'].y) <= 4, `tops ${b.party.y} ${b['current-scene'].y}`);
		assert.ok(Math.abs(b['current-scene'].width - 288) <= 2, `scene width ${b['current-scene'].width}`);
		assert.ok(Math.abs(b.journal.width - 288) <= 2, `journal width ${b.journal.width}`);
		assert.ok(b.journal.y >= b['current-scene'].y + b['current-scene'].height - 1, 'journal below scene');
		await closePage(p);
	});

for (const [vp, n] of [[[375, 812], 1], [[768, 1024], 2], [[1024, 768], 2], [[1180, 820], 2], [[1280, 800], 3]])
	test(`${n} card(s) on the first row at ${vp.join('x')}`, async () => {
		const p = await run(vp);
		const tops = await cardTops(p);
		assert.equal(tops.length, 3);
		assert.equal(tops.filter((t) => Math.abs(t - tops[0]) <= 2).length, n);
		await closePage(p);
	});

test('body is 1280px wide on the Run step at 1440x900 and 1152px on the Build step', async () => {
	let p = await run([1440, 900]);
	assert.ok(Math.abs((await bodyWidth(p)) - 1280) <= 1);
	await closePage(p);
	p = await openPage(browser, `${BASE}/campaigns/${camp.campaignId}?step=build`, [1440, 900]);
	assert.ok(Math.abs((await bodyWidth(p)) - 1152) <= 1);
	await closePage(p);
});

test('a card with no condition is at most 360px tall at 1024x768', async () => {
	const p = await run([1024, 768]);
	const b = await cardBoxes(p);
	const h = await cardOf(p, 'Alyndra').evaluate((e) => e.getBoundingClientRect().height);
	assert.ok(h <= 360, `height ${h}`);
	assert.equal(b.length, 3);
	await closePage(p);
});

test('card header: name, down and class/level share a centre; class/level is 14px muted', async () => {
	const p = await run([1024, 768]);
	const h = await cardHeader(cardOf(p, 'Brom'));
	assert.notEqual(h.down, null, 'Brom is down');
	assert.ok(Math.max(h.name, h.down, h.meta) - Math.min(h.name, h.down, h.meta) <= 8, JSON.stringify(h));
	assert.equal(h.fontSize, '14px');
	assert.equal(h.color, 'rgb(185, 176, 143)');
	await closePage(p);
});

for (const vp of [[375, 812], [1024, 768]])
	test(`damage form at ${vp.join('x')}: 80px amount, aligned bottoms, primary submit`, async () => {
		const p = await run(vp);
		const d = await damageFormLook(cardOf(p, 'Alyndra'));
		assert.ok(Math.abs(d.inputWidth - 80) <= 1, `width ${d.inputWidth}`);
		assert.ok(Math.abs(d.inputBottom - d.submitBottom) <= 4, `bottoms ${d.inputBottom} ${d.submitBottom}`);
		assert.ok(d.submitClasses.includes('btn-primary'));
		await closePage(p);
	});

test('journal: Add to journal is btn-primary, delete is btn-danger (danger text, transparent background)', async () => {
	const p = await run([1024, 768]);
	assert.ok((await addToJournalLook(p)).classes.includes('btn-primary'));
	const d = await deleteJournalLook(p);
	assert.ok(d.classes.includes('btn-danger'));
	assert.equal(d.color, 'rgb(238, 128, 112)');
	assert.equal(d.background, 'rgba(0, 0, 0, 0)');
	await closePage(p);
});

test('encounter: unit hp +/- are btn-ghost, battle add is btn-primary, unit hit is btn-primary', async () => {
	const p = await run([1024, 768]);
	for (const t of ['unit-hp-plus', 'unit-hp-minus']) assert.ok((await unitButtonLook(p, t)).classes.includes('btn-ghost'), t);
	assert.ok((await unitButtonLook(p, 'unit-hit')).classes.includes('btn-primary'));
	assert.ok((await battleAddLook(p)).classes.includes('btn-primary'));
	await closePage(p);
});

for (const vp of [[360, 740], [375, 812], [768, 1024], [1024, 768], [1180, 820]])
	test(`no sideways scroll and 44px targets at ${vp.join('x')}`, async () => {
		const p = await run(vp);
		assert.ok((await sidewaysScroll(p)) <= 0);
		const small = (await runTargets(p)).filter((t) => t.height < 43.5);
		assert.deepEqual(small, []);
		await closePage(p);
	});

test('without JavaScript, damage 3 on a card marks 1 HP', async () => {
	const p = await run([1024, 768], { js: false });
	const before = await characterMarkedHp(BASE, camp.cyra);
	await applyDamage(cardOf(p, 'Cyra'), 3);
	await p.waitForLoadState('load');
	assert.equal(await characterMarkedHp(BASE, camp.cyra), before + 1);
	await closePage(p);
});
