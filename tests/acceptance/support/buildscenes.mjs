// Build-step scene cards (US-341): collapsible `scene-more`, button looks, header and form geometry. Actions and reads only, no expectations.
import { openSceneMore } from './scenes.mjs';

/** A scene card by its exact heading. */
export const sceneCard = (page, title) =>
	page.getByTestId('scene').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/** Over HTTP: put loot and an encounter on a scene (seeded). */
export const addLootAndEncounter = async (base, campaignId, sceneId) => {
	const post = async (path, body) => {
		const r = await fetch(`${base}/api/campaigns/${campaignId}/scenes/${sceneId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!r.ok) throw new Error(`${path} -> ${r.status}`);
	};
	await post('loot', { table: 'items', rarity: 'common', count: 2, seed: 3 });
	await post('encounter', { partySize: 3, tier: 1, seed: 5 });
};

export const setCurrent = async (base, campaignId, sceneId) => {
	const r = await fetch(`${base}/api/campaigns/${campaignId}/scenes/${sceneId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'current' }) });
	if (!r.ok) throw new Error(`status -> ${r.status}`);
};

/** The user opens a scene's "Loot, encounter and order" disclosure (clicking its summary, with or without JavaScript). */
export const openMore = (page, title) => openSceneMore(sceneCard(page, title));

/** What a scene's disclosure shows: { count, open (attribute present), summary (text), summaryHeight }. */
export const moreOf = (page, title) =>
	sceneCard(page, title).evaluate((sc) => {
		const all = sc.querySelectorAll('[data-testid="scene-more"]');
		const d = all[0];
		const s = d?.querySelector('summary');
		return { count: all.length, tag: d?.tagName, open: d?.hasAttribute('open') ?? null, summary: s?.textContent.replace(/\s+/g, ' ').trim() ?? null, summaryHeight: s?.getBoundingClientRect().height ?? null };
	});

/** Whether a scene's named control is visible. kind: 'button' | 'testid'. */
export const buttonVisible = (page, title, name) => sceneCard(page, title).getByRole('button', { name, exact: true }).isVisible();
export const environmentVisible = (page, title) => sceneCard(page, title).getByTestId('scene-environment').isVisible();

/** Press a scene's button (without JavaScript: wait for the page that follows). */
export const pressSceneButton = async (page, title, name, { js = true, nth = 0 } = {}) => {
	const b = sceneCard(page, title).getByRole('button', { name, exact: true }).nth(nth);
	if (js) { await b.click(); await page.waitForLoadState('networkidle'); }
	else await Promise.all([page.waitForEvent('load'), b.click()]);
};

/** Scene titles in the order the page lists them. */
export const listedTitles = (page) =>
	page.getByTestId('scene').evaluateAll((els) => els.map((e) => e.querySelector('h1, h2, h3, h4, h5, h6')?.textContent.trim()));

const LOOK = (e) => {
	const c = getComputedStyle(e);
	const r = e.getBoundingClientRect();
	return { classes: [...e.classList], background: c.backgroundColor, color: c.color, borderStyle: c.borderTopStyle, borderWidth: c.borderTopWidth, borderColor: c.borderTopColor, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};
/** Computed look of a named button inside a scene. */
export const sceneButtonLook = (page, title, name, nth = 0) =>
	sceneCard(page, title).getByRole('button', { name, exact: true }).nth(nth).evaluate(LOOK);
/** Looks of every button with that exact name inside a scene (e.g. one Remove per adversary). */
export const sceneButtonLooks = (page, title, name) =>
	sceneCard(page, title).getByRole('button', { name, exact: true }).evaluateAll((els) => els.map((e) => {
		const c = getComputedStyle(e);
		return { classes: [...e.classList], color: c.color, background: c.backgroundColor };
	}));
/** Look of the element with a test id (scene-scoped) or anywhere on the page. */
export const lookOfTestId = (page, testid) => page.getByTestId(testid).first().evaluate(LOOK);

/** Vertical centres of a scene header's title text, scene-status, status buttons and scene-edit-open. */
export const headerCentres = (page, title) =>
	sceneCard(page, title).evaluate((sc) => {
		const rc = (e) => e.getBoundingClientRect();
		const h = sc.querySelector('h1, h2, h3, h4, h5, h6');
		const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
		let node = null;
		for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim()) { node = n; break; }
		const range = document.createRange();
		range.selectNodeContents(node);
		const status = [...sc.querySelectorAll('form[action^="?/status&"] button')];
		const edit = sc.querySelector('[data-testid="scene-edit-open"]');
		const cy = (e) => rc(e).y + rc(e).height / 2;
		return { title: cy(range), status: cy(sc.querySelector('[data-testid="scene-status"]')), buttons: status.map(cy), edit: cy(edit) };
	});

/** Rects of the buttons and button links of a scene's header row (everything outside `scene-more`). */
export const headerControlRects = (page, title) =>
	sceneCard(page, title).evaluate((sc) => {
		const more = sc.querySelector('[data-testid="scene-more"]');
		return [...sc.querySelectorAll('button, a')]
			.filter((e) => !more?.contains(e) && !(e.getAttribute('data-testid') ?? '').startsWith('help'))
			.map((e) => { const r = e.getBoundingClientRect(); return { label: e.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
	});

/** Geometry of a scene's loot (`roll`) or encounter (`generate`) form: number inputs, selects and the submit button. */
export const oneRowForm = (page, title, action) =>
	sceneCard(page, title).evaluate((sc, action) => {
		const f = sc.querySelector(`form[action^="?/${action}&"]`);
		const box = (e) => { const r = e.getBoundingClientRect(); return { width: r.width, bottom: r.bottom, top: r.top }; };
		return {
			found: !!f,
			numbers: f ? [...f.querySelectorAll('input[type="number"]')].map(box) : [],
			selects: f ? [...f.querySelectorAll('select')].map(box) : [],
			submit: f ? box(f.querySelector('button[type="submit"], button:not([type])')) : null
		};
	}, action);

/** Page-level reads. */
export const horizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
export const buildColumns = (page) =>
	page.evaluate(() => {
		const r = (id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
		const a = r('build-party'), b = r('build-scenes');
		return { party: { x: a.x, y: a.y, right: a.right, width: a.width }, scenes: { x: b.x, y: b.y, width: b.width } };
	});
