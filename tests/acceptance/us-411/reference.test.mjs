// US-411: /reference sections and entries are native <details>; entry lines render inline through SrdLines.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { sheetUrl } from '../support/pages.mjs';
import * as ref from '../support/reference.mjs';
import * as help from '../support/help.mjs';

const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const fmt = (lang, n) => norm(new Intl.NumberFormat(lang).format(n));
const hasNumber = (text, n) => new RegExp(`(^|[^\\d])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\d]|$)`).test(norm(text));
const MIN = 43.5; // 44px target, sub-pixel tolerance

let browser, hero;
before(async () => {
	browser = await launchBrowser();
	const camp = await createCampaign(BASE, 'Reference 411');
	hero = await createCharacter(BASE, camp, 'Wren', { class: 'Bard' });
	const r = await fetch(`${BASE}/api/characters/${hero}/cards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId: 'core_domain_card_a_soldiers_bond' }) });
	assert.equal(r.status, 201, 'card added');
});
after(async () => { await browser?.close(); });

// "Given GET /reference": the server-rendered page, read with JavaScript disabled (no hydration, no client change).
const getReference = (lang, qs = '', view = [1280, 900]) => openPage(browser, ref.referenceUrl(BASE, qs), view, { lang, js: false });

// ---------------------------------------------------------------- sections

test('GET /reference (en): every ref-<kind> section is a <details> without open, its summary shows the kind name and its entry count', async () => {
	const page = await getReference('en');
	for (const kind of ref.REF_KINDS) {
		const s = await ref.sectionState(page, kind);
		assert.ok(s, `ref-${kind} present`);
		assert.equal(s.tag, 'DETAILS', `ref-${kind} is a <details>`);
		assert.equal(s.hasOpenAttr, false, `ref-${kind} has no open attribute`);
		assert.ok(s.summary?.includes(ref.catalogValue('en', `reference.kind.${kind}`)), `ref-${kind} summary "${s.summary}" shows the kind name`);
		const n = await ref.entryCount(page, kind);
		assert.ok(n > 0, `ref-${kind} has entries`);
		assert.ok(hasNumber(s.summary, fmt('en', n)), `ref-${kind} summary "${s.summary}" shows its count ${n}`);
	}
	const classes = await ref.sectionState(page, 'classes');
	assert.ok(classes.summary.includes('Classes'), classes.summary);
	await closePage(page);
});

test('GET /reference (en): a filtered section counts only the entries it shows', async () => {
	const page = await getReference('en', '?kind=weapons&q=sword');
	const s = await ref.sectionState(page, 'weapons');
	const n = await ref.entryCount(page, 'weapons');
	assert.ok(n > 0 && n < (await ref.srdList(BASE, 'weapons', 'en')).length, `filtered count ${n}`);
	assert.ok(hasNumber(s.summary, fmt('en', n)), `summary "${s.summary}" shows ${n}`);
	await closePage(page);
});

test('GET /reference?lang=fr: ref-classes summary shows "Classes" and the count in French number formatting; the count wording differs from English', async () => {
	const fr = await getReference('fr', '?lang=fr');
	const en = await getReference('en', '?lang=en');
	const sFr = await ref.sectionState(fr, 'classes');
	const sEn = await ref.sectionState(en, 'classes');
	assert.equal(sFr.tag, 'DETAILS');
	assert.equal(sFr.hasOpenAttr, false);
	assert.ok(sFr.summary.includes('Classes'), sFr.summary);
	const n = await ref.entryCount(fr, 'classes');
	assert.ok(hasNumber(sFr.summary, fmt('fr', n)), `fr summary "${sFr.summary}" shows ${fmt('fr', n)}`);
	assert.notEqual(sFr.summary, sEn.summary, 'the count wording differs between fr and en');
	for (const kind of ref.REF_KINDS) {
		const s = await ref.sectionState(fr, kind);
		assert.ok(s.summary.includes(ref.catalogValue('fr', `reference.kind.${kind}`)), `fr ref-${kind}: "${s.summary}"`);
		assert.ok(hasNumber(s.summary, fmt('fr', await ref.entryCount(fr, kind))), `fr ref-${kind} count: "${s.summary}"`);
	}
	await closePage(fr);
	await closePage(en);
});

test('catalog: reference.count exists in en and fr with different values', () => {
	const en = ref.catalogKeys('en', 'reference.count'), fr = ref.catalogKeys('fr', 'reference.count');
	assert.ok(Object.keys(en).length > 0, 'reference.count (or its plural forms) in en.json');
	assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), 'same keys in fr.json');
	for (const k of Object.keys(en)) assert.notEqual(en[k], fr[k], `${k}: en and fr differ`);
});

// ---------------------------------------------------------------- entries

for (const lang of ['en', 'fr']) {
	test(`GET /reference (${lang}): each ref-item holds a <details> whose summary has the entry name with its lang; no help-open on the page`, async () => {
		const page = await getReference(lang);
		for (const kind of ref.REF_KINDS) {
			const entries = await ref.entrySummaries(page, kind);
			const srd = await ref.srdList(BASE, kind, lang);
			assert.equal(entries.length, srd.length, `${kind}: one entry per SRD element`);
			entries.forEach((e, i) => assert.ok(e.details && e.summary !== null, `${kind}[${i}] has <details><summary>`));
			for (const el of srd) {
				assert.ok(entries.some((e) => e.named.some((x) => x.text === el.name && x.lang === el.nameLang)),
					`${kind} ${el.id}: a summary holds "${el.name}" with lang="${el.nameLang}"`);
			}
		}
		assert.equal(await ref.helpOpenCount(page), 0, 'no help-open on /reference');
		await closePage(page);
	});
}

// ---------------------------------------------------------------- opening (browser)

test('(browser) 1280x900: clicking ref-classes opens its entries and no other section; clicking Bard shows its lines inline', async () => {
	const page = await openPage(browser, ref.referenceUrl(BASE), [1280, 900], { lang: 'en' });
	assert.deepEqual(await ref.openSections(page), [], 'all sections closed on load');
	assert.equal(await ref.entriesVisible(page, 'classes'), false, 'classes entries hidden on load');
	await ref.openSection(page, 'classes');
	assert.equal(await ref.entriesVisible(page, 'classes'), true, 'classes entries visible');
	assert.deepEqual(await ref.openSections(page), ['classes'], 'other sections stay closed');
	const bard = ref.englishSrd('core/classes', 'core_class_bard');
	const desc = norm(bard.description[0].paragraph['en-US']);
	const hope = bard.hopeFeature.name['en-US'];
	const hidden = await ref.entryLines(page, 'classes', 'Bard');
	assert.ok(hidden.every((l) => !l.visible), 'Bard lines hidden before its summary is clicked');
	await ref.openEntry(page, 'classes', 'Bard');
	assert.equal(await ref.entryOpen(page, 'classes', 'Bard'), true);
	const lines = await ref.entryLines(page, 'classes', 'Bard');
	assert.ok(lines.some((l) => l.visible && l.text.includes(desc)), `Bard description line visible: ${JSON.stringify(lines.map((l) => l.text.slice(0, 40)))}`);
	assert.ok(lines.some((l) => l.visible && l.text.includes(hope)), `Bard Hope feature line (${hope}) visible`);
	const text = await ref.entryText(page, 'classes', 'Bard');
	assert.ok(text.startsWith('Bard'), `the name comes first: "${text.slice(0, 40)}"`);
	assert.ok(text.includes(desc), 'the description is shown under the name');
	assert.deepEqual(await ref.openSections(page), ['classes']);
	await closePage(page);
});

test('(browser) French: an opened adversary shows lang="fr" on translated text and lang="en" on untranslated text', async () => {
	const id = 'adv_acid_burrower';
	const en = ref.englishSrd('adversaries', id), fr = ref.frenchOverlay('adversaries', id);
	assert.ok(fr?.name, 'French overlay of adv_acid_burrower');
	const page = await openPage(browser, ref.referenceUrl(BASE, '?lang=fr'), [1280, 900], { lang: 'fr' });
	await ref.openSection(page, 'adversaries');
	await ref.openEntry(page, 'adversaries', fr.name);
	const lines = await ref.entryLines(page, 'adversaries', fr.name);
	assert.ok(lines.length >= 3 && lines.every((l) => l.visible), `visible inline lines: ${JSON.stringify(lines)}`);
	assert.ok(lines.every((l) => l.lang === 'fr' || l.lang === 'en'), JSON.stringify(lines));
	const nameLangs = await ref.entryLangsOf(page, 'adversaries', fr.name, fr.name);
	assert.ok(nameLangs.length > 0 && nameLangs.every((l) => l === 'fr'), `name langs ${JSON.stringify(nameLangs)}`);
	// facts line in the page language
	assert.equal(lines[0].lang, 'fr', `facts line ${JSON.stringify(lines[0])}`);
	const expect = async (text, lang) => {
		const got = await ref.entryLangsOf(page, 'adversaries', fr.name, norm(text));
		assert.ok(got.length > 0 && got.every((l) => l === lang), `"${text.slice(0, 40)}" should be lang="${lang}": ${JSON.stringify(got)}`);
	};
	for (const f of ['description', 'motives_and_tactics', 'attack', 'experience']) {
		if (!en[f]) continue;
		if (fr[f]) await expect(fr[f], 'fr');
		else await expect(en[f], 'en');
	}
	for (const [i, f] of (en.feature ?? []).entries()) {
		if (fr.feature?.[i]?.name) await expect(fr.feature[i].name, 'fr');
		else await expect(f.name, 'en');
	}
	await closePage(page);
});

test('(browser) without JavaScript: clicking a section summary then an entry summary shows the entry text', async () => {
	const page = await openPage(browser, ref.referenceUrl(BASE), [1280, 900], { lang: 'en', js: false });
	const desc = norm(ref.englishSrd('core/classes', 'core_class_bard').description[0].paragraph['en-US']);
	await ref.openSection(page, 'classes');
	assert.equal(await ref.entriesVisible(page, 'classes'), true, 'entries visible without JavaScript');
	await ref.openEntry(page, 'classes', 'Bard');
	const lines = await ref.entryLines(page, 'classes', 'Bard');
	assert.ok(lines.some((l) => l.visible && l.text.includes(desc)), 'Bard text shown without JavaScript');
	await closePage(page);
});

for (const view of [[375, 812], [1280, 900]]) {
	test(`(browser) ${view[0]}x${view[1]}: every section and entry summary is at least 44px high; no horizontal scroll`, async () => {
		const page = await openPage(browser, ref.referenceUrl(BASE), view, { lang: 'en' });
		assert.ok((await ref.sideScroll(page)) <= 0, 'no sideways scroll with sections closed');
		const closed = await ref.summaryHeights(page);
		assert.equal(closed.sections.length, ref.REF_KINDS.length, 'one summary per section');
		for (const s of closed.sections) assert.ok(s.h >= MIN, `${s.kind} summary ${s.h}px`);
		await ref.openAllSections(page);
		const { sections, entries } = await ref.summaryHeights(page);
		for (const s of sections) assert.ok(s.h >= MIN, `${s.kind} summary ${s.h}px (open)`);
		assert.ok(entries.length > 500, `entry summaries visible: ${entries.length}`);
		const small = entries.filter((e) => e.h < MIN);
		assert.deepEqual(small.slice(0, 5), [], `${small.length} entry summaries under 44px`);
		await ref.openEntry(page, 'classes', 'Bard');
		assert.ok((await ref.sideScroll(page)) <= 0, 'no sideways scroll with every section and an entry open');
		await closePage(page);
	});
}

// ---------------------------------------------------------------- Help on the sheet

test('(browser) character sheet: a tracker help-open opens its help-panel with its text', async () => {
	const page = await openPage(browser, sheetUrl(BASE, hero, 'play'), [1280, 900], { lang: 'en' });
	assert.equal(await help.openHelp(page, 'hp'), true, 'hp help-panel opens');
	const text = await help.helpPanelText(page, 'hp');
	const glossary = JSON.parse(read('src/lib/srd/glossary.json')).find((g) => g.id === 'hp');
	assert.ok(text.includes(norm(glossary.en)), `hp panel text: "${text}"`);
	await closePage(page);
});

for (const lang of ['en', 'fr']) {
	test(`(browser) character sheet (${lang}): a domain card help-panel shows its SRD lines, each in its own lang`, async () => {
		const id = 'core_domain_card_a_soldiers_bond';
		const page = await openPage(browser, sheetUrl(BASE, hero, 'cards'), [1280, 900], { lang });
		assert.equal(await help.openHelp(page, id), true, 'card help-panel opens');
		const lines = await help.helpPanelLines(page, id);
		assert.ok(lines.length >= 2 && lines.every((l) => l.visible), JSON.stringify(lines));
		assert.equal(lines[0].lang, lang, `facts line in the page language: ${JSON.stringify(lines[0])}`);
		for (const k of ['srd.help.level', 'srd.help.recallCost']) assert.ok(lines[0].text.includes(ref.catalogValue(lang, k)), `facts line shows ${k}`);
		const feature = lang === 'en'
			? ref.englishSrd('core/domain-cards', id).features[0].description[0].paragraph['en-US']
			: ref.frenchOverlay('domain-cards', id).features[0].description[0].paragraph;
		assert.ok(lines.some((l) => l.lang === lang && l.text.includes(norm(feature))), `feature text with lang="${lang}"`);
		await closePage(page);
	});
}

// ---------------------------------------------------------------- repository

test('repository: SrdLines.svelte exists with inline-level markup, Help.svelte imports it, Reference uses it and no Help; docs describe closed-by-default disclosures', () => {
	assert.ok(existsSync(new URL('../../../src/lib/components/SrdLines.svelte', import.meta.url)), 'src/lib/components/SrdLines.svelte exists');
	const lines = read('src/lib/components/SrdLines.svelte');
	assert.match(lines, /\blines\b/, 'SrdLines takes lines');
	for (const tag of ['div', 'p', 'ul', 'ol', 'li', 'details', 'section', 'table', 'h1', 'h2', 'h3', 'h4'])
		assert.ok(!new RegExp(`<${tag}[\\s>]`).test(lines), `SrdLines uses inline-level markup only (found <${tag}>)`);
	assert.match(read('src/lib/components/Help.svelte'), /import\s+SrdLines\s+from\s+['"][^'"]*SrdLines\.svelte['"]/, 'Help.svelte imports SrdLines');
	const page = read('src/routes/reference/+page.svelte');
	assert.match(page, /import\s+SrdLines\s+from\s+['"][^'"]*SrdLines\.svelte['"]/, 'Reference uses SrdLines');
	assert.ok(!/Help\.svelte|<Help[\s/>]/.test(page), 'Reference no longer uses Help');
	const ui = read('docs/ui.md');
	assert.ok(ui.includes('SrdLines'), 'docs/ui.md describes SrdLines');
	assert.ok(ui.split('\n').some((l) => /reference/i.test(l) && /<details>|details/.test(l) && /closed/i.test(l)),
		'a Reference line of docs/ui.md describes sections and entries as closed-by-default <details>');
	assert.ok(read('CLAUDE.md').includes('SrdLines'), 'CLAUDE.md names SrdLines');
});
