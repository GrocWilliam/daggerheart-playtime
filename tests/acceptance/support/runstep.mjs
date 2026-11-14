// Run step of the DM screen: setup over HTTP and reads of layout and looks. No expected values here.
import { createCampaign, createCharacter, createCurrentScene, addJournalEntry } from './api.mjs';

const call = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return r.json().catch(() => null);
};

/** Campaign with 3 characters (Alyndra, Brom downed with a condition, Cyra), a current scene with an encounter, one journal entry. */
export const setupRunCampaign = async (base, tag = '') => {
	const campaignId = await createCampaign(base, `Runcamp${tag}`);
	const alyndra = await createCharacter(base, campaignId, 'Alyndra');
	const brom = await createCharacter(base, campaignId, 'Brom');
	const cyra = await createCharacter(base, campaignId, 'Cyra');
	await call(base, 'POST', `/api/characters/${brom}/hp`, { delta: 6 });
	await call(base, 'PUT', `/api/characters/${brom}/conditions`, { vulnerable: true, restrained: false, hidden: false });
	const sceneId = await createCurrentScene(base, campaignId, 'Alphaglade');
	const url = `/api/campaigns/${campaignId}/scenes/${sceneId}/encounter`;
	await call(base, 'POST', url, { partySize: 3, tier: 1, seed: 1 });
	await call(base, 'PATCH', url, { adversaries: [{ id: 'adv_giant_rat', count: 2 }] });
	await addJournalEntry(base, campaignId, 'We met a fox.');
	return { campaignId, alyndra, brom, cyra, sceneId };
};

export const characterMarkedHp = async (base, id) => (await call(base, 'GET', `/api/characters/${id}`)).hp.marked;

export const box = (page, testid) => page.getByTestId(testid).first().boundingBox();
export const boxes = async (page, ids) => Object.fromEntries(await Promise.all(ids.map(async (i) => [i, await box(page, i)])));

/** Tops of the character cards. */
export const cardTops = (page) => page.getByTestId('character-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
export const cardBoxes = (page) => page.getByTestId('character-card').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));

export const bodyWidth = (page) => page.evaluate(() => document.body.getBoundingClientRect().width);
export const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export const cardOf = (page, name) =>
	page.getByTestId('character-card').filter({ has: page.getByTestId('character-name').filter({ hasText: name }) });

/** Vertical centres of name, down badge (null if absent) and the class/level text, plus that text's size and colour. */
export const cardHeader = (card, className = 'Guardian') => card.evaluate((c, cls) => {
	const cy = (r) => r.y + r.height / 2;
	const name = c.querySelector('[data-testid=character-name]');
	const down = c.querySelector('[data-testid=down]');
	let meta = null;
	const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
	for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.includes(cls)) { meta = n; break; }
	const rg = document.createRange();
	rg.selectNodeContents(meta);
	const cs = getComputedStyle(meta.parentElement);
	return { name: cy(name.getBoundingClientRect()), down: down && cy(down.getBoundingClientRect()), meta: cy(rg.getBoundingClientRect()), fontSize: cs.fontSize, color: cs.color };
}, className);

/** Amount input and submit of a card's damage form: width, bottom edges, submit classes. */
export const damageFormLook = (card) => card.evaluate((c) => {
	const f = c.querySelector('form[action^="?/damage"]');
	const i = f.querySelector('input[name=amount]').getBoundingClientRect();
	const b = f.querySelector('button[type=submit]');
	const r = b.getBoundingClientRect();
	return { inputWidth: i.width, inputBottom: i.bottom, submitBottom: r.bottom, submitClasses: [...b.classList] };
});

export const applyDamage = async (card, amount) => {
	const f = card.locator('form[action^="?/damage"]');
	await f.locator('input[name=amount]').fill(String(amount));
	await f.locator('button[type=submit]').click();
};

const LOOK = (e) => { const c = getComputedStyle(e); return { classes: [...e.classList], color: c.color, background: c.backgroundColor }; };
export const addToJournalLook = (page) => page.getByTestId('journal').locator('form[action^="?/addJournal"] button[type=submit]').evaluate(LOOK);
export const deleteJournalLook = (page) => page.getByTestId('journal-entry').first().locator('form[action^="?/deleteJournal"] button[type=submit]').evaluate(LOOK);
export const unitButtonLook = (page, testid) => page.getByTestId(testid).first().evaluate(LOOK);
export const battleAddLook = (page) => page.getByTestId('battle-add-submit').evaluate(LOOK);

/** Heights of every visible button and link in the Run step. */
export const runTargets = (page) => page.getByTestId('run').evaluate((run) =>
	[...run.querySelectorAll('a, button')].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
		.map((e) => ({ label: (e.dataset.testid || e.textContent.trim()).slice(0, 30), height: e.getBoundingClientRect().height })));
