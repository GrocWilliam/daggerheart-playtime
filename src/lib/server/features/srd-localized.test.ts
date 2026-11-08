import { describe, expect, it } from 'vitest';
import {
	adversariesByTier,
	frEntries,
	getSrd,
	listSrd,
	localizedSrd,
	mergeFr,
	pickOptions,
	sameShape,
	searchSrd,
	TRANSLATED_FIELDS
} from './srd';

describe('mergeFr / sameShape', () => {
	it('turns a plain French string into an en-US leaf, recursively', () => {
		expect(mergeFr([{ name: { 'en-US': 'A' }, description: [{ paragraph: { 'en-US': 'B' } }] }], [{ name: 'a', description: [{ paragraph: 'b' }] }])).toEqual([
			{ name: { 'en-US': 'a' }, description: [{ paragraph: { 'en-US': 'b' } }] }
		]);
		expect(mergeFr('Bard', 'Barde')).toBe('Barde');
	});
	it('rejects lists of another length, missing or extra keys, and strings given as lists', () => {
		expect(sameShape([{ 'en-US': 'a' }], ['x', 'y'])).toBe(false);
		expect(sameShape({ name: 'a', text: 'b' }, { name: 'x' })).toBe(false);
		expect(sameShape({ name: 'a', text: 'b' }, { name: 'x', text: 'y', question: 'z' })).toBe(false);
		expect(sameShape({ 'en-US': 'a' }, ['a'])).toBe(false);
		expect(sameShape('a', { 'en-US': 'a' })).toBe(false);
		expect(sameShape({ name: 'a', text: 'b' }, { name: 'x', text: 'y' })).toBe(true);
	});
});

describe('localizedSrd', () => {
	it('translates the broadsword name only; other fields stay English', () => {
		const r = localizedSrd('weapons', 'core_weapon_broadsword', 'fr')!;
		expect(r.langs).toEqual({ name: 'fr', features: 'en' });
		expect(r.element.name).toEqual({ 'en-US': 'Épée large' });
		expect(r.element.nameLocalized).toBe('Épée large');
		const en = localizedSrd('weapons', 'core_weapon_broadsword', 'en')!;
		expect(en.langs).toEqual({ name: 'en', features: 'en' });
		expect(r.element.features).toEqual(en.element.features);
		expect(getSrd('weapons', 'core_weapon_broadsword', 'fr')).toEqual(r.element);
	});
	it('translates tiers 1 and 2 adversaries and keeps the others English', () => {
		const t1 = localizedSrd('adversaries', 'adv_acid_burrower', 'fr')!;
		expect(t1.element.name).toBe('Fouisseur acide');
		expect(t1.langs.name).toBe('fr');
		const all = adversariesByTier(undefined, 'fr');
		expect(all.filter((a) => a.tier > 2).every((a) => a.nameLang === 'en') && all.filter((a) => a.tier <= 2).every((a) => a.nameLang === 'fr')).toBe(true);
	});
	it('returns null for an unknown id', () => {
		expect(localizedSrd('weapons', 'nope', 'fr')).toBeNull();
	});
});

describe('lists, search and picks', () => {
	it('lists names with their language', () => {
		expect(listSrd('domains', 'fr').find((d) => d.id === 'core_domain_arcana')).toEqual({ id: 'core_domain_arcana', name: 'Arcanes', nameLang: 'fr' });
		expect(listSrd('environments', 'fr').every((e) => e.nameLang === 'en')).toBe(true);
	});
	it('searches French names only in French', () => {
		const ids = (q: string, lang: 'en' | 'fr') => searchSrd('weapons', q, lang)[0].items.map((i) => i.id);
		expect(ids('épée large', 'fr')).toContain('core_weapon_broadsword');
		expect(ids('broadsword', 'fr')).toContain('core_weapon_broadsword');
		expect(ids('épée large', 'en')).not.toContain('core_weapon_broadsword');
	});
	it('keeps English option values', () => {
		expect(pickOptions('classes', 'fr')).toContainEqual({ value: 'Bard', label: 'Barde' });
	});
	it('exposes the overlays and translated fields', () => {
		expect(frEntries('classes').core_class_bard).toMatchObject({ name: 'Barde' });
		expect(TRANSLATED_FIELDS.domains).toEqual(['name']);
	});
});
