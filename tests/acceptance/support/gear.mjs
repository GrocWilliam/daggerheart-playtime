// Character sheet, Gear tab (US-409): setup over HTTP, equipment and gold actions and reads. No assertions.
import { createCampaign, createCharacter } from './api.mjs';

const call = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
	return r.json().catch(() => null);
};

export const UNITS = ['handfuls', 'bags', 'chests'];

/** A level-1 character holding `chests`, `bags` and `handfuls` of gold (set through the gold endpoint). Returns its id. */
export const characterWithGold = async (base, { chests = 0, bags = 0, handfuls = 0 } = {}) => {
	const camp = await createCampaign(base, 'Gear camp');
	const id = await createCharacter(base, camp, 'Gale', { level: 1, maxStress: 6 });
	const total = chests * 100 + bags * 10 + handfuls;
	if (total) await call(base, 'POST', `/api/characters/${id}/gold`, { handfuls: total });
	return id;
};

export const apiCharacter = (base, id) => call(base, 'GET', `/api/characters/${id}`);
export const apiGold = async (base, id) => (await apiCharacter(base, id)).gold;

const norm = (s) => s.replace(/[\s  ]+/g, ' ').trim();

/** The gold line as numbers, whatever the language: { chests, bags, handfuls }. */
export const goldShown = async (page) => {
	const n = (norm(await page.locator('[data-testid="gold"]').innerText()).match(/\d+/g) ?? []).map(Number);
	return { chests: n[0], bags: n[1], handfuls: n[2] };
};

const stepper = (page, unit, dir) => page.locator(`[data-testid="gold-${unit}-${dir}"]`);
export const clickGoldStepper = (page, unit, dir) => stepper(page, unit, dir).click();
/** Click a stepper and wait for the POST it triggers (JavaScript on). */
export const clickGoldStepperAndWait = (page, unit, dir) =>
	Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), stepper(page, unit, dir).click()]).then(() => page.waitForLoadState('networkidle'));
export const clickGoldStepperNavigating = (page, unit, dir) => Promise.all([page.waitForNavigation(), stepper(page, unit, dir).click()]);

export const goldAlertCount = (page) => page.locator('[data-testid="sheet-gold"] [role="alert"]').count();

const freeForm = (page) => page.locator('[data-testid="sheet-gold"] form:has(input[name="handfuls"])');
export const enterFreeGold = (page, n) => freeForm(page).locator('input[name="handfuls"]').fill(String(n));
export const submitFreeGold = (page) => Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), freeForm(page).locator('button[type="submit"]').click()]).then(() => page.waitForLoadState('networkidle'));

/** Box, classes and accessible name of a stepper. */
export const stepperLook = (page, unit, dir) => stepper(page, unit, dir).evaluate((e) => {
	const r = e.getBoundingClientRect();
	return { w: r.width, h: r.height, cls: [...e.classList], name: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim() };
});

const equipForm = (page, field) => page.locator(`[data-testid="sheet-equipment"] form:has(select[name="${field}"])`);
export const choosePrimaryWeaponAndWait = (page, id) =>
	Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), equipForm(page, 'primaryWeapon').locator('select').selectOption(id)]).then(() => page.waitForLoadState('networkidle'));
export const choosePrimaryWeapon = (page, id) => equipForm(page, 'primaryWeapon').locator('select').selectOption(id);
export const clickEquip = (page) => Promise.all([page.waitForNavigation(), equipForm(page, 'primaryWeapon').locator('button[type="submit"]').click()]);
export const primaryWeaponText = (page) => page.locator('[data-testid="primary-weapon"]').innerText();
export const EQUIP_FIELDS = ['primaryWeapon', 'secondaryWeapon', 'armorId'];
/** Per equipment form: size of its Equip button, and how many of its submit buttons are bigger than 1x1. */
export const equipButtons = (page) => page.locator('[data-testid="sheet-equipment"] form').evaluateAll((forms) =>
	forms.filter((f) => f.querySelector('select')).map((f) => {
		const subs = [...f.querySelectorAll('button[type="submit"]')].map((b) => b.getBoundingClientRect());
		return { field: f.querySelector('select').name, count: subs.length, hidden: subs.map((r) => [r.width, r.height]), visible: subs.filter((r) => r.width > 1 || r.height > 1).length };
	}));

/** The gold section heading: its text, its help-open texts and tag. */
export const goldHeading = (html) => {
	const sec = html.slice(html.indexOf('data-testid="sheet-gold"'));
	const m = sec.match(/<h2\b[\s\S]*?<\/h2>/);
	return m?.[0] ?? '';
};
