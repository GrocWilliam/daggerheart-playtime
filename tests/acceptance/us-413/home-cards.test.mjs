// US-413: Home cards are one whole-card link with a characters / scene / last-journal line.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter, addJournalEntry } from '../support/api.mjs';
import { homeUrl } from '../support/pages.mjs';
import * as H from '../support/homecards.mjs';

const BASE = process.env.BASE_URL;
let ids = {}, browser;
const meta = async (key, lang) => {
	const { html } = await H.fetchHome(BASE, lang);
	const cards = H.cardFor(html, ids[key]);
	assert.equal(cards.length, 1, `one campaign-link for ${key}`);
	return H.cardMeta(cards[0]);
};

before(async () => {
	// Empty state first (criterion: no campaigns).
	const empty = await H.fetchHome(BASE);
	ids.emptyStatus = empty.status; ids.emptyHtml = empty.html;

	ids.fog = await createCampaign(BASE, 'Fog of Fate');
	await createCharacter(BASE, ids.fog, 'Aria'); await createCharacter(BASE, ids.fog, 'Bram');
	await H.createScene(BASE, ids.fog, 'The Bridge', 'current');
	await addJournalEntry(BASE, ids.fog, 'We crossed the bridge');
	ids.todayAtSetup = H.mediumDate('en', new Date());

	ids.bare = await createCampaign(BASE, 'Bare Camp');
	await createCharacter(BASE, ids.bare, 'Solo');

	ids.none = await createCampaign(BASE, 'Nobody Camp');
	await H.createScene(BASE, ids.none, 'Upcoming Scene One');
	await H.createScene(BASE, ids.none, 'Finished Scene Two', 'done');

	ids.two = await createCampaign(BASE, 'Journal Camp');
	const old = await addJournalEntry(BASE, ids.two, 'old entry');
	const recent = await addJournalEntry(BASE, ids.two, 'new entry');
	H.setJournalAge(old.id, 40); H.setJournalAge(recent.id, 3);
	ids.newer = H.mediumDate('en', H.daysAgoDate(3)); ids.older = H.mediumDate('en', H.daysAgoDate(40));

	ids.c3 = await createCampaign(BASE, 'Third Camp');
	ids.char = await createCharacter(BASE, ids.c3, 'Cleo');
	browser = await launchBrowser();
});
after(async () => { await browser?.close(); });

test('no campaigns: GET / answers 200 with the create form and no campaign-link', () => {
	assert.equal(ids.emptyStatus, 200);
	assert.ok(H.hasTestId(ids.emptyHtml, 'new-campaign'));
	assert.ok(!H.hasTestId(ids.emptyHtml, 'campaign-link'));
});

test('a card has exactly one link, campaign-link, holding campaign-name and campaign-meta with characters, scene and today\'s date separated by " · "', async () => {
	const { html } = await H.fetchHome(BASE, 'en');
	assert.equal(H.linksToCampaign(html, ids.fog), 1);
	const [a] = H.cardFor(html, ids.fog);
	assert.equal(H.cardName(a), 'Fog of Fate');
	const m = H.cardMeta(a);
	assert.ok(m, 'campaign-meta inside the link');
	const today = ids.todayAtSetup; // taken at setup so a midnight crossing during the run cannot differ
	assert.ok(m.includes('2 characters'), m);
	assert.equal(m, `2 characters · The Bridge · ${today}`);
});

test('1 character, no scene, no journal: "1 character · No current scene" with no trailing separator', async () => {
	assert.equal(await meta('bare', 'en'), '1 character · No current scene');
});

test('the same campaign in French: "1 personnage · Aucune scène en cours"', async () => {
	assert.equal(await meta('bare', 'fr'), '1 personnage · Aucune scène en cours');
});

test('0 characters and no scene is current: starts with "0 characters" and shows "No current scene"', async () => {
	const m = await meta('none', 'en');
	assert.ok(m.startsWith('0 characters'), m);
	assert.ok(m.includes('No current scene'), m);
	assert.ok(!m.includes('Upcoming Scene One') && !m.includes('Finished Scene Two'), m);
});

test('two journal entries on different dates: campaign-meta shows the newer date only', async () => {
	const m = await meta('two', 'en');
	assert.ok(m.includes(ids.newer), m);
	assert.ok(!m.includes(ids.older), m);
});

test('Home has no campaign-run-link, the character sheet still has one', async () => {
	for (const lang of ['en', 'fr']) assert.ok(!H.hasTestId((await H.fetchHome(BASE, lang)).html, 'campaign-run-link'));
	const html = await (await fetch(`${BASE}/characters/${ids.char}`)).text();
	assert.ok(H.hasTestId(html, 'campaign-run-link'));
});

for (const [vp, cols] of [[[375, 812], 1], [[768, 1024], 2], [[1024, 768], 3]]) {
	test(`(browser) ${vp[0]}x${vp[1]}: campaign-link fills the card, is >= 44px, whole card clickable, ${cols} column(s)`, async () => {
		const p = await openPage(browser, homeUrl(BASE), vp);
		const boxes = await H.homeCardBoxes(p);
		assert.ok(boxes.length >= 3);
		for (const b of boxes) {
			assert.equal(b.display === 'block' || b.display === 'flex' || b.display === 'grid', true, `display ${b.display}`);
			assert.ok(b.h >= 44, `h ${b.h}`);
			for (const [x, y] of [[b.l, b.cl], [b.r, b.cr], [b.t, b.ct], [b.b, b.cb]]) assert.ok(Math.abs(x - y) <= 1, `${x} vs ${y}`);
		}
		assert.equal(new Set(boxes.slice(0, 3).map((b) => Math.round(b.l))).size, cols);
		if (vp[0] === 375) assert.ok((await H.sideScroll(p)) <= 0);
		const href = `/campaigns/${ids.fog}`;
		await H.clickMeta(p, href);
		await p.waitForURL(`**${href}`);
		await p.goBack();
		await p.waitForURL((u) => u.pathname === '/');
		await p.waitForLoadState('load');
		await H.clickCardCorner(p, href);
		await p.waitForURL(`**${href}`);
		await closePage(p);
	});
}

test('(browser) campaign-meta is muted and smaller than campaign-name', async () => {
	const p = await openPage(browser, homeUrl(BASE), [1024, 768]);
	const l = await H.metaLooks(p, `/campaigns/${ids.fog}`);
	assert.equal(l.color, l.muted);
	assert.ok(l.metaSize < l.nameSize, `${l.metaSize} vs ${l.nameSize}`);
	await closePage(p);
});

test('docs/ui.md lists campaign-meta and its Home line no longer names campaign-run-link', () => {
	const doc = readFileSync(new URL('../../../docs/ui.md', import.meta.url), 'utf8');
	assert.ok(doc.includes('campaign-meta'));
	const homeLines = doc.split('\n').filter((l) => /^- Home\b/.test(l) || /^- Home `\/`/.test(l));
	assert.ok(homeLines.length >= 1);
	for (const l of homeLines) assert.ok(!l.includes('campaign-run-link'), l);
});
