import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTION_SECTION, ACTION_TAB, SHEET_TABS, TAB_LABEL, actionHref, parseTab } from './tabs';
import en from '../../../lib/i18n/en.json';
import fr from '../../../lib/i18n/fr.json';

describe('tabs', () => {
	it('parseTab', () => {
		for (const v of [null, '', 'xyz', 'PLAY']) expect(parseTab(v)).toBe('play');
		for (const t of SHEET_TABS) expect(parseTab(t)).toBe(t);
	});
	it('labels exist in both catalogs', () => {
		for (const k of Object.values(TAB_LABEL)) {
			expect(k in en).toBe(true);
			expect(k in fr).toBe(true);
		}
		expect('tab.traits' in en || 'tab.notes' in en).toBe(false);
	});
	it('actionHref', () => {
		expect(actionHref('damage', 'gear')).toBe('?/damage&tab=play');
		expect(actionHref('addItem', 'play')).toBe('?/addItem&tab=gear');
		expect(actionHref('edit', 'cards')).toBe('?/edit&tab=cards');
		expect(actionHref('notes', 'play')).toBe('?/notes&tab=notes');
	});
	it('sections', () => {
		for (const k of ['edit', 'addItem', 'addExperience', 'addCard'] as const) expect(ACTION_SECTION[k]).toBeNull();
		expect(ACTION_SECTION.gold).toBe('sheet-gold');
	});
	it('covers every page action', () => {
		const src = readFileSync(new URL('./+page.server.ts', import.meta.url), 'utf8');
		const body = src.slice(src.indexOf('export const actions'));
		const names = [...body.matchAll(/^\t(\w+): async/gm)].map((m) => m[1]);
		expect(names.length).toBeGreaterThan(10);
		for (const n of names) {
			expect(n in ACTION_TAB, n).toBe(true);
			expect(n in ACTION_SECTION, n).toBe(true);
		}
	});
	it('has no import', () => {
		expect(readFileSync(new URL('./tabs.ts', import.meta.url), 'utf8')).not.toMatch(/^\s*import\s/m);
	});
});
