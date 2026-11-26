import { sceneCard } from './buildscenes.mjs';
import { createScene, openAs, openSceneMore } from './scenes.mjs';
import { createCampaign, createCharacter } from './api.mjs';
// Build-step encounter cards (US-402): setup over HTTP, the count stepper, form posts, reads. No expected values here.

const json = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
	return r.json().catch(() => null);
};
export const SCENE_TITLE = 'Ambush';

/** Setup: a campaign with a character and a scene 'Ambush' whose encounter holds the first adversaries of the SRD at `counts`. */
export const encounterWith = async (base, counts) => {
	const campaignId = (await json(base, 'POST', '/api/campaigns', { name: 'Stepper camp' })).id;
	await json(base, 'POST', `/api/campaigns/${campaignId}/characters`, { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 });
	const sceneId = (await json(base, 'POST', `/api/campaigns/${campaignId}/scenes`, { title: SCENE_TITLE })).id;
	const list = await json(base, 'GET', '/api/srd/adversaries');
	const ids = list.filter((a) => a.tier === 1 || a.tier === undefined).slice(0, counts.length).map((a) => a.id);
	await json(base, 'POST', `/api/campaigns/${campaignId}/scenes/${sceneId}/encounter`, { partySize: 3, tier: 1, seed: 5 });
	const enc = await setCounts(base, campaignId, sceneId, ids.map((id, i) => ({ id, count: counts[i] })));
	const names = ids.map((id) => enc.adversaries.find((a) => a.id === id).name);
	return { campaignId, sceneId, ids, names, url: `${base}/campaigns/${campaignId}?step=build` };
};
export const setCounts = (base, campaignId, sceneId, adversaries) => json(base, 'PATCH', `/api/campaigns/${campaignId}/scenes/${sceneId}/encounter`, { adversaries });

/** The stored encounter of the scene (over HTTP). */
export const storedEncounter = async (base, campaignId, sceneId) =>
	(await json(base, 'GET', `/api/campaigns/${campaignId}/scenes`)).find((s) => s.id === sceneId).encounter;
/** The stored counts, { id: count }. */
export const storedCounts = async (base, campaignId, sceneId) =>
	Object.fromEntries((await storedEncounter(base, campaignId, sceneId)).adversaries.map((a) => [a.id, a.count]));

/** Form post of the `setCount` action, as a browser without JavaScript sends it: pairs [[id, count]], plus optional target/delta. */
export const postSetCount = async (base, campaignId, sceneId, pairs, extra = {}) => {
	const body = new URLSearchParams();
	body.append('sceneId', sceneId);
	for (const [id, count] of pairs) { body.append('id', id); body.append('count', String(count)); }
	for (const [k, v] of Object.entries(extra)) body.append(k, String(v));
	const r = await fetch(`${base}/campaigns/${campaignId}?/setCount&step=build`, { method: 'POST', redirect: 'manual', headers: { origin: base, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }, body });
	return r.status;
};

/** The card of an adversary in the Build step (exact name, scene 'Ambush'). */
export const adversaryCard = (page, name) =>
	sceneCard(page, SCENE_TITLE).getByTestId('encounter-adversary')
		.filter({ hasText: new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ×') });
export const countText = async (card) => (await card.getByTestId('adversary-count').textContent()).trim();
export const waitCountText = (card, text) => card.getByTestId('adversary-count').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }).waitFor();
export const stepperButton = (card, which) => card.getByTestId(`adversary-count-${which}`);
export const clickStepper = (card, which) => stepperButton(card, which).click();
export const removeButton = (card) => card.locator('button[formaction^="?/removeAdversary"]');
export const numberInputs = (card) => card.locator('input[type=number]').count();
export const buttonsNamed = (card, name) => card.getByRole('button', { name, exact: true }).count();
export const accessibleButton = (card, name) => card.getByRole('button', { name, exact: true });
export const isEnabled = (locator) => locator.isEnabled();
export const boxOf = (locator) => locator.boundingBox();
export const classesOf = (locator) => locator.evaluate((e) => [...e.classList]);

/** Vertical centres and horizontal edges of the row: minus, count, plus, Remove. */
export const rowGeometry = (card) =>
	card.evaluate((c) => {
		const box = (e) => { const r = e.getBoundingClientRect(); return { cy: r.y + r.height / 2, left: r.left, right: r.right }; };
		return {
			minus: box(c.querySelector('[data-testid="adversary-count-minus"]')),
			count: box(c.querySelector('[data-testid="adversary-count"]')),
			plus: box(c.querySelector('[data-testid="adversary-count-plus"]')),
			remove: box(c.querySelector('button[formaction^="?/removeAdversary"]'))
		};
	});

/** Spent value shown by the scene's encounter-budget ('spent / budget'), waiting until it reads `spent`. */
export const waitBudgetSpent = (page, spent) =>
	page.waitForFunction((s) => {
		const el = [...document.querySelectorAll('[data-testid="scene"] [data-testid="encounter-budget"]')][0];
		const m = el?.textContent.replace(/\s+/g, ' ').match(/(\d+)\s*\/\s*(\d+)/);
		return m && Number(m[1]) === s;
	}, spent);

// us-403: the encounter section of a Build-step scene. Setup over HTTP; actions and reads only, no expectations.

const call = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const TITLE = 'Ambush';

/** A campaign with two characters and a scene; `encounter` = { adjustments, three } stores an encounter (three = 3 adversaries). */
export const setupScene = async (base, { encounter = null } = {}) => {
	const campaignId = await createCampaign(base, 'Adj');
	await createCharacter(base, campaignId, 'Alyndra');
	await createCharacter(base, campaignId, 'Brom');
	const scene = await createScene(base, campaignId, TITLE);
	const url = `/api/campaigns/${campaignId}/scenes/${scene.id}/encounter`;
	if (encounter) {
		const g = await call(base, 'POST', url, { partySize: 3, tier: 1, seed: 1, adjustments: encounter.adjustments ?? [] });
		if (g.status >= 300) throw new Error('encounter setup ' + g.status);
		if (encounter.three) {
			const p = await call(base, 'PATCH', url, { adversaries: [{ id: 'adv_giant_rat', count: 2 }, { id: 'adv_acid_burrower', count: 1 }, { id: 'adv_bear', count: 1 }] });
			if (p.status !== 200) throw new Error('encounter patch ' + p.status);
		}
	}
	return { campaignId, sceneId: scene.id, pageUrl: `${base}/campaigns/${campaignId}?step=build` };
};

/** The stored adjustments of the scene's encounter (over HTTP). */
export const storedAdjustments = async (base, campaignId, sceneId) => {
	const s = (await (await fetch(`${base}/api/campaigns/${campaignId}/scenes`)).json()).find((x) => x.id === sceneId);
	return s.encounter ? s.encounter.adjustments : null;
};

/** Open the Build step (with the scene's more-disclosure open). */
export const openBuild = async (browser, pageUrl, { lang = 'en', js = true, viewport = [1024, 768] } = {}) => {
	const { page } = await openAs(browser, pageUrl, { lang, js, viewport });
	await openSceneMore(scene(page));
	return page;
};
const scene = (page) => page.getByTestId('scene').filter({ has: page.getByRole('heading', { name: TITLE, exact: true }) });
const adj = (page) => scene(page).getByTestId('encounter-adjustments');

/** What the adjustments details shows: { count, open, summary, boxes: [{ value, checked, visible }] }. */
export const adjustmentsState = async (page) => {
	const d = adj(page);
	const count = await d.count();
	if (count !== 1) return { count };
	return {
		count,
		open: await d.evaluate((e) => e.open),
		summary: (await d.locator(':scope > summary').textContent()).trim(),
		boxes: await d.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({ value: e.value, checked: e.checked, visible: e.checkVisibility() })))
	};
};
export const generateForm = (page) => scene(page).locator('form[action^="?/generate&"]');
/** Whether the checkboxes sit inside the details. */
export const checkboxesInDetails = async (page) => ({
	inside: await adj(page).locator('input[type=checkbox][name=adjustments]').count(),
	inForm: await generateForm(page).locator('input[type=checkbox][name=adjustments]').count()
});

export const openAdjustments = async (page) => {
	if (!(await adj(page).evaluate((e) => e.open))) await adj(page).locator(':scope > summary').click();
};
export const checkAdjustment = (page, label) => adj(page).getByLabel(label).check();
export const uncheckAdjustment = (page, label) => adj(page).getByLabel(label).uncheck();
/** Click Generate encounter / Regenerate and wait for the page to settle. */
export const submitGenerate = async (page, js = true) => {
	const btn = generateForm(page).locator('button[type=submit]');
	if (js) {
		const done = page.waitForResponse((r) => r.request().method() === 'POST');
		await btn.click();
		await done;
		await page.waitForLoadState('networkidle');
	} else {
		await Promise.all([page.waitForLoadState('load'), btn.click()]);
	}
	await openSceneMore(scene(page));
};
/** The button's text. */
export const generateButtonText = async (page) => (await generateForm(page).locator('button[type=submit]').textContent()).trim();

/** Top/left/bottom of the party-size input, tier input and submit of the generate form. */
export const generateBoxes = (page) =>
	generateForm(page).evaluate((f) => {
		const b = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, bottom: r.bottom }; };
		return { party: b(f.querySelector('input[name=partySize]')), tier: b(f.querySelector('input[name=tier]')), submit: b(f.querySelector('button[type=submit]')) };
	});

/** The Delete encounter row: the button, its classes, the other controls of the section and the section's content right edge. */
export const deleteRow = (page) =>
	scene(page).evaluate((sc) => {
		const btn = [...sc.querySelectorAll('button')].find((b) => b.closest('form[action^="?/deleteEncounter&"]'));
		if (!btn) return null;
		const sec = btn.closest('form').parentElement; // the container holding the encounter section's rows
		const form = btn.closest('form');
		const r = btn.getBoundingClientRect();
		const cs = getComputedStyle(sec);
		const buttons = [...sec.querySelectorAll('button')].filter((b) => b.checkVisibility());
		// the section is the heading's container: controls from the encounter heading on
		const h = [...sec.querySelectorAll('h4')].find((x) => x.nextElementSibling?.matches('form[action^="?/generate&"]'));
		const after = (e) => !h || !!(h.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
		const sectionButtons = buttons.filter((b) => after(b) && b.closest('form[action^="?/generate&"], form[action^="?/setCount&"], form[action^="?/deleteEncounter&"]'));
		return {
			classes: [...btn.classList],
			isLastButton: sectionButtons[sectionButtons.length - 1] === btn,
			top: r.top, bottom: r.bottom, right: r.right, width: r.width, height: r.height,
			contentRight: sec.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
			formClasses: [...form.classList],
			rowMates: [...sec.querySelectorAll('button, input:not([type=hidden]), select, a, summary')].filter((e) => e !== btn && e.checkVisibility() && after(e)).map((e) => { const q = e.getBoundingClientRect(); return { top: q.top, bottom: q.bottom, left: q.left, right: q.right }; })
		};
	});

/** Distinct line tops (4px tolerance) of the controls of: the generate form (excluding the details), each adversary card's rows, the Delete row. */
export const rowLineCounts = (page) =>
	scene(page).evaluate((sc) => {
		const lines = (els) => {
			const tops = els.filter((e) => e.checkVisibility()).map((e) => e.getBoundingClientRect().top).sort((a, b) => a - b);
			const groups = [];
			for (const t of tops) if (!groups.length || t - groups[groups.length - 1] > 4) groups.push(t);
			return groups.length;
		};
		const ctl = (root, skip) => [...root.querySelectorAll('button, input:not([type=hidden]), select, textarea, a, summary')].filter((e) => !skip?.contains(e));
		const gen = sc.querySelector('form[action^="?/generate&"]');
		const out = { generate: lines(ctl(gen, gen.querySelector('[data-testid=encounter-adjustments]'))), cards: [], del: null };
		for (const c of sc.querySelectorAll('[data-testid=encounter-adversary]')) {
			const f = c.querySelector('form[action^="?/setCount&"]');
			out.cards.push(lines(ctl(f)));
		}
		const d = sc.querySelector('form[action^="?/deleteEncounter&"]');
		out.del = d ? lines(ctl(d)) : null;
		return out;
	});

export const horizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Whether the open details sits last in the generate form, after the submit. */
export const detailsAfterSubmit = (page) =>
	generateForm(page).evaluate((f) => {
		const d = f.querySelector('[data-testid=encounter-adjustments]');
		const s = f.querySelector('button[type=submit]');
		return { after: !!(s.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING), classes: d ? [...d.classList] : [], formClasses: [...f.classList], width: d?.getBoundingClientRect().width, formWidth: f.getBoundingClientRect().width };
	});
