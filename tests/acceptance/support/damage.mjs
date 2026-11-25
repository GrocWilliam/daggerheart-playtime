// Quick damage buttons (DamageForm): setup over HTTP, form posts, reads. No expected values here.
import { createCampaign, createCharacter } from './api.mjs';

const json = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return r.json().catch(() => null);
};

/** Fresh character: thresholds 7/14, HP 0/6, Armor 0/3, no condition, alone in its campaign. */
export const freshCharacter = async (base, name = 'Quill') => {
	const campaignId = await createCampaign(base, 'Quickcamp ' + name);
	const id = await createCharacter(base, campaignId, name, { majorThreshold: 7, severeThreshold: 14, maxHp: 6, armorSlots: 3 });
	return { campaignId, id };
};
export const marks = async (base, id) => { const c = await json(base, 'GET', `/api/characters/${id}`); return { hp: c.hp.marked, armor: c.armor.marked }; };

/** Plain form POST (what a browser without JavaScript sends). */
const post = async (base, url, fields) => {
	const r = await fetch(base + url, { method: 'POST', redirect: 'manual',
		headers: { origin: base, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
	return { status: r.status, location: r.headers.get('location') };
};
export const postRunDamage = (base, campaignId, characterId, fields) => post(base, `/campaigns/${campaignId}?/damage&step=run`, { characterId, ...fields });
export const postSheetDamage = (base, characterId, fields) => post(base, `/characters/${characterId}?/damage&tab=play`, fields);

// --- browser
export const runUrl = (base, campaignId) => `${base}/campaigns/${campaignId}?step=run`;
export const form = (scope) => scope.locator('form[action^="?/damage"]');
export const quickButton = (scope, kind) => form(scope).getByTestId(`damage-${kind}`);
export const quickTexts = async (scope) => Promise.all(['minor', 'major', 'severe'].map(async (k) => (await quickButton(scope, k).textContent()).trim()));
export const tapQuick = (scope, kind) => quickButton(scope, kind).click();
export const checkUseArmor = (scope) => form(scope).locator('input[name=useArmor]').check();
export const clickApply = (scope) => form(scope).locator('button[type=submit]').click();
export const amountInput = (scope) => form(scope).locator('input[name=amount]');
export const amountBlocked = (scope) => amountInput(scope).evaluate((i) => !i.validity.valid);
export const hpText = async (scope) => (await scope.getByTestId('hp').first().textContent()).trim();
export const armorText = async (scope) => (await scope.getByTestId('armor').first().textContent()).trim();
/** Visible label text for the amount field (empty string when none). */
export const otherLabel = (scope) => amountInput(scope).evaluate((i) => {
	const l = i.closest('label'); if (!l) return '';
	const clone = l.cloneNode(true); clone.querySelectorAll('input,.sr-only').forEach((e) => e.remove());
	return clone.textContent.trim();
});
/** Left-to-right order check data: boxes of quick buttons, label, amount, checkbox, apply. */
export const layout = (scope) => form(scope).evaluate((f) => {
	const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom }; };
	const q = (k) => r(f.querySelector(`[data-testid=damage-${k}]`));
	const label = f.querySelector('input[name=amount]').closest('label');
	return { minor: q('minor'), major: q('major'), severe: q('severe'), amount: r(f.querySelector('input[name=amount]')), label: r(label),
		armor: r(f.querySelector('input[name=useArmor]')), apply: r(f.querySelector('button[type=submit]')) };
});
export const quickLook = (scope, kind) => quickButton(scope, kind).evaluate((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
	return { cls: [...e.classList], color: c.color, bg: c.backgroundColor, w: r.width, h: r.height, type: e.getAttribute('type') }; });
export const applyLook = (scope) => form(scope).locator('button[type=submit]').evaluate((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
	return { cls: [...e.classList], color: c.color, bg: c.backgroundColor, w: r.width, h: r.height }; });
export const cardOf = (page, name) =>
	page.getByTestId('character-card').filter({ has: page.getByTestId('character-name').filter({ hasText: name }) });
export const cardHeight = (card) => card.evaluate((e) => e.getBoundingClientRect().height);
export const sideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
export const markNavigation = (page) => page.evaluate(() => { window.__noReload = true; });
export const wasReloaded = (page) => page.evaluate(() => window.__noReload !== true);
export const sheetUrl = (base, id) => `${base}/characters/${id}?tab=play`;
export const uiDoc = async () => (await import('node:fs/promises')).readFile(new URL('../../../docs/ui.md', import.meta.url), 'utf8');

// --- damage confirmation (damage-result live region)
export const damageResult = (scope) => scope.getByTestId('damage-result');
export const damageResultCount = (page) => page.getByTestId('damage-result').count();
export const damageResultText = async (scope) => (await damageResult(scope).textContent()).replace(/\s+/g, ' ').trim();
export const damageResultAria = (scope) => damageResult(scope).evaluate((e) => ({ role: e.getAttribute('role'), live: e.getAttribute('aria-live') }));
export const waitForDamageResult = (page, text) =>
	page.waitForFunction((t) => document.querySelector('[data-testid=damage-result]')?.textContent.replace(/\s+/g, ' ').trim() === t, text);
export const sheetTabUrl = (base, id, tab, query = '') => `${base}/characters/${id}?tab=${tab}${query}`;
