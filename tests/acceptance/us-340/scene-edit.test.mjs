import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, closePage } from '../support/browser.mjs';
import { createCampaign } from '../support/api.mjs';
import {
	buildStepUrl, sceneEditUrl, createScene, scenesOf, environments, openAs,
	sceneEditOpeners, titleInputsInScenes, sceneEditDialogCount, sceneTitlesShown,
	openSceneEdit, sceneEditIsOpen, openDialogCount, waitSceneEditClosed, sceneEditHeading, sceneEditValues,
	sceneEditAlert, sceneEditCancelHref, sceneEditFormAction, sceneEditSaveClasses, fillSceneEdit, saveSceneEdit,
	markPage, pageWasReloaded, fetchPage, hasSceneEditDialog, postSceneEdit, catalog
} from '../support/scenes.mjs';

const BASE = process.env.BASE_URL;
const ROOT = process.env.ROOT;
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

/** A campaign with scenes 'One' and 'Two'; 'Two' has notes and an environment. */
async function campaignWithScenes() {
	const campaignId = await createCampaign(BASE, 'Scene edit');
	const env = (await environments(BASE))[0];
	const one = await createScene(BASE, campaignId, 'One');
	const two = await createScene(BASE, campaignId, 'Two', { notes: 'Bridge at dusk', environmentId: env.id });
	return { campaignId, one, two, env };
}
const sameQuery = (href, expected) => {
	const a = new URLSearchParams(href.replace(/^[^?]*\?/, ''));
	const b = new URLSearchParams(expected.replace(/^[^?]*\?/, ''));
	return [...a].sort().join('&') === [...b].sort().join('&');
};

for (const viewport of [[375, 812], [1024, 768]]) {
	test(`each scene has one scene-edit-open link (?step=build&new=scene-edit&scene=<id>, btn-secondary, 44x44) and no inline title input or modal-scene-edit (${viewport[0]}px)`, async () => {
		const { campaignId, one, two } = await campaignWithScenes();
		const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { viewport });
		try {
			const openers = await sceneEditOpeners(page);
			assert.equal(openers.length, 2);
			for (const [o, s] of [[openers.find((x) => x.title === 'One'), one], [openers.find((x) => x.title === 'Two'), two]]) {
				assert.equal(o.count, 1, `one scene-edit-open in ${s.title}`);
				assert.equal(o.tag, 'A');
				assert.equal(o.href, `?step=build&new=scene-edit&scene=${s.id}`);
				assert.ok(o.classes.includes('btn-secondary'), o.classes.join(' '));
				assert.equal(o.label, 'Edit');
				assert.ok(o.width >= 43.5 && o.height >= 43.5, `${o.width}x${o.height}`);
			}
			assert.equal(await titleInputsInScenes(page), 0);
			assert.equal(await sceneEditDialogCount(page), 0);
		} finally { await closePage(page); }
	});
}

for (const [lang, heading] of [['en', 'Edit scene'], ['fr', 'Modifier la scène']]) {
	test(`?new=scene-edit&scene=<Two> opens modal-scene-edit headed "${heading}" (${lang}), prefilled with Two's title, notes and environment`, async () => {
		const { campaignId, two, env } = await campaignWithScenes();
		const { page } = await openAs(browser, sceneEditUrl(BASE, campaignId, two.id), { lang });
		try {
			assert.equal(await sceneEditIsOpen(page), true);
			assert.equal(await sceneEditHeading(page), heading);
			assert.deepEqual(await sceneEditValues(page), { title: 'Two', notes: 'Bridge at dusk', environmentId: env.id });
			assert.ok(sameQuery(await sceneEditFormAction(page), '?/edit&step=build'), await sceneEditFormAction(page));
			assert.ok((await sceneEditSaveClasses(page)).includes('btn-primary'));
		} finally { await closePage(page); }
	});
}

test('the scene-edit-open link opens the dialog for its own scene', async () => {
	const { campaignId } = await campaignWithScenes();
	const { page } = await openAs(browser, buildStepUrl(BASE, campaignId), { js: false });
	try {
		await openSceneEdit(page, 'One');
		assert.equal((await sceneEditValues(page)).title, 'One');
	} finally { await closePage(page); }
});

test('without JavaScript, saving the title "Deux" answers 303 to ?step=build, lists Deux and leaves no dialog open', async () => {
	const { campaignId, two } = await campaignWithScenes();
	const { page } = await openAs(browser, sceneEditUrl(BASE, campaignId, two.id), { js: false });
	try {
		await fillSceneEdit(page, { title: 'Deux' });
		const r = await saveSceneEdit(page, { js: false });
		assert.equal(r.status, 303);
		const target = new URL(r.location, `${BASE}/campaigns/${campaignId}`);
		assert.equal(target.pathname + target.search, `/campaigns/${campaignId}?step=build`);
		assert.ok((await sceneTitlesShown(page)).some((t) => t.includes('Deux')));
		assert.equal(await openDialogCount(page), 0);
		assert.deepEqual((await scenesOf(BASE, campaignId)).map((s) => s.title), ['One', 'Deux']);
	} finally { await closePage(page); }
});

test('with JavaScript, saving the title "Deux" closes the dialog and shows Deux without a full reload', async () => {
	const { campaignId, two } = await campaignWithScenes();
	const { page } = await openAs(browser, sceneEditUrl(BASE, campaignId, two.id));
	try {
		assert.equal(await sceneEditIsOpen(page), true);
		await markPage(page);
		await fillSceneEdit(page, { title: 'Deux' });
		await saveSceneEdit(page);
		await waitSceneEditClosed(page);
		await page.getByTestId('scene').filter({ hasText: 'Deux' }).waitFor();
		assert.equal(await pageWasReloaded(page), false);
		assert.equal(await openDialogCount(page), 0);
		assert.deepEqual((await scenesOf(BASE, campaignId)).map((s) => s.title), ['One', 'Deux']);
	} finally { await closePage(page); }
});

for (const lang of ['en', 'fr']) {
	test(`without JavaScript, an empty title answers 400 with modal-scene-edit open, the error.invalid alert inside (${lang}) and the submitted notes kept`, async () => {
		const { campaignId, two } = await campaignWithScenes();
		const { page } = await openAs(browser, sceneEditUrl(BASE, campaignId, two.id), { lang, js: false });
		try {
			await fillSceneEdit(page, { title: '', notes: 'Rewritten notes', novalidate: true });
			const r = await saveSceneEdit(page, { js: false });
			assert.equal(r.status, 400);
			assert.equal(await sceneEditIsOpen(page), true);
			assert.equal(await sceneEditAlert(page), catalog(ROOT, lang, 'error.invalid'));
			assert.equal((await sceneEditValues(page)).notes, 'Rewritten notes');
			const saved = (await scenesOf(BASE, campaignId)).find((s) => s.id === two.id);
			assert.equal(saved.title, 'Two');
			assert.equal(saved.notes, 'Bridge at dusk');
		} finally { await closePage(page); }
	});
}

for (const bad of ['999999', 'abc']) {
	test(`?step=build&new=scene-edit&scene=${bad} answers 200 without modal-scene-edit`, async () => {
		const { campaignId } = await campaignWithScenes();
		const r = await fetchPage(`${buildStepUrl(BASE, campaignId)}&new=scene-edit&scene=${bad}`);
		assert.equal(r.status, 200);
		assert.equal(hasSceneEditDialog(r.html), false);
	});
}

test("a scene id of another campaign answers 200 without modal-scene-edit", async () => {
	const { campaignId } = await campaignWithScenes();
	const other = await campaignWithScenes();
	const r = await fetchPage(sceneEditUrl(BASE, campaignId, other.two.id));
	assert.equal(r.status, 200);
	assert.equal(hasSceneEditDialog(r.html), false);
});

test('modal-cancel in the open dialog keeps step=build and drops new and scene', async () => {
	const { campaignId, two } = await campaignWithScenes();
	const { page } = await openAs(browser, sceneEditUrl(BASE, campaignId, two.id), { js: false });
	try {
		const href = await sceneEditCancelHref(page);
		const q = new URL(href, `${BASE}/campaigns/${campaignId}`).searchParams;
		assert.equal(q.get('step'), 'build');
		assert.equal(q.has('new'), false);
		assert.equal(q.has('scene'), false);
	} finally { await closePage(page); }
});

test('a notes-only POST to ?/edit&step=build saves the notes and answers as before (200 page, title and environment unchanged)', async () => {
	const { campaignId, two, env } = await campaignWithScenes();
	const r = await postSceneEdit(BASE, campaignId, { sceneId: two.id, notes: 'Only notes' });
	assert.equal(r.status, 200);
	assert.equal(r.location, null);
	const saved = (await scenesOf(BASE, campaignId)).find((s) => s.id === two.id);
	assert.deepEqual([saved.title, saved.notes, saved.environmentId], ['Two', 'Only notes', env.id]);
	assert.equal(hasSceneEditDialog(r.html), false);
});

test('an enhanced notes-only POST to ?/edit answers success as before', async () => {
	const { campaignId, two } = await campaignWithScenes();
	const r = await postSceneEdit(BASE, campaignId, { sceneId: two.id, notes: 'Run notes' }, { enhanced: true, query: '?/edit' });
	assert.equal(r.status, 200);
	assert.equal(r.json.type, 'success');
	assert.equal(r.json.status, 200);
	assert.equal((await scenesOf(BASE, campaignId)).find((s) => s.id === two.id).notes, 'Run notes');
});

test('a notes-only POST for an unknown scene fails as before (404, no scene-edit modal)', async () => {
	const { campaignId } = await campaignWithScenes();
	const r = await postSceneEdit(BASE, campaignId, { sceneId: '00000000-0000-0000-0000-000000000000', notes: 'x' }, { enhanced: true, query: '?/edit' });
	assert.equal(r.json.type, 'failure');
	assert.equal(r.json.status, 404);
	assert.ok(!String(r.json.data).includes('scene-edit'), r.json.data);
});

test('an enhanced POST with a title answers { ok: true } success, not a redirect', async () => {
	const { campaignId, two } = await campaignWithScenes();
	const r = await postSceneEdit(BASE, campaignId, { sceneId: two.id, title: 'Deux', notes: '', environmentId: '' }, { enhanced: true });
	assert.equal(r.json.type, 'success');
	assert.equal((await scenesOf(BASE, campaignId)).find((s) => s.id === two.id).title, 'Deux');
});

test('scene.editTitle is "Edit scene" in en.json and "Modifier la scène" in fr.json', () => {
	assert.equal(catalog(ROOT, 'en', 'scene.editTitle'), 'Edit scene');
	assert.equal(catalog(ROOT, 'fr', 'scene.editTitle'), 'Modifier la scène');
});
