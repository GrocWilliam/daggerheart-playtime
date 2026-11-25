import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupCampaignWith, runPage, buildPage, cardOf, partyEntryOf, textOf, elementsHolding, apiClass } from '../support/dmclass.mjs';

const base = process.env.BASE_URL;
const whole = (t, w) => new RegExp(`(^|[^\\p{L}])${w}($|[^\\p{L}])`, 'u').test(t);
let bard, wand;
before(async () => {
	bard = await setupCampaignWith(base, 'Bard', 'Zelda Lyre');
	wand = await setupCampaignWith(base, 'Wanderer', 'Odo Roamer');
});

test('French Run card shows Barde, not Bard', async () => {
	const t = textOf(cardOf(await runPage(base, bard.campaignId, 'fr'), 'Zelda Lyre'));
	assert.match(t, /Barde/);
	assert.equal(whole(t, 'Bard'), false);
});

test('French Build party entry shows Barde', async () => {
	assert.match(textOf(partyEntryOf(await buildPage(base, bard.campaignId, 'fr'), 'Zelda Lyre')), /Barde/);
});

test('English pages show Bard and the level', async () => {
	for (const [html, fn] of [[await runPage(base, bard.campaignId), cardOf], [await buildPage(base, bard.campaignId), partyEntryOf]]) {
		const t = textOf(fn(html, 'Zelda Lyre'));
		assert.equal(whole(t, 'Bard'), true);
		assert.match(t, /2/);
	}
});

test('non-SRD class is shown as stored', async () => {
	for (const lang of ['fr', 'en']) {
		assert.match(textOf(cardOf(await runPage(base, wand.campaignId, lang), 'Odo Roamer')), /Wanderer/);
		assert.match(textOf(partyEntryOf(await buildPage(base, wand.campaignId, lang), 'Odo Roamer')), /Wanderer/);
	}
});

test('lang attributes on the class name', async () => {
	for (const fn of [(h) => cardOf(h, 'Zelda Lyre'), (h) => partyEntryOf(h, 'Zelda Lyre')]) {
		const pages = [await runPage(base, bard.campaignId, 'fr'), await buildPage(base, bard.campaignId, 'fr')];
		for (const p of pages) {
			let chunk; try { chunk = fn(p); } catch { continue; }
			const els = elementsHolding(chunk, 'Barde');
			if (els.length) assert.ok(els.every((a) => /lang="fr"/.test(a)));
		}
	}
	const fr = elementsHolding(cardOf(await runPage(base, bard.campaignId, 'fr'), 'Zelda Lyre'), 'Barde');
	assert.ok(fr.length > 0 && fr.every((a) => /lang="fr"/.test(a)), 'Barde in lang=fr element');
	const frB = elementsHolding(partyEntryOf(await buildPage(base, bard.campaignId, 'fr'), 'Zelda Lyre'), 'Barde');
	assert.ok(frB.length > 0 && frB.every((a) => /lang="fr"/.test(a)));
	for (const [html, fn] of [[await runPage(base, bard.campaignId), cardOf], [await buildPage(base, bard.campaignId), partyEntryOf]]) {
		const els = elementsHolding(fn(html, 'Zelda Lyre'), 'Bard');
		assert.ok(els.length > 0, 'Bard in its own element');
		assert.ok(els.every((a) => !/lang="(?!en")/.test(a)), 'lang, if any, is en on the English page');
	}
});

test('stored class is unchanged', async () => {
	await runPage(base, bard.campaignId, 'fr');
	await buildPage(base, bard.campaignId, 'fr');
	assert.equal(await apiClass(base, bard.characterId), 'Bard');
});
