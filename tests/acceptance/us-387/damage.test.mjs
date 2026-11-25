import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import * as D from '../support/damage.mjs';

const BASE = process.env.BASE_URL;
const PRIMARY_LIKE = 'btn-primary';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

// NOTE: the story's criteria say quick=14 for "Major"; the Major button's value is the major threshold (7) and
// marks 2 HP, Severe's is 14 and marks 3 HP (applyDamage rules). Tests post the button values.

test('Run step: Major (quick=7) marks 2 HP, armor untouched', async () => {
	const c = await D.freshCharacter(BASE);
	const r = await D.postRunDamage(BASE, c.campaignId, c.id, { quick: '7' });
	assert.ok(r.status < 400);
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 2, armor: 0 });
});
test('Run step: Major with use armor marks 1 HP and 1 Armor', async () => {
	const c = await D.freshCharacter(BASE);
	await D.postRunDamage(BASE, c.campaignId, c.id, { quick: '7', useArmor: 'on' });
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 1, armor: 1 });
});
test('Run step: quick wins over amount', async () => {
	const c = await D.freshCharacter(BASE);
	await D.postRunDamage(BASE, c.campaignId, c.id, { quick: '1', amount: '20' });
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 1, armor: 0 });
});
test('Run step: Severe (quick=14) marks 3 HP', async () => {
	const c = await D.freshCharacter(BASE);
	await D.postRunDamage(BASE, c.campaignId, c.id, { quick: '14' });
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 3, armor: 0 });
});
test('Run step: without quick the amount field still applies', async () => {
	const c = await D.freshCharacter(BASE);
	await D.postRunDamage(BASE, c.campaignId, c.id, { amount: '3' });
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 1, armor: 0 });
});
test('Run step: an empty quick and an empty amount mark nothing', async () => {
	const c = await D.freshCharacter(BASE);
	const r = await D.postRunDamage(BASE, c.campaignId, c.id, { quick: '', amount: '' });
	assert.notEqual(r.status, 303);
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 0, armor: 0 });
});
test('sheet: quick=7 raises HP by 2, quick=1 by 1, and a plain POST answers 303 to ?tab=play', async () => {
	const c = await D.freshCharacter(BASE);
	const r = await D.postSheetDamage(BASE, c.id, { quick: '7' });
	assert.equal(r.status, 303);
	assert.match(r.location, /\?tab=play/);
	assert.equal((await D.marks(BASE, c.id)).hp, 2);
	await D.postSheetDamage(BASE, c.id, { quick: '1' });
	assert.equal((await D.marks(BASE, c.id)).hp, 3);
});

test('(browser) English Run card: three quick buttons on one row, then label, field, checkbox, Apply', async () => {
	const c = await D.freshCharacter(BASE, 'Quilla');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768], { lang: 'en' });
	const card = D.cardOf(p, 'Quilla');
	assert.deepEqual(await D.quickTexts(card), ['Minor', 'Major ≥7', 'Severe ≥14']);
	assert.equal(await D.otherLabel(card), 'Other amount');
	const l = await D.layout(card);
	for (const k of ['major', 'severe']) assert.ok(Math.abs(l[k].y - l.minor.y) <= 2, `${k} on the minor row`);
	assert.ok(l.minor.x < l.major.x && l.major.x < l.severe.x);
	assert.ok(l.label.y >= l.minor.bottom - 1, 'label below the quick row');
	assert.ok(l.label.y <= l.amount.y + 1, 'label above the field');
	assert.ok(l.amount.x < l.armor.x && l.armor.x < l.apply.x, 'field, checkbox, Apply in order');
	await closePage(p);
});
test('(browser) French sheet Play tab labels', async () => {
	const c = await D.freshCharacter(BASE, 'Quinn');
	const p = await openPage(browser, D.sheetUrl(BASE, c.id), [1024, 768], { lang: 'fr' });
	const root = p.locator('body');
	assert.deepEqual(await D.quickTexts(root), ['Mineurs', 'Majeurs ≥7', 'Graves ≥14']);
	assert.equal(await D.otherLabel(root), 'Autre montant');
	await closePage(p);
});
test('(browser) with JavaScript, Major shows HP 2/6 without reload; with use armor HP 3/6 and Armor 1/3', async () => {
	const c = await D.freshCharacter(BASE, 'Quade');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768]);
	const card = D.cardOf(p, 'Quade');
	await D.markNavigation(p);
	await D.tapQuick(card, 'major');
	await p.waitForFunction(() => document.querySelector('[data-testid=hp]')?.textContent.trim() === '2/6');
	assert.equal(await D.hpText(card), '2/6');
	assert.equal(await D.wasReloaded(p), false);
	await D.checkUseArmor(card);
	await D.tapQuick(card, 'major');
	await p.waitForFunction(() => document.querySelector('[data-testid=hp]')?.textContent.trim() === '3/6');
	assert.equal(await D.armorText(card), '1/3');
	await closePage(p);
});
test('(browser) without JavaScript: Severe on the sheet reloads on Play with HP 3/6; Minor on Run gives 1/6', async () => {
	const c = await D.freshCharacter(BASE, 'Quin');
	let p = await openPage(browser, D.sheetUrl(BASE, c.id), [1024, 768], { js: false });
	await D.tapQuick(p.locator('body'), 'severe');
	await p.waitForLoadState('load');
	assert.match(p.url(), /tab=play/);
	assert.equal(await D.hpText(p.locator('body')), '3/6');
	await closePage(p);
	const d = await D.freshCharacter(BASE, 'Quirk');
	p = await openPage(browser, D.runUrl(BASE, d.campaignId), [1024, 768], { js: false });
	await D.tapQuick(D.cardOf(p, 'Quirk'), 'minor');
	await p.waitForLoadState('load');
	assert.equal(await D.hpText(D.cardOf(p, 'Quirk')), '1/6');
	await closePage(p);
});
test('(browser) Minor submits with an empty field and marks 1 HP; Apply with an empty field is blocked', async () => {
	const c = await D.freshCharacter(BASE, 'Quest');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768]);
	const card = D.cardOf(p, 'Quest');
	await D.clickApply(card);
	assert.equal(await D.amountBlocked(card), true);
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 0, armor: 0 });
	await D.tapQuick(card, 'minor');
	await p.waitForFunction(() => document.querySelector('[data-testid=hp]')?.textContent.trim() === '1/6');
	assert.deepEqual(await D.marks(BASE, c.id), { hp: 1, armor: 0 });
	await closePage(p);
});
test('(browser) quick buttons look secondary, are 44px, and Apply stays primary', async () => {
	const c = await D.freshCharacter(BASE, 'Quark');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768]);
	const card = D.cardOf(p, 'Quark');
	const apply = await D.applyLook(card);
	assert.ok(apply.cls.includes(PRIMARY_LIKE));
	for (const k of ['minor', 'major', 'severe']) {
		const l = await D.quickLook(card, k);
		assert.ok(l.cls.includes('btn-secondary') && !l.cls.includes(PRIMARY_LIKE), `${k} class`);
		assert.equal(l.type, null, `${k} has no type attribute`);
		assert.ok(l.w >= 43.5 && l.h >= 43.5, `${k} size ${l.w}x${l.h}`);
		assert.notEqual(l.bg, apply.bg, `${k} background differs from Apply`);
	}
	await closePage(p);
});
test('(browser) card at most 500px tall at 1024x768; no sideways scroll at 375px', async () => {
	const c = await D.freshCharacter(BASE, 'Quo');
	let p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768]);
	const h = await D.cardHeight(D.cardOf(p, 'Quo'));
	assert.ok(h <= 500, `height ${h}`);
	await closePage(p);
	p = await openPage(browser, D.runUrl(BASE, c.campaignId), [375, 812]);
	assert.ok((await D.sideScroll(p)) <= 0);
	await closePage(p);
});
test('docs/ui.md lists the three test ids and the 500px budget', async () => {
	const doc = await D.uiDoc();
	for (const k of ['minor', 'major', 'severe']) assert.ok(doc.includes(`\`damage-${k}\``), k);
	assert.match(doc, /500px/);
	assert.doesNotMatch(doc, /at most 440px/);
});
