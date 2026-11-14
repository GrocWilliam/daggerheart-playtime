import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import Modal from '../../../src/lib/components/Modal.svelte';
import en from '../../../src/lib/i18n/en.json';
import fr from '../../../src/lib/i18n/fr.json';
import * as tabs from '../../../src/routes/characters/[id]/tabs';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/characters/abc'), form: null } }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));

const TABS = ['play', 'traits', 'gear', 'cards', 'notes'];
const { parseTab, actionHref, ACTION_SECTION, ACTION_TAB, TAB_LABEL, SHEET_TABS } = tabs;

describe('SHEET_TABS', () => {
	it('equals the five tabs in order', () => {
		expect([...SHEET_TABS]).toEqual(TABS);
	});
});

describe('parseTab', () => {
	it('falls back to play for null, empty, unknown and wrong-case values', () => {
		for (const v of [null, '', 'xyz', 'PLAY']) expect(parseTab(v)).toBe('play');
	});
	it('returns each valid tab', () => {
		for (const t of TABS) expect(parseTab(t)).toBe(t);
	});
});

describe('actionHref', () => {
	it('uses the action tab, or the current one when null', () => {
		expect(actionHref('damage', 'gear')).toBe('?/damage&tab=play');
		expect(actionHref('addItem', 'play')).toBe('?/addItem&tab=gear');
		expect(actionHref('edit', 'cards')).toBe('?/edit&tab=cards');
		expect(actionHref('notes', 'play')).toBe('?/notes&tab=notes');
	});
});

describe('ACTION_TAB', () => {
	it('maps every action to its tab', () => {
		const exp: Record<string, string | null> = {
			tracker: 'play', damage: 'play', condition: 'play',
			setExperience: 'traits', addExperience: 'traits', removeExperience: 'traits',
			equip: 'gear', gold: 'gear', addItem: 'gear', setQuantity: 'gear', removeItem: 'gear',
			addCard: 'cards', removeCard: 'cards', notes: 'notes', edit: null
		};
		for (const [k, v] of Object.entries(exp)) expect((ACTION_TAB as Record<string, unknown>)[k]).toBe(v);
	});
});

describe('ACTION_SECTION', () => {
	it('is null for modal actions and a sheet-* id for inline ones', () => {
		const s = ACTION_SECTION as Record<string, string | null>;
		for (const k of ['edit', 'addItem', 'addExperience', 'addCard']) expect(s[k]).toBeNull();
		const exp: Record<string, string> = {
			tracker: 'sheet-trackers', damage: 'sheet-trackers', condition: 'sheet-conditions',
			setExperience: 'sheet-experiences', removeExperience: 'sheet-experiences', equip: 'sheet-equipment',
			gold: 'sheet-gold', setQuantity: 'sheet-inventory', removeItem: 'sheet-inventory',
			removeCard: 'sheet-cards', notes: 'sheet-notes'
		};
		for (const [k, v] of Object.entries(exp)) expect(s[k]).toBe(v);
	});
});

describe('actions coverage', () => {
	it('every key of actions has an entry in both maps', () => {
		const src = readFileSync(new URL('../../../src/routes/characters/[id]/+page.server.ts', import.meta.url), 'utf8');
		const body = src.slice(src.indexOf('export const actions'));
		const names = [...body.matchAll(/^\t(\w+): async/gm)].map((m) => m[1]);
		expect(names.length).toBeGreaterThan(10);
		for (const n of names) {
			expect(Object.hasOwn(ACTION_TAB, n), n).toBe(true);
			expect(Object.hasOwn(ACTION_SECTION, n), n).toBe(true);
		}
	});
});

describe('TAB_LABEL', () => {
	it('maps to catalog keys', () => {
		expect({ ...TAB_LABEL }).toEqual({
			play: 'tab.play', traits: 'section.traits', gear: 'tab.gear', cards: 'tab.cards', notes: 'section.notes'
		});
	});
});

describe('catalog', () => {
	it('has the new tab keys', () => {
		expect([en['tab.play'], en['tab.gear'], en['tab.cards']]).toEqual(['Play', 'Gear', 'Cards']);
		expect([fr['tab.play'], fr['tab.gear'], fr['tab.cards']]).toEqual(['Jeu', 'Équipement', 'Cartes']);
		for (const c of [en, fr] as Record<string, string>[]) {
			expect(c['tab.traits']).toBeUndefined();
			expect(c['tab.notes']).toBeUndefined();
		}
		expect(en['section.traits']).toBeTruthy();
		expect(fr['section.notes']).toBeTruthy();
	});
});

describe('tabs.ts', () => {
	it('has no import statement', () => {
		const src = readFileSync(new URL('../../../src/routes/characters/[id]/tabs.ts', import.meta.url), 'utf8');
		expect(src).not.toMatch(/^\s*import[\s{*'"]/m);
	});
});

describe('Modal params', () => {
	const hrefs = (html: string) => {
		const get = (id: string) => {
			const m = html.match(new RegExp(`<a[^>]*data-testid="${id}"[^>]*>`));
			expect(m, id).toBeTruthy();
			const h = m![0].match(/href="([^"]*)"/)![1].replace(/&amp;/g, '&');
			return new URLSearchParams(h.split('?')[1] ?? '');
		};
		return { open: get('new-item'), cancel: get('modal-cancel') };
	};
	it('adds params to the opener and Cancel hrefs', () => {
		const { body } = render(Modal as unknown as Component<Record<string, unknown>>, {
			props: { kind: 'item', title: 'T', lang: 'en', params: { tab: 'gear' }, children: ($$payload: unknown, cancel: (p: unknown) => void) => cancel($$payload) }
		});
		const { open, cancel } = hrefs(body);
		expect(Object.fromEntries(open)).toEqual({ new: 'item', tab: 'gear' });
		expect(Object.fromEntries(cancel)).toEqual({ tab: 'gear' });
	});
	it('still works without params', () => {
		const { body } = render(Modal as unknown as Component<Record<string, unknown>>, { props: { kind: 'item', title: 'T', lang: 'en', children: ($$payload: unknown, cancel: (p: unknown) => void) => cancel($$payload) } });
		const { open, cancel } = hrefs(body);
		expect(Object.fromEntries(open)).toEqual({ new: 'item' });
		expect([...cancel]).toEqual([]);
	});
});
