// US-412: client-side filter on /reference, type chips, aligned Filter button.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import * as ref from '../support/reference.mjs';

const BASE = process.env.BASE_URL;
const search = () => import('../../../src/lib/utils/search.ts');

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const open = async (qs = '', lang = 'en', view = [1280, 900]) => {
	const page = await openPage(browser, ref.referenceUrl(BASE, qs), view, { lang });
	await ref.waitForChips(page);
	return page;
};
const poll = async (fn, ms = 2000) => {
	const end = Date.now() + ms;
	for (;;) { try { return await fn(); } catch (e) { if (Date.now() > end) throw e; await new Promise((r) => setTimeout(r, 50)); } }
};

test('fold removes accents and case', async () => {
	const { fold } = await search();
	assert.equal(fold('Élégant Épée'), 'elegant epee');
	assert.equal(fold('BARD'), 'bard');
});

test('matches: empty query, name, accents, line text and a miss', async () => {
	const { matches } = await search();
	assert.equal(matches('', 'Bard', []), true);
	assert.equal(matches('bard', 'Bard', []), true);
	assert.equal(matches('epee', 'Épée longue', []), true);
	assert.equal(matches('grimoire', 'Bard', [{ label: 'Domains', text: 'Grace & Codex — grimoire' }]), true);
	assert.equal(matches('zzz', 'Bard', [{ label: 'x', text: 'y' }]), false);
});

test('typing "bard" filters within 500ms: classes open with Bard, every visible entry contains bard, other sections hidden', async () => {
	const page = await open();
	await ref.typeFilter(page, 'bard');
	await poll(async () => assert.ok(await ref.entryShown(page, 'classes', 'Bard')), 500);
	assert.equal(await ref.section(page, 'classes').evaluate((e) => e.open), true);
	const entries = await ref.visibleEntries(page);
	assert.ok(entries.length > 0);
	for (const e of entries) assert.ok((e.name + ' ' + e.text).toLowerCase().includes('bard'), `${e.name} contains bard`);
	const shown = new Set(await ref.shownSections(page));
	assert.ok(shown.has('classes'));
	const withEntries = new Set(entries.map((e) => e.kind));
	for (const k of await ref.sectionKinds(page)) assert.equal(shown.has(k), withEntries.has(k), `ref-${k} shown only when it has matches`);
	assert.ok(shown.size < (await ref.sectionKinds(page)).length, 'some sections hidden');
	await closePage(page);
});

test('French: a name typed without accents still matches', async () => {
	const page = await open('?lang=fr', 'fr');
	let found;
	for (const kind of ['weapons', 'armors', 'items', 'consumables', 'classes', 'domain-cards']) {
		const list = await ref.srdList(BASE, kind, 'fr');
		const names = list.map((e) => e.name);
		found = names.find((n) => /[éèêàâçôùû]/i.test(n) && names.filter((m) => m === n).length === 1 && n.normalize('NFD') !== n);
		if (found) { found = { kind, name: found }; break; }
	}
	assert.ok(found, 'a French entry with an accent exists');
	const q = found.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
	await ref.typeFilter(page, q);
	await poll(async () => assert.ok(await ref.entryShown(page, found.kind, found.name)), 1000);
	await closePage(page);
});

test('a query typed then cleared shows every section again, unopened ones closed', async () => {
	const page = await open();
	const kinds = await ref.sectionKinds(page);
	await ref.typeFilter(page, 'bard');
	await poll(async () => assert.ok((await ref.shownSections(page)).length < kinds.length), 1000);
	await ref.typeFilter(page, '');
	await poll(async () => assert.deepEqual(await ref.shownSections(page), kinds), 1000);
	assert.deepEqual(await ref.openSections(page), []);
	await closePage(page);
});

test('one chip per section: btn-secondary, aria-pressed=false, 44x44, labelled with the kind', async () => {
	for (const lang of ['en', 'fr']) {
		const page = await open('', lang);
		assert.deepEqual(await ref.chipKinds(page), await ref.sectionKinds(page));
		for (const k of await ref.chipKinds(page)) {
			const c = await ref.chipInfo(page, k);
			assert.equal(c.tag, 'BUTTON'); assert.equal(c.type, 'button');
			assert.match(c.cls, /\bbtn-secondary\b/);
			assert.equal(c.pressed, 'false');
			assert.ok(c.w >= 43.5 && c.h >= 43.5, `${k} ${c.w}x${c.h}`);
			assert.ok(c.text.includes(ref.catalogValue(lang, `reference.kind.${k}`)), `${k}: ${c.text}`);
		}
		await closePage(page);
	}
});

test('chips: pressing shows a union of kinds, pressing again restores all', async () => {
	const page = await open();
	const all = await ref.sectionKinds(page);
	const before = await ref.chipInfo(page, 'weapons');
	await ref.clickChip(page, 'weapons');
	assert.equal((await ref.chipInfo(page, 'weapons')).pressed, 'true');
	assert.notEqual((await ref.chipInfo(page, 'weapons')).bg, before.bg, 'pressed look');
	assert.deepEqual(await ref.shownSections(page), ['weapons']);
	await ref.clickChip(page, 'armors');
	assert.deepEqual(await ref.shownSections(page), all.filter((k) => k === 'weapons' || k === 'armors'));
	await ref.clickChip(page, 'weapons');
	await ref.clickChip(page, 'armors');
	assert.deepEqual(await ref.shownSections(page), all);
	await closePage(page);
});

test('without JavaScript there are no chips and the GET form filters by name on the server', async () => {
	const page = await openPage(browser, ref.referenceUrl(BASE), [1280, 900], { lang: 'en', js: false });
	assert.equal(await ref.chipCount(page), 0);
	await ref.typeFilter(page, 'bard');
	await Promise.all([page.waitForURL(/q=bard/), ref.submitFilter(page)]);
	const entries = await ref.visibleEntries(page);
	assert.ok(entries.length > 0);
	for (const e of entries) assert.ok(e.name.toLowerCase().includes('bard'), `${e.name} matches by name`);
	const direct = await openPage(browser, ref.referenceUrl(BASE, '?kind=&q=bard'), [1280, 900], { lang: 'en', js: false });
	assert.deepEqual((await ref.visibleEntries(direct)).map((e) => e.name), entries.map((e) => e.name));
	assert.equal(await ref.chipCount(direct), 0);
	await closePage(page); await closePage(direct);
});

test('the Filter button is as high as the q input at 375 and 1280, en and fr', async () => {
	for (const lang of ['en', 'fr']) for (const view of [[375, 812], [1280, 900]]) {
		const page = await open('', lang, view);
		const h = await ref.filterHeights(page);
		assert.ok(Math.abs(h.button - h.input) <= 1, `${lang} ${view}: ${h.button} vs ${h.input}`);
		await closePage(page);
	}
});

test('at 1280x900 with every section closed the page is at most 2000px tall', async () => {
	const page = await open();
	assert.deepEqual(await ref.openSections(page), []);
	const h = await ref.pageHeight(page);
	assert.ok(h <= 2000, `scrollHeight ${h}`);
	await closePage(page);
});

test('at 375x812 with a chip pressed and a query typed there is no horizontal scroll', async () => {
	const page = await open('', 'en', [375, 812]);
	await ref.clickChip(page, 'weapons');
	await ref.typeFilter(page, 'bard');
	assert.ok((await ref.sideScroll(page)) <= 0);
	await closePage(page);
});

test('docs/ui.md lists ref-chip-<kind> among the dynamic test ids', () => {
	assert.ok(ref.uiDoc().includes('ref-chip-<kind>'));
});
