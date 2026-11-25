// US-375: the character sheet has no back link above its h1. HTTP only: no browser.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { SHEET_TABS, fetchSheetHtml, anchorsBeforeH1, elementAfterH1, campaignLinks, hasTestId, htmlLang } from '../support/sheet.mjs';

const BASE = process.env.BASE_URL;
let campaignId;
let characterId;

before(async () => {
	campaignId = await createCampaign(BASE, 'Back link camp');
	characterId = await createCharacter(BASE, campaignId, 'Sable');
});

test('given a character in a campaign, GET /characters/<id> has no "← Campaign" text and exactly one link to the campaign, the campaign-run-link', async () => {
	const html = await fetchSheetHtml(BASE, characterId);
	assert.equal(htmlLang(html), 'en');
	assert.ok(!html.includes('← Campaign'), 'the back link is still there');
	const links = campaignLinks(html, campaignId);
	assert.equal(links.length, 1);
	assert.match(links[0], /data-testid="campaign-run-link"/);
});

test('given the same character in French, GET /characters/<id> has no "← Campagne" text and still has the campaign-run-link', async () => {
	const html = await fetchSheetHtml(BASE, characterId, { lang: 'fr' });
	assert.equal(htmlLang(html), 'fr', 'the French page was not served');
	assert.ok(!html.includes('← Campagne'), 'the French back link is still there');
	assert.ok(hasTestId(html, 'campaign-run-link'));
});

for (const tab of SHEET_TABS) {
	test(`given the character on the ${tab} tab, no link appears before the h1 and the divider directly follows the h1`, async () => {
		const html = await fetchSheetHtml(BASE, characterId, { tab });
		assert.deepEqual(anchorsBeforeH1(html), []);
		assert.match(elementAfterH1(html), /data-testid="divider"/);
	});
}

test('given the catalogs, neither en.json nor fr.json has a character.back key', () => {
	for (const file of ['en.json', 'fr.json']) {
		const catalog = JSON.parse(readFileSync(new URL(`../../../src/lib/i18n/${file}`, import.meta.url), 'utf8'));
		assert.ok(!('character.back' in catalog), `${file} still has character.back`);
	}
});
