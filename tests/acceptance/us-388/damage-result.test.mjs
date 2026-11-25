import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import * as D from '../support/damage.mjs';

const BASE = process.env.BASE_URL;
const M = '−';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

test('sheet damage without JS: Major with armor redirects to ?tab=play&hit=2&armor=1', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const r = await D.postSheetDamage(BASE, c.id, { quick: '14', useArmor: 'on' });
	assert.equal(r.status, 303);
	assert.match(r.location, new RegExp(`/characters/${c.id}\\?tab=play&hit=2&armor=1$`));
});
test('sheet damage without JS: no armor redirects to ?tab=play&hit=2', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const r = await D.postSheetDamage(BASE, c.id, { quick: '7' });
	assert.equal(r.status, 303);
	assert.match(r.location, /\?tab=play&hit=2$/);
});

test('(browser) Run step with JS: empty before damage, then Major, then Major with armor', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768], { lang: 'en' });
	assert.equal(await D.damageResultCount(p), 1);
	assert.equal(await D.damageResultText(p), '');
	const card = D.cardOf(p, 'Lyra');
	await D.tapQuick(card, 'major');
	await D.waitForDamageResult(p, `Lyra: ${M}2 HP`);
	await D.checkUseArmor(card);
	await D.tapQuick(card, 'major');
	await D.waitForDamageResult(p, `Lyra: ${M}1 HP, 1 armor slot used`);
	assert.deepEqual(await D.damageResultAria(p), { role: 'status', live: 'polite' });
	await closePage(p);
});
test('(browser) Run step without JS: Severe shows HP 3/6 and the result', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768], { lang: 'en', js: false });
	await D.tapQuick(D.cardOf(p, 'Lyra'), 'severe');
	await p.waitForLoadState('load');
	assert.equal(await D.hpText(D.cardOf(p, 'Lyra')), '3/6');
	assert.equal(await D.damageResultText(p), `Lyra: ${M}3 HP`);
	await closePage(p);
});
test('(browser) French sheet Play tab: Majeurs reads "Lyra : −2 PV", with JS and without', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	let p = await openPage(browser, D.sheetUrl(BASE, c.id), [1024, 768], { lang: 'fr' });
	await D.tapQuick(p.locator('body'), 'major');
	await D.waitForDamageResult(p, `Lyra : ${M}2 PV`);
	assert.deepEqual(await D.damageResultAria(p), { role: 'status', live: 'polite' });
	await closePage(p);
	const d = await D.freshCharacter(BASE, 'Lyra');
	p = await openPage(browser, D.sheetUrl(BASE, d.id), [1024, 768], { lang: 'fr', js: false });
	await D.tapQuick(p.locator('body'), 'major');
	await p.waitForLoadState('load');
	assert.equal(await D.damageResultText(p), `Lyra : ${M}2 PV`);
	await closePage(p);
});
test('(browser) armor absorbing a Minor hit reads 0 HP and 1 armor slot, HP unchanged', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768], { lang: 'en' });
	const card = D.cardOf(p, 'Lyra');
	await D.checkUseArmor(card);
	await D.tapQuick(card, 'minor');
	await D.waitForDamageResult(p, `Lyra: ${M}0 HP, 1 armor slot used`);
	assert.equal(await D.hpText(card), '0/6');
	await closePage(p);
});
test('(browser) Traits tab has no damage-result', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const p = await openPage(browser, D.sheetTabUrl(BASE, c.id, 'traits'), [1024, 768], { lang: 'en' });
	assert.equal(await D.damageResultCount(p), 0);
	await closePage(p);
});
test('(browser) Play tab damage-result is a polite status, empty before damage', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	const p = await openPage(browser, D.sheetUrl(BASE, c.id), [1024, 768], { lang: 'en' });
	assert.equal(await D.damageResultCount(p), 1);
	assert.equal(await D.damageResultText(p), '');
	assert.deepEqual(await D.damageResultAria(p), { role: 'status', live: 'polite' });
	await closePage(p);
});
test('(browser) card stays at most 500px after a hit; no sideways scroll at 375px', async () => {
	const c = await D.freshCharacter(BASE, 'Lyra');
	let p = await openPage(browser, D.runUrl(BASE, c.campaignId), [1024, 768], { lang: 'en' });
	await D.tapQuick(D.cardOf(p, 'Lyra'), 'major');
	await D.waitForDamageResult(p, `Lyra: ${M}2 HP`);
	const h = await D.cardHeight(D.cardOf(p, 'Lyra'));
	assert.ok(h <= 500, `height ${h}`);
	await closePage(p);
	p = await openPage(browser, D.runUrl(BASE, c.campaignId), [375, 812], { lang: 'en' });
	await D.tapQuick(D.cardOf(p, 'Lyra'), 'major');
	await D.waitForDamageResult(p, `Lyra: ${M}2 HP`);
	assert.ok((await D.sideScroll(p)) <= 0);
	await closePage(p);
});
test('docs/ui.md lists damage-result as a test id', async () => {
	assert.ok((await D.uiDoc()).includes('`damage-result`'));
});
