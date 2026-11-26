// The /reference page (US-411): sections and entries as native <details>. Actions and reads only: no assertions.
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL('../../../' + p, import.meta.url), 'utf8').replace(/^﻿/, ''));
const catalog = { en: json('src/lib/i18n/en.json'), fr: json('src/lib/i18n/fr.json') };

export const REF_KINDS = ['classes', 'subclasses', 'ancestries', 'communities', 'domains', 'domain-cards', 'weapons', 'armors', 'consumables', 'items', 'rules', 'adversaries', 'environments'];
export const referenceUrl = (base, qs = '') => `${base}/reference${qs}`;
/** A catalog string, by key, as written in the catalog file. */
export const catalogValue = (lang, key) => catalog[lang][key];
/** Every catalog key starting with `prefix`, with its value. */
export const catalogKeys = (lang, prefix) => Object.fromEntries(Object.entries(catalog[lang]).filter(([k]) => k === prefix || k.startsWith(prefix + '.')));
/** SRD source files: the English core entry and the French overlay of an id. */
// Flat files (adversaries, environments) have no id: it is `adv_`/`env_` + the name, lowercased, non-alphanumeric runs as '_'.
const flatId = (prefix, name) => `${prefix}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
export const englishSrd = (file, id) => json(`src/lib/srd/${file}.json`).find((e) => (e.id ?? flatId(file === 'adversaries' ? 'adv' : 'env', e.name)) === id);
export const frenchOverlay = (kind, id) => json(`src/lib/srd/fr/${kind}.json`)[id];
/** SRD list of a kind through the API: [{ id, name, nameLang }]. */
export const srdList = async (base, kind, lang) => (await fetch(`${base}/api/srd/${kind}`, { headers: { cookie: `lang=${lang}` } })).json();

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const SECTION = (kind) => `[data-testid="ref-${kind}"]`;
const ITEM = '[data-testid="ref-item"]';

export const section = (page, kind) => page.locator(SECTION(kind));
/** Tag name, open state and summary text of the section of `kind` (null when absent). */
export const sectionState = async (page, kind) => {
	const s = section(page, kind);
	if ((await s.count()) === 0) return null;
	return s.evaluate((e) => {
		const summary = e.tagName === 'DETAILS' ? e.querySelector(':scope > summary') : null;
		return { tag: e.tagName, hasOpenAttr: e.hasAttribute('open'), open: !!e.open, summary: summary ? summary.textContent.replace(/\s+/g, ' ').trim() : null };
	});
};
/** Number of entries in the section of `kind`. */
export const entryCount = (page, kind) => section(page, kind).locator(ITEM).count();
/** Click the summary of a section. */
export const openSection = (page, kind) => section(page, kind).locator(':scope > summary').click();
/** Open every section by clicking its summary. */
export const openAllSections = async (page) => {
	for (const k of REF_KINDS) if ((await section(page, k).count()) > 0 && !(await section(page, k).evaluate((e) => e.open))) await openSection(page, k);
};
/** Kinds whose section is open. */
export const openSections = async (page) => {
	const out = [];
	for (const k of REF_KINDS) if ((await section(page, k).count()) > 0 && (await section(page, k).evaluate((e) => e.open))) out.push(k);
	return out;
};
/** True when every entry of the section is rendered (not inside a closed <details>). */
export const entriesVisible = (page, kind) => section(page, kind).locator(ITEM).evaluateAll((els) => els.length > 0 && els.every((e) => { return e.checkVisibility(); }));

/** For each entry of a section: does it hold a <details>, and the name element of its summary (text, lang). */
export const entrySummaries = (page, kind) => section(page, kind).locator(ITEM).evaluateAll((els) => els.map((li) => {
	const d = li.querySelector('details'), s = d?.querySelector(':scope > summary');
	const named = s ? [...s.querySelectorAll('[lang]')].map((e) => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), lang: e.getAttribute('lang') })) : [];
	return { details: !!d, summary: s ? s.textContent.replace(/\s+/g, ' ').trim() : null, named };
}));

/** The entry of `kind` whose summary shows exactly `name`. */
export const entry = (page, kind, name) => section(page, kind).locator(ITEM).filter({ has: page.locator('summary').getByText(name, { exact: true }) });
/** Click the summary of an entry. */
export const openEntry = (page, kind, name) => entry(page, kind, name).locator('details > summary').first().click();
/** True when the entry's details is open. */
export const entryOpen = (page, kind, name) => entry(page, kind, name).locator('details').first().evaluate((d) => d.open);
/**
 * Inline lines of an opened entry, below its summary: innermost elements carrying a `lang` attribute, with their text,
 * whether they are visible, and whether they sit after the summary inside the same <details>.
 */
export const entryLines = (page, kind, name) => entry(page, kind, name).locator('details').first().evaluate((d) =>
	[...d.querySelectorAll('[lang]')].filter((e) => !e.closest('summary') && !e.querySelector('[lang]')).map((e) => {
		return { lang: e.getAttribute('lang'), text: e.textContent.replace(/\s+/g, ' ').trim(), visible: e.checkVisibility() };
	}).filter((l) => l.text));
/** Visible text of an entry (summary and opened body). */
export const entryText = async (page, kind, name) => norm(await entry(page, kind, name).evaluate((e) => e.innerText));
/** For each text node of the entry containing `text`: the lang of its nearest [lang] ancestor. */
export const entryLangsOf = (page, kind, name, text) => entry(page, kind, name).evaluate((el, text) => {
	const out = [];
	const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.replace(/\s+/g, ' ').includes(text)) out.push(n.parentElement.closest('[lang]')?.getAttribute('lang') ?? null);
	return out;
}, text);

/** Heights of every visible section summary and entry summary on the page. */
export const summaryHeights = (page) => page.evaluate(() => {
	const box = (s) => s.getBoundingClientRect();
	const sections = [...document.querySelectorAll('details[data-testid^="ref-"]:not([data-testid="ref-item"]) > summary')].map((s) => ({ kind: s.parentElement.dataset.testid, h: box(s).height }));
	const entries = [...document.querySelectorAll('[data-testid="ref-item"] details > summary')].filter((s) => s.checkVisibility()).map((s) => ({ name: s.textContent.replace(/\s+/g, ' ').trim(), h: box(s).height }));
	return { sections, entries };
});
/** Number of `help-open` triggers on the page. */
export const helpOpenCount = (page) => page.locator('[data-testid="help-open"]').count();
/** Sideways scroll of the page in px. */
export const sideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ---- US-412: client filter, chips, Filter button
const FORM = 'form[action="/reference"]';
const chip = (page, kind) => page.locator(`[data-testid="ref-chip-${kind}"]`);
/** Type in the filter input (fires `input` events, no submit). */
export const typeFilter = (page, text) => page.locator(`${FORM} input[name="q"]`).fill(text);
/** Wait until the chips have been rendered (JavaScript has run). */
export const waitForChips = (page) => page.locator('[data-testid^="ref-chip-"]').first().waitFor();
export const chipCount = (page) => page.locator('[data-testid^="ref-chip-"]').count();
export const clickChip = (page, kind) => chip(page, kind).click();
/** Kinds having a chip, in DOM order. */
export const chipKinds = (page) => page.locator('[data-testid^="ref-chip-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice('ref-chip-'.length)));
/** Kinds having a section, in DOM order. */
export const sectionKinds = (page) => page.evaluate(() => [...document.querySelectorAll('details[data-testid^="ref-"]')].filter((e) => e.dataset.testid !== 'ref-item').map((e) => e.dataset.testid.slice(4)));
/** Properties of a chip: tag, type, class, aria-pressed, size, text, background colour. */
export const chipInfo = (page, kind) => chip(page, kind).evaluate((e) => {
	const r = e.getBoundingClientRect();
	return { tag: e.tagName, type: e.getAttribute('type'), cls: e.className, pressed: e.getAttribute('aria-pressed'), w: r.width, h: r.height, text: e.textContent.replace(/\s+/g, ' ').trim(), bg: getComputedStyle(e).backgroundColor };
});
/** Kinds whose section is shown (rendered). */
export const shownSections = (page) => page.evaluate(() => [...document.querySelectorAll('details[data-testid^="ref-"]')].filter((e) => e.dataset.testid !== 'ref-item' && e.checkVisibility()).map((e) => e.dataset.testid.slice(4)));
/** Name and text of every visible entry of the page. */
export const visibleEntries = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="ref-item"]')].filter((e) => e.checkVisibility()).map((e) => ({ kind: e.closest('details[data-testid^="ref-"]:not([data-testid="ref-item"])')?.dataset.testid.slice(4), name: e.querySelector('summary .font-display')?.textContent.trim() ?? '', text: e.textContent.replace(/\s+/g, ' ').trim() })));
/** Is the entry's list item visible (its own disclosure may be closed)? */
export const entryShown = (page, kind, name) => entry(page, kind, name).first().evaluate((e) => e.checkVisibility());
/** Heights of the Filter button and of the q input. */
export const filterHeights = (page) => page.evaluate((f) => ({ button: document.querySelector(`${f} button[type="submit"]`).getBoundingClientRect().height, input: document.querySelector(`${f} input[name="q"]`).getBoundingClientRect().height }), FORM);
export const submitFilter = (page) => page.locator(`${FORM} button[type="submit"]`).click();
export const pageHeight = (page) => page.evaluate(() => document.documentElement.scrollHeight);
export const uiDoc = () => readFileSync(new URL('../../../docs/ui.md', import.meta.url), 'utf8');
