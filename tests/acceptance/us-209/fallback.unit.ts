// US-209: localizedSrd falls back to English, field by field, when a French field has the wrong shape.
// run.sh copies this file to the root of a copy of src/lib whose French files mutate.mjs edited ("fallback" case).
import { describe, expect, it } from 'vitest';
import * as mod from './src/lib/server/features/srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const srd = mod as any;
const en = (kind: string, id: string) => srd.localizedSrd(kind, id, 'en').element;

describe('localizedSrd fallback', () => {
	it("a French list of another length falls back to English with lang 'en' (broadsword features)", () => {
		const r = srd.localizedSrd('weapons', 'core_weapon_broadsword', 'fr');
		expect(r.langs.features).toBe('en');
		expect(r.element.features).toEqual(en('weapons', 'core_weapon_broadsword').features);
		expect(r.langs.name).toBe('fr');
		expect(r.element.name).toEqual({ 'en-US': 'Épée large' });
	});
	it('a French field with the English shape is merged, leaves keep the en-US key (greatsword features)', () => {
		const r = srd.localizedSrd('weapons', 'core_weapon_greatsword', 'fr');
		expect(r.langs.features).toBe('fr');
		expect(r.element.features).toEqual([{ name: { 'en-US': 'Massive FR' }, description: [{ paragraph: { 'en-US': 'Texte massif' } }] }]);
		expect(srd.getSrd('weapons', 'core_weapon_greatsword', 'fr').features).toEqual(r.element.features);
		expect(srd.localizedSrd('weapons', 'core_weapon_greatsword', 'en').element.features[0].name).toEqual({ 'en-US': 'Massive' });
	});
	it("a list where English has a string falls back to English with lang 'en' (clank name)", () => {
		const r = srd.localizedSrd('ancestries', 'core_ancestry_clank', 'fr');
		expect(r.langs.name).toBe('en');
		expect(r.element.name).toEqual({ 'en-US': 'Clank' });
		expect(r.element.nameLocalized).toBe('Clank');
	});
	it('adversaries: a French name is used; a feature list of another length stays English', () => {
		const r = srd.localizedSrd('adversaries', 'adv_acid_burrower', 'fr');
		expect(r.langs.name).toBe('fr');
		expect(r.element.name).toBe('Fouisseur acide');
		expect(r.element.nameLocalized).toBe('Fouisseur acide');
		expect(r.langs.feature).toBe('en');
		expect(r.element.feature).toEqual(en('adversaries', 'adv_acid_burrower').feature);
		expect(srd.listSrd('adversaries', 'fr').find((a: { id: string }) => a.id === 'adv_acid_burrower')).toMatchObject({ name: 'Fouisseur acide', nameLang: 'fr' });
		expect(srd.adversariesByTier(undefined, 'fr').find((a: { id: string }) => a.id === 'adv_acid_burrower')).toMatchObject({ name: 'Fouisseur acide', nameLang: 'fr' });
	});
});
