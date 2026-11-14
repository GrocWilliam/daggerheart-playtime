import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage } from '../support/browser.mjs';
import { createCampaign, createCharacter } from '../support/api.mjs';
import { buildStepUrl, createScene, environments, openAs } from '../support/scenes.mjs';
import {
	addLootAndEncounter, setCurrent, openMore, moreOf, buttonVisible, environmentVisible, pressSceneButton, listedTitles,
	sceneButtonLook, sceneButtonLooks, lookOfTestId, headerCentres, headerControlRects, oneRowForm, horizontalOverflow, buildColumns
} from '../support/buildscenes.mjs';

const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

const ACCENT = 'rgb(212, 160, 80)';
const DANGER_TEXT = 'rgb(238, 128, 112)';
const TRANSPARENT = ['rgba(0, 0, 0, 0)', 'transparent'];

/** Campaign with a current scene 'Alpha' and a planned scene 'Beta' (both with notes and an environment); `rich` adds loot and an encounter to both. */
async function campaignAlphaBeta({ rich = false } = {}) {
	const campaignId = await createCampaign(BASE, 'Cards');
	await createCharacter(BASE, campaignId, 'Rook');
	const env = (await environments(BASE))[0];
	const alpha = await createScene(BASE, campaignId, 'Alpha', { notes: 'First notes', environmentId: env.id });
	const beta = await createScene(BASE, campaignId, 'Beta', { notes: 'Second notes', environmentId: env.id });
	await setCurrent(BASE, campaignId, alpha.id);
	if (rich) for (const s of [alpha, beta]) await addLootAndEncounter(BASE, campaignId, s.id);
	return { campaignId, alpha, beta };
}
const SCENES = ['Alpha', 'Beta'];

for (const [lang, summary] of [['en', 'Loot, encounter and order'], ['fr', 'Butin, rencontre et ordre']]) {
	test(`the current scene's scene-more is open, a planned scene's is closed, and its summary reads "${summary}" (${lang}, 44px high)`, async () => {
		const { campaignId } = await campaignAlphaBeta();
		const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { lang });
		try {
			const alpha = await moreOf(page, 'Alpha');
			const beta = await moreOf(page, 'Beta');
			assert.equal(alpha.count, 1);
			assert.equal(beta.count, 1);
			assert.equal(alpha.tag, 'DETAILS');
			assert.equal(alpha.open, true);
			assert.equal(beta.open, false);
			assert.equal(beta.summary, summary);
			assert.equal(alpha.summary, summary);
			assert.ok(beta.summaryHeight >= 43.5, `summary ${beta.summaryHeight}px`);
		} finally { await closePage(page); }
	});
}

test('the open attribute is rendered by the server (present in the HTML of the current scene only)', async () => {
	const { campaignId, beta } = await campaignAlphaBeta();
	const r = await fetch(buildStepUrl(BASE, campaignId), { headers: { accept: 'text/html' } });
	const html = await r.text();
	const tags = [...html.matchAll(/<details\b[^>]*data-testid="scene-more"[^>]*>/g)].map((m) => m[0]);
	assert.equal(tags.length, 2);
	assert.equal(tags.filter((t) => /\bopen\b/.test(t)).length, 1);
	void beta;
});

test('without JavaScript, clicking the summary of Beta shows its environment, Roll loot and Generate encounter', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { js: false });
	try {
		assert.equal(await environmentVisible(page, 'Beta'), false);
		assert.equal(await buttonVisible(page, 'Beta', 'Roll loot'), false);
		assert.equal(await buttonVisible(page, 'Beta', 'Generate encounter'), false);
		await openMore(page, 'Beta');
		assert.equal(await environmentVisible(page, 'Beta'), true);
		assert.equal(await buttonVisible(page, 'Beta', 'Roll loot'), true);
		assert.equal(await buttonVisible(page, 'Beta', 'Generate encounter'), true);
	} finally { await closePage(page); }
});

test('without JavaScript, opening Beta and clicking Delete scene lands on ?step=build and Beta is gone', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { js: false });
	try {
		await openMore(page, 'Beta');
		await pressSceneButton(page, 'Beta', 'Delete scene', { js: false });
		assert.equal(new URL(page.url()).searchParams.get('step'), 'build');
		assert.deepEqual(await listedTitles(page), ['Alpha']);
	} finally { await closePage(page); }
});

test('without JavaScript, opening Beta and clicking Move up lists Beta first', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { js: false });
	try {
		assert.deepEqual(await listedTitles(page), ['Alpha', 'Beta']);
		await openMore(page, 'Beta');
		await pressSceneButton(page, 'Beta', 'Move up', { js: false });
		assert.equal(new URL(page.url()).searchParams.get('step'), 'build');
		assert.deepEqual(await listedTitles(page), ['Beta', 'Alpha']);
	} finally { await closePage(page); }
});

test('at 1024x768 each scene header has its title, scene-status, status buttons and scene-edit-open on one line (centres within 8px)', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1024, 768] });
	try {
		for (const title of SCENES) {
			const c = await headerCentres(page, title);
			const all = [c.title, c.status, ...c.buttons, c.edit];
			assert.ok(c.buttons.length >= 1, `${title} status buttons`);
			assert.ok(Math.max(...all) - Math.min(...all) <= 8, `${title} centres ${all}`);
		}
	} finally { await closePage(page); }
});

test('at 375x812 no two header buttons or button links of a scene overlap or sit less than 8px apart', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [375, 812] });
	try {
		for (const title of SCENES) {
			const rs = await headerControlRects(page, title);
			assert.ok(rs.length >= 2, `${title} header controls ${rs.map((r) => r.label)}`);
			for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
				const a = rs[i], b = rs[j];
				const gap = Math.max(a.x - b.right, b.x - a.right, a.y - b.bottom, b.y - a.bottom);
				assert.ok(gap >= 7.5, `${title}: "${a.label}" and "${b.label}" are ${gap}px apart`);
			}
		}
	} finally { await closePage(page); }
});

test('in an opened scene Move up and Move down are btn-ghost with a transparent background; Delete scene is btn-danger with text rgb(238, 128, 112), 16px after Move down or on a lower row', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1024, 768] });
	try {
		await openMore(page, 'Beta');
		for (const name of ['Move up', 'Move down']) {
			const l = await sceneButtonLook(page, 'Beta', name);
			assert.ok(l.classes.includes('btn-ghost'), `${name}: ${l.classes}`);
			assert.ok(TRANSPARENT.includes(l.background), `${name} background ${l.background}`);
		}
		const down = await sceneButtonLook(page, 'Beta', 'Move down');
		const del = await sceneButtonLook(page, 'Beta', 'Delete scene');
		assert.ok(del.classes.includes('btn-danger'), del.classes.join(' '));
		assert.equal(del.color, DANGER_TEXT);
		assert.ok(del.x >= down.right + 16 - 0.5 || del.y >= down.bottom - 1, `Delete x=${del.x} Move down right=${down.right}, Delete y=${del.y} Move down bottom=${down.bottom}`);
	} finally { await closePage(page); }
});

test('in an opened scene Roll loot and Generate encounter are btn-primary; Set current and Mark done are btn-secondary with accent text and a 1px solid accent border', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1024, 768] });
	try {
		await openMore(page, 'Beta');
		for (const name of ['Roll loot', 'Generate encounter']) {
			assert.ok((await sceneButtonLook(page, 'Beta', name)).classes.includes('btn-primary'), name);
		}
		for (const name of ['Set current', 'Mark done']) {
			const l = await sceneButtonLook(page, 'Beta', name);
			assert.ok(l.classes.includes('btn-secondary'), `${name}: ${l.classes}`);
			assert.equal(l.color, ACCENT, `${name} text`);
			assert.equal(l.borderStyle, 'solid', `${name} border style`);
			assert.equal(l.borderWidth, '1px', `${name} border width`);
			assert.equal(l.borderColor, ACCENT, `${name} border colour`);
		}
	} finally { await closePage(page); }
});

test('in an opened scene with loot and an encounter, Give and Update are btn-secondary; Delete loot, Remove and Delete encounter are btn-danger', async () => {
	const { campaignId } = await campaignAlphaBeta({ rich: true });
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1024, 768] });
	try {
		await openMore(page, 'Beta');
		for (const name of ['Delete loot', 'Remove', 'Delete encounter']) {
			const looks = await sceneButtonLooks(page, 'Beta', name);
			assert.ok(looks.length >= 1, `${name} present`);
			for (const l of looks) assert.ok(l.classes.includes('btn-danger'), `${name}: ${l.classes}`);
		}
		for (const name of ['Give', 'Update']) {
			const looks = await sceneButtonLooks(page, 'Beta', name);
			assert.ok(looks.length >= 1, `${name} present`);
			for (const l of looks) assert.ok(l.classes.includes('btn-secondary'), `${name}: ${l.classes}`);
		}
	} finally { await closePage(page); }
});

test('at 1024x768 the loot and encounter forms are one row: number inputs 80px, selects at most 256px, submit bottom within 4px of the inputs', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1024, 768] });
	try {
		await openMore(page, 'Beta');
		for (const [action, withSelects] of [['roll', true], ['generate', false]]) {
			const f = await oneRowForm(page, 'Beta', action);
			assert.ok(f.found, `${action} form`);
			assert.ok(f.numbers.length >= 1, `${action} number inputs`);
			if (withSelects) assert.ok(f.selects.length >= 1, `${action} selects`);
			for (const n of f.numbers) assert.ok(Math.abs(n.width - 80) <= 1, `${action} number ${n.width}px`);
			for (const s of f.selects) assert.ok(s.width <= 256 + 0.5, `${action} select ${s.width}px`);
			for (const i of [...f.numbers, ...f.selects]) assert.ok(Math.abs(f.submit.bottom - i.bottom) <= 4, `${action} submit bottom ${f.submit.bottom} vs ${i.bottom}`);
		}
	} finally { await closePage(page); }
});

test('new-scene and new-character are btn-primary with background rgb(212, 160, 80)', async () => {
	const { campaignId } = await campaignAlphaBeta();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [1024, 768] });
	try {
		for (const id of ['new-scene', 'new-character']) {
			const l = await lookOfTestId(page, id);
			assert.ok(l.classes.includes('btn-primary'), `${id}: ${l.classes}`);
			assert.equal(l.background, ACCENT, id);
		}
	} finally { await closePage(page); }
});

for (const width of [360, 375, 768, 1024, 1180]) {
	test(`?step=build at ${width}px has no sideways scroll${width >= 768 ? ', build-party about 1/3 and build-scenes about 2/3 side by side' : ''}`, async () => {
		const { campaignId } = await campaignAlphaBeta({ rich: true });
		const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport: [width, 900] });
		try {
			assert.ok((await horizontalOverflow(page)) <= 0, 'closed');
			await openMore(page, 'Beta');
			assert.ok((await horizontalOverflow(page)) <= 0, 'opened');
			if (width >= 768) {
				const { party, scenes } = await buildColumns(page);
				assert.ok(Math.abs(party.y - scenes.y) <= 2, `tops ${party.y} ${scenes.y}`);
				assert.ok(scenes.x >= party.right - 1, 'scenes right of party');
				const share = party.width / (party.width + scenes.width);
				assert.ok(share > 0.28 && share < 0.38, `party share ${share}`);
			}
		} finally { await closePage(page); }
	});
}
