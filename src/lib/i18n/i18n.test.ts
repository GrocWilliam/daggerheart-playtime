import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { formatNumber, resolveLang, translate } from './index';

describe('dictionaries', () => {
	it('have the same keys and no empty value', () => {
		expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
		for (const d of [en, fr]) for (const v of Object.values(d)) expect(v.length).toBeGreaterThan(0);
	});
});

describe('resolveLang', () => {
	it('prefers a valid cookie', () => {
		expect(resolveLang('fr', 'en')).toBe('fr');
		expect(resolveLang('en', 'fr-FR')).toBe('en');
	});
	it('ignores an invalid cookie', () => {
		expect(resolveLang('de', 'fr')).toBe('fr');
		expect(resolveLang('', null)).toBe('en');
	});
	it('picks the first supported Accept-Language entry', () => {
		expect(resolveLang(undefined, 'fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
		expect(resolveLang(undefined, 'de-DE,en;q=0.5')).toBe('en');
		expect(resolveLang(undefined, 'de,es')).toBe('en');
	});
});

describe('translate', () => {
	it('translates and falls back to the key', () => {
		expect(translate('fr', 'language.label')).toBe('Langue');
		expect(translate('fr', 'nope')).toBe('nope');
	});
});

describe('campaign glossary', () => {
	it('translates trackers and badges', () => {
		expect(translate('fr', 'tracker.hp')).toBe('PV');
		expect(translate('fr', 'tracker.hope')).toBe('Espoir');
		expect(translate('fr', 'badge.down')).toBe('À terre');
		expect(translate('en', 'badge.restrained')).toBe('Restrained');
	});
});

describe('character sheet glossary', () => {
	it('translates inventory, gold and gold units', () => {
		expect(translate('fr', 'section.inventory')).toBe('Inventaire');
		expect(translate('fr', 'section.gold')).toBe('Or');
		expect(translate('fr', 'gold.bags')).toBe('bourses');
		expect(translate('en', 'condition.clear.hidden')).toBe('Clear hidden');
	});
});

describe('navigation keys', () => {
	it('defines nav.label and item.actions in both languages', () => {
		expect(translate('en', 'nav.label')).toBe('Main');
		expect(translate('fr', 'nav.label')).toBe('Principale');
		expect(translate('en', 'item.actions')).toBe('Actions');
		expect(translate('fr', 'item.actions')).toBe('Actions');
	});
});

describe('translate params and formatNumber', () => {
	const cat = { en, fr } as Record<string, Record<string, string>>;
	beforeAll(() => {
		cat.en['t.greet'] = 'Hi {name}';
		cat.en['t.items.one'] = '{count} item';
		cat.en['t.items.other'] = '{count} items';
		cat.fr['t.items.one'] = '{count} objet';
		cat.fr['t.items.other'] = '{count} objets';
		cat.en['t.only'] = 'English only';
	});
	afterAll(() => {
		for (const k of ['t.greet', 't.items.one', 't.items.other', 't.only']) delete cat.en[k];
		delete cat.fr['t.items.one'];
		delete cat.fr['t.items.other'];
	});
	it('substitutes placeholders', () => {
		expect(translate('en', 't.greet', { name: 'A' })).toBe('Hi A');
		expect(translate('en', 't.greet', {})).toBe('Hi {name}');
	});
	it('picks plural entries, French 0 being one', () => {
		expect(translate('en', 't.items', { count: 1 })).toBe('1 item');
		expect(translate('en', 't.items', { count: 2 })).toBe('2 items');
		expect(translate('fr', 't.items', { count: 1 })).toBe('1 objet');
		expect(translate('fr', 't.items', { count: 2 })).toBe('2 objets');
		expect(translate('fr', 't.items', { count: 0 })).toBe('0 objet');
	});
	it('falls back to English then the key', () => {
		expect(translate('fr', 't.only')).toBe('English only');
		expect(translate('fr', 't.missing')).toBe('t.missing');
	});
	it('replaces placeholders and leaves unknown ones', () => {
		expect(translate('en', 'nope {x}', { y: 1 })).toBe('nope {x}');
	});
	it('formats numbers per language', () => {
		expect(formatNumber('en', 1234567)).toBe('1,234,567');
		expect(formatNumber('fr', 1234)).toBe('1 234');
	});
});
