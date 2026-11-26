// Character sheet: setup over HTTP and reads of looks/geometry. Reads only: no assertions.
import { createCampaign, createCharacter } from './api.mjs';

export const SHEET_TABS = ['play', 'traits', 'gear', 'cards', 'notes'];
export const SHEET_VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];

const send = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
};

/** A level-3 Guardian (SRD class) in a campaign, with an item, an experience and a domain card. Returns its id. */
export const levelThreeCharacter = async (base, name = 'Sable') => {
	const camp = await createCampaign(base, 'Sheet camp ' + name);
	const id = await createCharacter(base, camp, name, { level: 3 });
	await send(base, 'POST', `/api/characters/${id}/items`, { name: 'Rope', quantity: 2 });
	await send(base, 'POST', `/api/characters/${id}/experiences`, { name: 'Hunter', modifier: 2 });
	const html = await (await fetch(`${base}/characters/${id}?tab=cards`)).text();
	const cardId = html.match(/<select name="cardId"[^>]*>[\s\S]*?<option value="([^"]+)"/)?.[1];
	if (cardId) await send(base, 'POST', `/api/characters/${id}/cards`, { cardId });
	return id;
};
export const setCondition = (base, id, conditions) => send(base, 'PUT', `/api/characters/${id}/conditions`, conditions);

const LOOK = `(e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
	return { cls: [...e.classList], color: c.color, bg: c.backgroundColor, pressed: e.getAttribute('aria-pressed'),
		border: ['Top', 'Right', 'Bottom', 'Left'].map((s) => [c['border' + s + 'Width'], c['border' + s + 'Style'], c['border' + s + 'Color']].join(' ')),
		left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; }`;
const look = (loc) => loc.evaluate(eval(LOOK));

export const headerButtonIds = ['level-up', 'campaign-run-link', 'new-edit'];
export const headerButtons = async (page) => {
	const out = {};
	for (const id of headerButtonIds) out[id] = await look(page.locator(`[data-testid="${id}"]`));
	return out;
};

/** Gap between two boxes: negative or zero when they overlap, else the larger of the horizontal and vertical distances. */
export const gapBetween = (a, b) => Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);

export const conditionToggle = (page, key) => page.locator(`[data-testid="sheet-conditions"] form:has(input[name="condition"][value="${key}"]) button[type="submit"]`);
export const conditionToggleLook = (page, key) => look(conditionToggle(page, key));
export const clickConditionToggle = (page, key) => conditionToggle(page, key).click();
export const conditionRowClasses = (page) => page.locator('[data-testid="sheet-conditions"] form').first().evaluate((f) => f.parentElement.className.split(/\s+/));

/** Right edge and width of each trait value. */
export const traitValueBoxes = (page, keys) => Promise.all(keys.map((k) => look(page.locator(`[data-testid="trait-${k}"]`))));
export const TRAIT_KEYS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export const itemRemoveLook = (page) => look(page.locator('[data-testid="item-row"] form[action^="?/removeItem"] button').first());
export const experienceRemoveLook = (page) => look(page.locator('[data-testid="experience"] form[action^="?/removeExperience"] button').first());
export const cardRemoveLook = (page) => look(page.locator('[data-testid="card"] form[action^="?/removeCard"] button').first());
export const openerLook = (page, kind) => look(page.locator(`[data-testid="new-${kind}"]`));
export const submitLooks = async (page, action) => {
	const btns = page.locator(`form[action^="?/${action}"] button:not([data-testid^="help-"])`);
	const n = await btns.count();
	const out = [];
	for (let i = 0; i < n; i++) out.push(await look(btns.nth(i)));
	return out;
};

/** Vertical centre of the class-and-level text and of each domain. */
export const metaCentres = (page) => page.evaluate(() => {
	const cy = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
	const h1 = document.querySelector('[data-testid="character-name"]').closest('h1');
	let klass = null;
	for (const s of h1.parentElement.querySelectorAll('span')) {
		const own = [...s.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
		if (/^\s*Guardian,/.test(own) || /^\s*Guardian/.test(own) && s.textContent.includes('3')) { klass = s; break; }
	}
	return { klass: klass ? cy(klass) : null, domains: [...document.querySelectorAll('[data-testid="domain"]')].map(cy) };
});

export const sideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The sheet's HTML over HTTP. `lang` is sent as the app's language cookie (`en` or `fr`). */
export const fetchSheetHtml = async (base, id, { tab = 'play', lang = 'en' } = {}) => {
	const r = await fetch(`${base}/characters/${id}?tab=${tab}`, { headers: { cookie: `lang=${lang}` } });
	if (!r.ok) throw new Error(`GET /characters/${id} -> ${r.status}`);
	return r.text();
};

/** The page content: everything after the site header (the layout renders no <main> element). */
const contentOf = (html) => html.slice(html.indexOf('</header>') + '</header>'.length);
const h1Index = (content) => {
	const i = content.indexOf('<h1');
	if (i < 0) throw new Error('the sheet has no h1');
	return i;
};

/** Opening tags of the links (`<a ...>`) in the content before the h1. */
export const anchorsBeforeH1 = (html) => {
	const c = contentOf(html);
	return [...c.slice(0, h1Index(c)).matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
};

/** The first element after the h1's closing tag, ignoring whitespace and comment markers (its opening tag). */
export const elementAfterH1 = (html) => {
	const c = contentOf(html);
	const close = c.indexOf('</h1>', h1Index(c));
	if (close < 0) throw new Error('the h1 is not closed');
	const rest = c.slice(close + '</h1>'.length).replace(/<!--[\s\S]*?-->/g, '').trimStart();
	return rest.match(/^<[a-z][^>]*>/)?.[0] ?? '';
};

/** Opening tags of the content's links whose path is `/campaigns/<campaignId>` (the query string is ignored). */
export const campaignLinks = (html, campaignId) =>
	[...contentOf(html).matchAll(/<a\b[^>]*>/g)]
		.map((m) => m[0])
		.filter((tag) => (tag.match(/\shref="([^"]*)"/)?.[1] ?? '').split('?')[0] === `/campaigns/${campaignId}`);

/** True when an element with this data-testid is in the HTML. */
export const hasTestId = (html, testId) => html.includes(`data-testid="${testId}"`);

/** The `lang` the server put on <html>. */
export const htmlLang = (html) => html.match(/<html lang="([^"]*)"/)?.[1];

/** Boxes (left/right/top/bottom/w/h) by data-testid. Reads only. */
export const boxOf = (page, testId) => look(page.locator(`[data-testid="${testId}"]`));
/** Box of the last tracker form, of the evasion/thresholds line, and of the damage form, on the Play tab. */
export const lastTrackerBox = (page) => look(page.locator('[data-testid="sheet-trackers"] form[action^="?/tracker"]').last());
export const defenseLineBox = (page) => page.locator('[data-testid="sheet-trackers"] [data-testid="thresholds"]').evaluate((e) => { const r = e.closest('ul').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
export const damageFormBox = (page) => look(page.locator('[data-testid="sheet-trackers"] form[action^="?/damage"]').first());
export const proficiencyInTrackers = (page) => page.locator('[data-testid="sheet-trackers"] [data-testid="proficiency"]').count();
export const conditionToggleBoxes = (page) => Promise.all(['hidden', 'restrained', 'vulnerable'].map((k) => conditionToggleLook(page, k)));
/** The document order of the header buttons (those present) by test id, read from the HTML. */
export const headerOrderInHtml = (html) => {
	const found = [];
	for (const id of ['level-up', 'campaign-run-link', 'new-edit']) {
		const i = html.search(new RegExp(`<[a-z]+\\b[^>]*data-testid="${id}"`));
		if (i >= 0) found.push([i, id]);
	}
	return found.sort((a, b) => a[0] - b[0]).map((f) => f[1]);
};
/** The class list of the opening tag of the element with this test id in the HTML (empty when absent). */
export const classesInHtml = (html, testId) => {
	const tag = html.match(new RegExp(`<[a-z]+\\b[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? '';
	return (tag.match(/\sclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);
};
