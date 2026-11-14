import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign } from '../support/api.mjs';
import { levelThreeCharacter } from '../support/sheet.mjs';
import { homeUrl, sheetUrl } from '../support/pages.mjs';
import * as C from '../support/chrome.mjs';

const BASE = process.env.BASE_URL;
const ACCENT = 'rgb(212, 160, 80)', TEXT = 'rgb(239, 228, 200)', MUTED = 'rgb(185, 176, 143)', CLEAR = 'rgba(0, 0, 0, 0)';
let browser, sheetId;
before(async () => {
	browser = await launchBrowser();
	for (const n of ['Alpha camp', 'Beta camp', 'Gamma camp']) await createCampaign(BASE, n);
	sheetId = await levelThreeCharacter(BASE, 'Orin');
});
after(async () => { await browser?.close(); });
const LANGS = ['en', 'fr'];

for (const lang of LANGS) for (const [vp, cols] of [[[375, 812], 1], [[768, 1024], 2], [[1024, 768], 3]]) {
	test(`home cards are in ${cols} column(s), names in Cinzel, run links secondary, new-campaign primary (${lang} ${vp[0]})`, async () => {
		const p = await openPage(browser, homeUrl(BASE), vp, { lang });
		const cards = await C.homeCards(p);
		assert.ok(cards.length >= 3);
		assert.equal(C.columnCount(cards.slice(0, 3)), cols);
		for (const n of await C.campaignNames(p)) assert.match(n.font, /Cinzel/);
		const runs = await C.runLinks(p);
		assert.ok(runs.length >= 3);
		for (const r of runs) { assert.ok(r.cls.includes('btn-secondary')); assert.equal(r.color, ACCENT); }
		const o = await C.newCampaignOpener(p);
		assert.ok(o.cls.includes('btn-primary'));
		assert.equal(o.bg, ACCENT);
		await closePage(p);
	});
}

function sideBySide(save, cancel) {
	assert.ok(Math.abs(save.top - cancel.top) <= 2, `tops ${save.top} / ${cancel.top}`);
	assert.ok(C.gapBetween(save, cancel) >= 8 - 0.5, `gap ${C.gapBetween(save, cancel)}`);
	for (const b of [save, cancel]) assert.ok(b.w >= 43.5 && b.h >= 43.5, `size ${b.w}x${b.h}`);
}

test('/?new=campaign: Save is primary, modal-cancel ghost, side by side, 44px', async () => {
	const p = await openPage(browser, homeUrl(BASE) + '?new=campaign', [1024, 768]);
	const s = await C.modalSave(p, 'campaign'), c = await C.modalCancel(p, 'campaign');
	assert.ok(s.cls.includes('btn-primary'));
	assert.ok(c.cls.includes('btn-ghost'));
	assert.equal(c.color, TEXT);
	assert.equal(c.bg, CLEAR);
	sideBySide(s, c);
	const row = await C.cancelRowClasses(p, 'campaign');
	for (const k of ['flex', 'flex-wrap', 'gap-2']) assert.ok(row.includes(k), `row has ${k}`);
	await closePage(p);
});

test('without JavaScript, modal-cancel drops new and leaves no dialog open', async () => {
	const p = await openPage(browser, homeUrl(BASE) + '?new=campaign', [1024, 768], { js: false });
	assert.equal(await C.modalOpen(p, 'campaign'), true);
	await C.clickModalCancel(p, 'campaign');
	await p.waitForURL((u) => !u.searchParams.has('new'));
	assert.equal(new URL(p.url()).searchParams.has('new'), false);
	assert.equal(await C.openDialogCount(p), 0);
	await closePage(p);
});

for (const [q, kind] of [['?new=edit', 'edit'], ['?tab=gear&new=item', 'item']]) {
	test(`sheet ${q}: Save and modal-cancel are side by side with the same variants`, async () => {
		const p = await openPage(browser, `${BASE}/characters/${sheetId}${q}`, [1024, 768]);
		const s = await C.modalSave(p, kind), c = await C.modalCancel(p, kind);
		assert.ok(s.cls.includes('btn-primary'));
		assert.ok(c.cls.includes('btn-ghost'));
		sideBySide(s, c);
		await closePage(p);
	});
}

for (const lang of LANGS) {
	test(`reference: entries in 2 columns, name in Cinzel, kind 14px muted, search primary, helpers keep ? (${lang})`, async () => {
		const p = await openPage(browser, `${BASE}/reference?kind=classes`, [768, 1024], { lang });
		const items = await C.refItems(p);
		assert.ok(items.length >= 2);
		assert.equal(C.columnCount(items), 2);
		const card = await C.refItemCard(p);
		assert.equal(card.bg, 'rgb(26, 42, 34)');
		assert.equal(card.borderLeft, '3px');
		assert.equal(card.borderColor, ACCENT);
		assert.equal(card.radius, '8px');
		const { name, kind } = await C.refNameAndKind(p);
		assert.match(name.font, /Cinzel/);
		assert.equal(kind.size, '14px');
		assert.equal(kind.color, MUTED);
		assert.ok((await C.refSearchSubmit(p)).cls.includes('btn-primary'));
		assert.equal((await C.refHelpTexts(p)).trim(), '?');
		await closePage(p);
	});
}

for (const [path, name] of [['/', 'home'], ['/reference', 'reference'], [`/characters/${'SHEET'}`, 'sheet']]) {
	test(`srd-licence is 12px muted with 32px above it on ${name}`, async () => {
		const url = BASE + path.replace('SHEET', sheetId);
		const p = await openPage(browser, url, [1024, 768]);
		const l = await C.licenceLook(p);
		assert.equal(l.size, '12px');
		assert.equal(l.color, MUTED);
		assert.ok(l.gap >= 32 - 0.5, `gap ${l.gap}`);
		assert.equal(l.lang, 'en');
		await closePage(p);
	});
}

for (const w of [360, 375]) for (const path of ['/', '/reference']) {
	test(`no sideways scroll at ${w}px on ${path}`, async () => {
		const p = await openPage(browser, BASE + path, [w, 800]);
		assert.ok((await C.sideScroll(p)) <= 0);
		await closePage(p);
	});
}
