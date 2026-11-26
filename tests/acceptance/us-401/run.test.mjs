import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { RAT, BUR, setupBattle, unitHp, pipsOf, clickUnitHpPlus, addMore, addMoreIsOpen, addMoreSummary, openAddMore, battleAddVisible,
	addAdversary, battleAddInsideMore, journalLayout, sidewaysScroll, paletteRgb, postBattleAdd, unit } from '../support/battlepips.mjs';

const BASE = process.env.BASE_URL;
const EN = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
const FR = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
let browser, battle, journals, empty;
before(async () => {
	browser = await launchBrowser();
	battle = await setupBattle(BASE);
	journals = await setupBattle(BASE, { journal: 3 });
	empty = await setupBattle(BASE, { encounter: false });
});
after(async () => { await browser?.close(); });
const fresh = () => setupBattle(BASE);

test('a copy with 3 of 8 HP marked shows 3/8 and 8 pips, 3 filled', async () => {
	const p = await openPage(browser, battle.url, [1024, 768]);
	assert.equal(await unitHp(p, BUR, 0), '3/8');
	const pips = await pipsOf(p, BUR, 0);
	assert.equal(pips.total, 8);
	assert.equal(pips.filled, 3);
	await closePage(p);
});

test('a copy with 0 of 1 HP marked shows 0/1 and one empty pip', async () => {
	const p = await openPage(browser, battle.url, [1024, 768]);
	assert.equal(await unitHp(p, RAT, 0), '0/1');
	const pips = await pipsOf(p, RAT, 0);
	assert.equal(pips.total, 1);
	assert.equal(pips.filled, 0);
	await closePage(p);
});

test('a defeated copy has all pips filled in the muted colour; live copies use the danger colour', async () => {
	const p = await openPage(browser, battle.url, [1024, 768]);
	const pal = await paletteRgb(p);
	assert.notEqual(pal.muted, pal.danger);
	const d = await pipsOf(p, BUR, 1);
	assert.equal(d.total, 8);
	assert.equal(d.filled, 8);
	assert.deepEqual(d.filledColours, [pal.muted]);
	const live = await pipsOf(p, BUR, 0);
	assert.deepEqual(live.filledColours, [pal.danger]);
	await closePage(p);
});

test('clicking unit-hp-plus on 2/8 shows 3/8 and 3 filled pips', async () => {
	const s = await fresh();
	const p = await openPage(browser, s.url, [1024, 768]);
	assert.equal(await unitHp(p, BUR, 2), '2/8');
	assert.equal((await pipsOf(p, BUR, 2)).filled, 2);
	await clickUnitHpPlus(p, BUR, 2);
	await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="battle-unit"][data-index="2"] [data-testid="unit-hp"]')].some((e) => e.textContent.trim() === '3/8'));
	assert.equal(await unitHp(p, BUR, 2), '3/8');
	assert.equal((await pipsOf(p, BUR, 2)).filled, 3);
	await closePage(p);
});

for (const lang of ['en', 'fr'])
	test(`battle-add-more is closed with the right summary and a hidden form (${lang})`, async () => {
		const p = await openPage(browser, battle.url, [1024, 768], { lang });
		assert.equal(await addMore(p).count(), 1);
		assert.equal(await addMoreIsOpen(p), false);
		assert.equal(await addMoreSummary(p), (lang === 'en' ? EN : FR)['battle.add']);
		assert.equal(await addMoreSummary(p), lang === 'en' ? 'Add adversary' : 'Ajouter un adversaire');
		assert.equal(await battleAddInsideMore(p), 1);
		assert.equal(await battleAddVisible(p), false);
		await closePage(p);
	});

test('opening battle-add-more and adding 2 acid burrowers adds two rows', async () => {
	const s = await fresh();
	const p = await openPage(browser, s.url, [1024, 768]);
	const before = await p.locator(`[data-testid="battle-unit"][data-adversary="${BUR}"]`).count();
	await openAddMore(p);
	assert.equal(await battleAddVisible(p), true);
	await addAdversary(p, BUR, 2);
	await p.waitForFunction(([id, n]) => document.querySelectorAll(`[data-testid="battle-unit"][data-adversary="${id}"]`).length === n, [BUR, before + 2]);
	assert.equal(await unit(p, BUR, before + 1).count(), 1);
	await closePage(p);
});

test('no JS, count 21 without max: error.invalid shown, nothing added, battle-add-more open', async () => {
	const s = await fresh();
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	await ctx.route(s.url, async (route) => {
		if (route.request().method() !== 'GET') return route.continue();
		const resp = await route.fetch();
		const html = (await resp.text()).replace(/<input[^>]*data-testid="battle-add-count"[^>]*>/g, (m) => m.replace(/\smax="20"/, ''));
		await route.fulfill({ response: resp, body: html });
	});
	const p = await ctx.newPage();
	p.setDefaultTimeout(5000); p.setDefaultNavigationTimeout(10000);
	await p.goto(s.url);
	assert.equal(await p.getByTestId('battle-add-count').getAttribute('max'), null);
	await openAddMore(p);
	await addAdversary(p, RAT, 21);
	await p.getByText(EN['error.invalid']).first().waitFor();
	assert.equal(await addMoreIsOpen(p), true);
	assert.equal(await p.locator(`[data-testid="battle-unit"][data-adversary="${RAT}"]`).count(), 1);
	await ctx.close();
});

test('POST ?/battleAdd with count 21 fails 400 with section battleAdd and error.invalid', async () => {
	const s = await fresh();
	const r = await postBattleAdd(BASE, s.campaignId, s.sceneId, { adversaryId: RAT, count: '21' });
	assert.equal(r.type, 'failure', JSON.stringify(r));
	assert.equal(r.status, 400);
	assert.ok(r.dataText.includes('section') && r.dataText.includes('battleAdd'), r.dataText);
	assert.ok(r.dataText.includes('error.invalid'), r.dataText);
});

for (const vp of [[375, 812], [1280, 800]])
	test(`journal form comes before the entries at ${vp.join('x')}`, async () => {
		const p = await openPage(browser, journals.url, vp);
		const l = await journalLayout(p);
		assert.ok(l.hasAfter);
		assert.ok(l.textareaTop >= l.h2Bottom - 1, JSON.stringify(l));
		assert.ok(l.buttonTop > l.textareaTop, JSON.stringify(l));
		assert.ok(l.textareaTop < l.afterTop, JSON.stringify(l));
		assert.ok(l.buttonTop < l.afterTop, JSON.stringify(l));
		assert.ok(l.buttonClasses.includes('btn-primary'));
		await closePage(p);
	});

test('with no journal entries the add form comes before the empty text', async () => {
	const p = await openPage(browser, empty.url, [1024, 768]);
	const l = await journalLayout(p);
	assert.ok(l.hasAfter);
	assert.ok(l.buttonTop < l.afterTop, JSON.stringify(l));
	assert.ok(l.textareaTop < l.afterTop, JSON.stringify(l));
	await closePage(p);
});

test('encounter and 3 journal entries at 375x812: no sideways scroll', async () => {
	const p = await openPage(browser, journals.url, [375, 812]);
	assert.ok((await sidewaysScroll(p)) <= 375);
	await closePage(p);
});
