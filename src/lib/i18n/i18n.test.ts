import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { resolveLang, translate } from './index';

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
