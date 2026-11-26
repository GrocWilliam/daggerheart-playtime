import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage } from '../support/browser.mjs';
import { openAs, openSceneMore } from '../support/scenes.mjs';
import { sceneCard, horizontalOverflow } from '../support/buildscenes.mjs';
import * as E from '../support/encounters.mjs';

const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

/** Open the Build step with the scene's details open; returns the page and the first adversary's card. */
async function openCard(counts, opts = {}, which = 0) {
	const enc = await E.encounterWith(BASE, counts);
	const { page } = await openAs(browser, enc.url, opts);
	await openSceneMore(sceneCard(page, E.SCENE_TITLE));
	return { ...enc, page, name: enc.names[which], card: E.adversaryCard(page, enc.names[which]) };
}

test('a card shows the count, a − and a + (btn-ghost, 44px), no number input and no Update', async () => {
	const { page, card } = await openCard([3]);
	try {
		assert.equal(await E.countText(card), '3');
		for (const which of ['minus', 'plus']) {
			const b = E.stepperButton(card, which);
			assert.ok((await E.classesOf(b)).includes('btn-ghost'), `${which} btn-ghost`);
			const box = await E.boxOf(b);
			assert.ok(box.width >= 43.5 && box.height >= 43.5, `${which} ${box.width}x${box.height}`);
		}
		assert.equal(await E.numberInputs(card), 0);
		assert.equal(await E.buttonsNamed(card, 'Update'), 0);
	} finally { await closePage(page); }
});

test('clicking + raises the count, stores it, leaves the others and updates the budget', async () => {
	const { page, card, campaignId, sceneId, ids } = await openCard([3, 2]);
	try {
		await E.clickStepper(card, 'plus');
		await E.waitCountText(card, '4');
		const stored = await E.storedEncounter(BASE, campaignId, sceneId);
		const c = Object.fromEntries(stored.adversaries.map((a) => [a.id, a.count]));
		assert.equal(c[ids[0]], 4);
		assert.equal(c[ids[1]], 2);
		await E.waitBudgetSpent(page, stored.spent);
	} finally { await closePage(page); }
});

test('clicking − lowers the count and stores it', async () => {
	const { page, card, campaignId, sceneId, ids } = await openCard([3]);
	try {
		await E.clickStepper(card, 'minus');
		await E.waitCountText(card, '2');
		assert.equal((await E.storedCounts(BASE, campaignId, sceneId))[ids[0]], 2);
	} finally { await closePage(page); }
});

test('at count 1 − is disabled and + enabled; at count 20 + is disabled', async () => {
	let o = await openCard([1]);
	try {
		assert.equal(await E.isEnabled(E.stepperButton(o.card, 'minus')), false);
		assert.equal(await E.isEnabled(E.stepperButton(o.card, 'plus')), true);
	} finally { await closePage(o.page); }
	o = await openCard([20]);
	try {
		assert.equal(await E.isEnabled(E.stepperButton(o.card, 'plus')), false);
		assert.equal(await E.isEnabled(E.stepperButton(o.card, 'minus')), true);
	} finally { await closePage(o.page); }
});

test('without JavaScript, + reloads on ?step=build and the stored count is 3', async () => {
	const { page, card, campaignId, sceneId, ids } = await openCard([2], { js: false });
	try {
		await Promise.all([page.waitForEvent('load'), E.clickStepper(card, 'plus')]);
		assert.ok(page.url().includes('step=build'), page.url());
		assert.equal((await E.storedCounts(BASE, campaignId, sceneId))[ids[0]], 3);
	} finally { await closePage(page); }
});

test('Remove on the first adversary removes only it; the other keeps its count', async () => {
	const { page, card, campaignId, sceneId, ids, names } = await openCard([3, 4]);
	try {
		await E.removeButton(card).click();
		await E.adversaryCard(page, names[0]).waitFor({ state: 'detached' });
		const c = await E.storedCounts(BASE, campaignId, sceneId);
		assert.equal(c[ids[0]], undefined);
		assert.equal(c[ids[1]], 4);
		assert.equal(await E.countText(E.adversaryCard(page, names[1])), '4');
	} finally { await closePage(page); }
});

for (const viewport of [[375, 812], [1024, 768]]) {
	test(`at ${viewport.join('x')} the −, count, + and Remove sit on one line, Remove 16px after the +`, async () => {
		const { page, card } = await openCard([3], { viewport });
		try {
			const g = await E.rowGeometry(card);
			for (const k of ['count', 'plus', 'remove']) assert.ok(Math.abs(g[k].cy - g.minus.cy) <= 4, `${k} centre ${g[k].cy} vs ${g.minus.cy}`);
			assert.ok(g.remove.left - g.plus.right >= 16 - 0.5, `gap ${g.remove.left - g.plus.right}`);
		} finally { await closePage(page); }
	});
}

for (const [lang, down, up] of [['en', (n) => `One fewer ${n}`, (n) => `One more ${n}`], ['fr', (n) => `Retirer un ${n}`, (n) => `Ajouter un ${n}`]]) {
	test(`the stepper buttons are named for the adversary (${lang})`, async () => {
		const opened = await openCard([3], { lang });
		const { page } = opened;
		try {
			// the card shows the page-language name: read it from the card (single adversary)
			const card = sceneCard(page, E.SCENE_TITLE).getByTestId('encounter-adversary').first();
			const name = lang === 'en' ? opened.name : ((await card.innerText()).split(' ×')[0].trim());
			assert.equal(await E.buttonsNamed(card, down(name)), 1);
			assert.equal(await E.buttonsNamed(card, up(name)), 1);
		} finally { await closePage(page); }
	});
}

test('at 375px the Build step with an open encounter has no sideways scroll', async () => {
	const { page } = await openCard([3, 2], { viewport: [375, 812] });
	try {
		assert.ok((await horizontalOverflow(page)) <= 0);
	} finally { await closePage(page); }
});
