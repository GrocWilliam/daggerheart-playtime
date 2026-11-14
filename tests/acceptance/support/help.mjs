// Labelled helpers: reads of the `help-open` triggers on a page, and the catalog/SRD names the tests compare with.
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const catalog = { en: json('src/lib/i18n/en.json'), fr: json('src/lib/i18n/fr.json') };
export const label = (lang, key) => catalog[lang][key];
export const helpAria = (lang, name) => `${lang === 'fr' ? 'Aide : ' : 'Help: '}${name}`;

const FR = Object.assign({}, ...['subclasses'].map((f) => json(`src/lib/srd/fr/${f}.json`)));
export const SUBCLASSES = json('src/lib/srd/core/subclasses.json');
const enName = (e) => (typeof e.name === 'string' ? e.name.charAt(0) + e.name.slice(1).toLowerCase() : e.name['en-US']);
export const subclassName = (e, lang) => (lang === 'fr' ? (FR[e.id]?.name ?? enName(e)) : enName(e));

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const OPEN = '[data-testid="help-open"]';

/** Text of every help-open under `scope` (a locator, default the whole page). */
export const helpTexts = async (page, scope) => (await (scope ?? page).locator(OPEN).allTextContents()).map(norm);
/** Text of the help-open of the glossary term `id` (hp, stress, evasion, fear...). */
export const helpTextOf = async (page, id, scope) => norm(await (scope ?? page).locator(`[data-testid="help"][data-help="${id}"] ${OPEN}`).first().textContent());
export const helpCount = (page, id) => page.locator(`[data-testid="help"][data-help="${id}"]`).count();
export const sheetPanel = (page) => page.locator('[data-testid="sheet-panel"]');
export const runCards = (page) => page.locator('[data-testid="character-card"]');
/** The tracker form of `name` (hp, stress, hope, armor) and its visible text. */
export const trackerForm = (page, name) => page.locator('form').filter({ has: page.locator(`[data-testid="${name}"]`) }).first();
export const visibleText = async (loc) => norm(await loc.evaluate((e) => e.innerText));
/** The row of a trait on the traits tab. */
export const traitRow = (page, k) => page.locator('li').filter({ has: page.locator(`[data-testid="trait-${k}"]`) });
/** Computed look and size of every help-open on the page. */
export const helpLooks = (page) => page.locator(OPEN).evaluateAll((els) => els.map((e) => {
	const cs = getComputedStyle(e), r = e.getBoundingClientRect();
	return { text: e.textContent.trim(), aria: e.getAttribute('aria-label'), line: cs.textDecorationLine, style: cs.textDecorationStyle, w: r.width, h: r.height };
}));
/** Open a helper by clicking its trigger; true when its panel is a popover that is open. */
export const openHelp = async (page, id, scope) => {
	const h = (scope ?? page).locator(`[data-testid="help"][data-help="${id}"]`).first();
	await h.locator(OPEN).click();
	return h.locator('[data-testid="help-panel"]').evaluate((e) => e.matches(':popover-open'));
};
