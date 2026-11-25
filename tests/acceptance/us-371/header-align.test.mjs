import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage } from '../support/browser.mjs';
import { createCampaign } from '../support/api.mjs';
import { buildStepUrl, createScene, scenesOf, openAs } from '../support/scenes.mjs';
import { setCurrent, headerBoxes, statusButtonBoxes, horizontalOverflow, pressSceneButton, buttonVisible, clickEditLink, waitEditDialogOpen, editDialogOpen } from '../support/buildscenes.mjs';

const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

const sameLine = (a, b) => a.top < b.bottom && b.top < a.bottom;
const VIEWPORTS = [[375, 812], [1280, 900]];

async function plannedScene() {
	const campaignId = await createCampaign(BASE, 'Align');
	const scene = await createScene(BASE, campaignId, 'Plan');
	return { campaignId, scene };
}
async function currentScene() {
	const { campaignId, scene } = await plannedScene();
	await setCurrent(BASE, campaignId, scene.id);
	return { campaignId, scene };
}

for (const vp of VIEWPORTS) {
	test(`the edit link's top is within 1px of Set current's top on a scene neither current nor done (${vp.join('x')})`, async () => {
		const { campaignId } = await plannedScene();
		const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: vp });
		try {
			const { edit, button } = await headerBoxes(page, 'Plan', 'Set current');
			assert.ok(edit && button, 'edit link and Set current are shown');
			if (vp[0] >= 1280) assert.ok(sameLine(edit, button), 'on one line at 1280px');
			if (sameLine(edit, button)) assert.ok(Math.abs(edit.top - button.top) <= 1, `edit top ${edit.top} vs button top ${button.top}`);
		} finally { await closePage(page); }
	});
}

test('the edit link\'s top is within 1px of Mark done\'s top on the current scene (1280x900)', async () => {
	const { campaignId } = await currentScene();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1280, 900] });
	try {
		const { edit, button } = await headerBoxes(page, 'Plan', 'Mark done');
		assert.ok(edit && button, 'edit link and Mark done are shown');
		assert.ok(sameLine(edit, button), 'on one line');
		assert.ok(Math.abs(edit.top - button.top) <= 1, `edit top ${edit.top} vs button top ${button.top}`);
	} finally { await closePage(page); }
});

for (const vp of VIEWPORTS) {
	for (const [name, make] of [['planned', plannedScene], ['current', currentScene]]) {
		test(`the edit link and the status buttons are at least 44x44 and the page does not scroll sideways (${name} scene, ${vp.join('x')})`, async () => {
			const { campaignId } = await make();
			const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: vp });
			try {
				const { edit } = await headerBoxes(page, 'Plan', 'Set current');
				assert.ok(edit.width >= 43.5 && edit.height >= 43.5, `edit link ${edit.width}x${edit.height}`);
				const buttons = await statusButtonBoxes(page, 'Plan');
				assert.ok(buttons.length >= 1, 'a status button is shown');
				for (const b of buttons) assert.ok(b.width >= 43.5 && b.height >= 43.5, `${b.label} ${b.width}x${b.height}`);
				assert.ok((await horizontalOverflow(page)) <= 0, 'no sideways scroll');
			} finally { await closePage(page); }
		});
	}
}

test('the edit link still opens the scene edit dialog', async () => {
	const { campaignId } = await plannedScene();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1280, 900] });
	try {
		assert.equal(await editDialogOpen(page), false);
		await clickEditLink(page, 'Plan');
		await waitEditDialogOpen(page);
		assert.equal(await editDialogOpen(page), true);
	} finally { await closePage(page); }
});

test('Set current still marks the scene current', async () => {
	const { campaignId, scene } = await plannedScene();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1280, 900] });
	try {
		await pressSceneButton(page, 'Plan', 'Set current');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=scene] button')].some((b) => b.textContent.trim() === 'Mark done'));
		assert.equal(await buttonVisible(page, 'Plan', 'Mark done'), true);
		const stored = (await scenesOf(BASE, campaignId)).find((s) => s.id === scene.id);
		assert.equal(stored.status, 'current');
	} finally { await closePage(page); }
});
