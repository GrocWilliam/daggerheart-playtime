import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { runStepUrl, sheetUrl } from '../support/pages.mjs';
import * as help from '../support/help.mjs';

const BASE = process.env.BASE_URL;
const VIEWS = [[375, 812], [1024, 768]];
const LANGS = ['en', 'fr'];
const TRACKER_KEYS = ['hp', 'stress', 'hope', 'armor'];
const TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

let browser, campaign, hero, ranger, subclass;
before(async () => {
	browser = await launchBrowser();
	campaign = await createCampaign(BASE, 'Labelled helpers');
	hero = await createCharacter(BASE, campaign, 'Rook', { level: 2 });
	const put = (path, body, method = 'PUT') => fetch(`${BASE}/api/characters/${hero}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	assert.equal((await put('/conditions', { vulnerable: true, restrained: true, hidden: true })).status, 200);
	subclass = help.SUBCLASSES.filter((s) => s.class === 'RANGER')[0];
	ranger = await createCharacter(BASE, campaign, 'Briar', { class: 'Ranger', level: 2 });
	const r = await fetch(`${BASE}/api/characters/${ranger}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subclass: subclass.id }) });
	assert.equal(r.status, 200);
});
after(async () => { await browser?.close(); });

const open = (url, view, lang, opts = {}) => openPage(browser, url, view, { lang, ...opts });

test('play tab: no helper reads "?", and hp, stress, hope, armor, Evasion and Thresholds read their label (375 and 1024, en and fr)', async () => {
	for (const view of VIEWS) for (const lang of LANGS) {
		const page = await open(sheetUrl(BASE, hero, 'play'), view, lang);
		const where = `${lang} ${view[0]}px`;
		const texts = await help.helpTexts(page);
		assert.ok(texts.length > 0, `${where}: helpers present`);
		assert.deepEqual(texts.filter((t) => t === '?'), [], `${where}: no "?" helper`);
		const want = { hp: 'tracker.hp', stress: 'tracker.stress', hope: 'tracker.hope', armor: 'tracker.armor', evasion: 'stat.evasion', thresholds: 'stat.thresholds' };
		for (const [id, key] of Object.entries(want)) assert.equal(await help.helpTextOf(page, id), help.label(lang, key), `${where}: ${id}`);
		assert.equal(await help.helpTextOf(page, 'hp'), lang === 'en' ? 'HP' : help.label('fr', 'tracker.hp'));
		await closePage(page);
	}
});

test('Run step: no helper in a character card reads "?", and the Fear helper reads the Fear label', async () => {
	for (const lang of LANGS) {
		const page = await open(runStepUrl(BASE, campaign), [1024, 768], lang);
		const cards = help.runCards(page);
		assert.ok(await cards.count() >= 1, 'cards');
		for (let i = 0; i < await cards.count(); i++) {
			const texts = await help.helpTexts(page, cards.nth(i));
			assert.ok(texts.length > 0, `${lang} card ${i}: helpers`);
			assert.deepEqual(texts.filter((t) => t === '?'), [], `${lang} card ${i}`);
		}
		assert.equal(await help.helpTextOf(page, 'fear'), help.label(lang, 'campaign.fear'), `${lang} fear`);
		await closePage(page);
	}
});

test('a labelled helper is dotted-underlined, at least 44x44, and named "Help: <name>" / "Aide : <nom>"', async () => {
	for (const lang of LANGS) {
		const page = await open(sheetUrl(BASE, hero, 'play'), [375, 812], lang);
		const looks = await help.helpLooks(page);
		assert.ok(looks.length >= 6, 'helpers present');
		for (const l of looks) {
			assert.ok(l.line.includes('underline'), `${lang} ${l.text}: line ${l.line}`);
			assert.equal(l.style, 'dotted', `${lang} ${l.text}`);
			assert.ok(l.w >= 43.99 && l.h >= 43.99, `${lang} ${l.text}: ${l.w}x${l.h}`);
			assert.ok(l.aria.startsWith(lang === 'fr' ? 'Aide : ' : 'Help: ') && l.aria.length > 7, `${lang} aria ${l.aria}`);
		}
		const hp = looks.find((l) => l.text === help.label(lang, 'tracker.hp'));
		assert.equal(hp.aria, help.helpAria(lang, help.label(lang, 'tracker.hp')));
		await closePage(page);
	}
});

test('a tracker form shows its label text exactly once', async () => {
	for (const lang of LANGS) {
		const page = await open(sheetUrl(BASE, hero, 'play'), [1024, 768], lang);
		for (const k of TRACKER_KEYS) {
			const name = help.label(lang, `tracker.${k}`);
			const text = await help.visibleText(help.trackerForm(page, k));
			assert.equal(text.split(name).length - 1, 1, `${lang} ${k}: "${name}" in "${text}"`);
		}
		await closePage(page);
	}
});

test('traits tab: each trait row helper reads the trait name in the page language', async () => {
	for (const lang of LANGS) {
		const page = await open(sheetUrl(BASE, hero, 'traits'), [1024, 768], lang);
		for (const k of TRAITS) {
			const row = help.traitRow(page, k);
			assert.equal(await row.count(), 1, `${k} row`);
			assert.deepEqual(await help.helpTexts(page, row), [help.label(lang, `trait.${k}`)], `${lang} ${k}`);
		}
		await closePage(page);
	}
});

test('a character with a subclass: the helper inside subclass shows the subclass name', async () => {
	for (const lang of LANGS) {
		const page = await open(sheetUrl(BASE, ranger, 'play'), [1024, 768], lang);
		const scope = page.locator('[data-testid="subclass"]');
		assert.equal(await scope.count(), 1);
		assert.deepEqual(await help.helpTexts(page, scope), [help.subclassName(subclass, lang)], lang);
		await closePage(page);
	}
});

test('/reference: every helper still reads "?"', async () => {
	const page = await open(`${BASE}/reference`, [1024, 768], 'en');
	const texts = await help.helpTexts(page);
	assert.ok(texts.length > 0, 'helpers present');
	assert.deepEqual(texts.filter((t) => t !== '?'), []);
	await closePage(page);
});

test('without JavaScript, clicking the HP helper opens its panel', async () => {
	const page = await open(sheetUrl(BASE, hero, 'play'), [1024, 768], 'en', { js: false });
	assert.equal(await help.helpTextOf(page, 'hp'), 'HP');
	assert.equal(await help.openHelp(page, 'hp'), true);
	await closePage(page);
});
