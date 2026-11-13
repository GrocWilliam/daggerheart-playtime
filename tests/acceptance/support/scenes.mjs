// Build-step scenes and the scene-edit modal: actions and reads, no expectations.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const buildStepUrl = (base, campaignId) => `${base}/campaigns/${campaignId}?step=build`;
export const sceneEditUrl = (base, campaignId, sceneId) => `${base}/campaigns/${campaignId}?step=build&new=scene-edit&scene=${sceneId}`;

/** Setup: a scene in a campaign, through the API. */
export const createScene = async (base, campaignId, title, extra = {}) => {
	const r = await fetch(`${base}/api/campaigns/${campaignId}/scenes`, {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, ...extra })
	});
	if (!r.ok) throw new Error(`create scene -> ${r.status}`);
	return r.json();
};
export const scenesOf = async (base, campaignId) => (await fetch(`${base}/api/campaigns/${campaignId}/scenes`)).json();
export const environments = async (base) => (await fetch(`${base}/api/srd/environments`)).json();

/** A page with a language cookie, JavaScript on or off; fails fast. */
export const openAs = async (browser, url, { lang = 'en', js = true, viewport = [1024, 768] } = {}) => {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: viewport[0], height: viewport[1] } });
	await ctx.addCookies([{ name: 'lang', value: lang, url }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(10000);
	const res = await page.goto(url, { waitUntil: js ? 'networkidle' : 'load' });
	return { page, status: res?.status() };
};

/** A scene card by its exact heading (a plain text match would also hit buttons like "Mark done" for 'One'). */
const card = (page, title) => page.getByTestId('scene').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const dialog = (page) => page.getByTestId('modal-scene-edit');
const form = (page) => dialog(page).locator('form[action*="/edit"]');

/** Each scene card's edit openers: [{ title (its heading), count, tag, href, classes, label, width, height }]. */
export const sceneEditOpeners = (page) =>
	page.getByTestId('scene').evaluateAll((els) => els.map((e) => {
		const links = [...e.querySelectorAll('[data-testid="scene-edit-open"]')];
		const a = links[0];
		const r = a?.getBoundingClientRect();
		return { title: e.querySelector('h1, h2, h3, h4, h5, h6')?.textContent.trim(), count: links.length, tag: a?.tagName, href: a?.getAttribute('href'), classes: a ? [...a.classList] : [], label: a?.textContent.trim(), width: r?.width, height: r?.height };
	}));
/** How many title inputs the scene cards hold. */
export const titleInputsInScenes = (page) => page.locator('[data-testid=scene] input[name=title]').count();
export const sceneEditDialogCount = (page) => dialog(page).count();
export const sceneTitlesShown = (page) => page.getByTestId('scene').evaluateAll((els) => els.map((e) => e.textContent));

/** Click a scene's edit link and wait for the dialog to be open. */
export const openSceneEdit = async (page, sceneTitle) => {
	await card(page, sceneTitle).getByTestId('scene-edit-open').click();
	await page.waitForFunction(() => document.querySelector('[data-testid="modal-scene-edit"]')?.open === true);
};
export const sceneEditIsOpen = async (page) => (await dialog(page).count()) === 1 && dialog(page).evaluate((d) => d.open);
export const openDialogCount = (page) => page.evaluate(() => document.querySelectorAll('dialog[open]').length);
export const waitSceneEditClosed = (page) =>
	page.waitForFunction(() => { const d = document.querySelector('[data-testid="modal-scene-edit"]'); return !d || !d.open; });
export const sceneEditHeading = async (page) => {
	const id = await dialog(page).getAttribute('aria-labelledby');
	return (await dialog(page).locator(`[id="${id}"]`).textContent()).trim();
};
export const sceneEditValues = async (page) => ({
	title: await form(page).locator('input[name=title]').inputValue(),
	notes: await form(page).locator('[name=notes]').inputValue(),
	environmentId: await form(page).locator('select[name=environmentId]').inputValue()
});
export const sceneEditAlert = async (page) => {
	const a = dialog(page).locator('[role=alert]');
	return (await a.count()) === 1 ? (await a.textContent()).trim() : null;
};
export const sceneEditCancelHref = (page) => dialog(page).getByTestId('modal-cancel').getAttribute('href');
export const sceneEditFormAction = (page) => form(page).getAttribute('action');
export const sceneEditSaveClasses = (page) => form(page).locator('button[type=submit]').evaluate((b) => [...b.classList]);

/** Fill the dialog's fields that are given. `novalidate` lets an empty title reach the server. */
export const fillSceneEdit = async (page, { title, notes, environmentId, novalidate = false }) => {
	if (novalidate) await form(page).evaluate((f) => f.setAttribute('novalidate', ''));
	if (title !== undefined) await form(page).locator('input[name=title]').fill(title);
	if (notes !== undefined) await form(page).locator('[name=notes]').fill(notes);
	if (environmentId !== undefined) await form(page).locator('select[name=environmentId]').selectOption(environmentId);
};

/** Click Save; returns { status, location } of the form POST. Without JS (`js: false`) it waits for the page that follows to load. */
export const saveSceneEdit = async (page, { js = true } = {}) => {
	const posted = page.waitForResponse((r) => r.request().method() === 'POST');
	const loaded = js ? null : page.waitForEvent('load');
	await form(page).locator('button[type=submit]').click();
	const r = await posted;
	if (loaded) await loaded; else await page.waitForLoadState('networkidle');
	return { status: r.status(), location: r.headers().location ?? null };
};

/** Mark the page so a full reload can be detected. */
export const markPage = (page) => page.evaluate(() => { window.__notReloaded = true; });
export const pageWasReloaded = async (page) => !(await page.evaluate(() => window.__notReloaded === true));

/** Over HTTP: the HTML of a page, with its status. */
export const fetchPage = async (url, lang = 'en') => {
	const r = await fetch(url, { headers: { accept: 'text/html', cookie: `lang=${lang}` } });
	return { status: r.status, html: await r.text() };
};
export const hasSceneEditDialog = (html) => /data-testid="modal-scene-edit"/.test(html);

/** Over HTTP: post the DM screen's edit form, as a plain form (enhanced = with SvelteKit's action header). */
export const postSceneEdit = async (base, campaignId, fields, { enhanced = false, query = '?/edit&step=build' } = {}) => {
	const headers = { 'content-type': 'application/x-www-form-urlencoded', origin: new URL(base).origin, accept: enhanced ? 'application/json' : 'text/html' };
	if (enhanced) headers['x-sveltekit-action'] = 'true';
	const r = await fetch(`${base}/campaigns/${campaignId}${query}`, { method: 'POST', redirect: 'manual', headers, body: new URLSearchParams(fields).toString() });
	const body = await r.text();
	let json = null;
	try { json = JSON.parse(body); } catch { /* HTML */ }
	return { status: r.status, location: r.headers.get('location'), json, html: json ? null : body };
};

/** A catalog string from src/lib/i18n/<lang>.json. */
export const catalog = (root, lang, key) => JSON.parse(readFileSync(join(root, 'src/lib/i18n', `${lang}.json`), 'utf8'))[key];
