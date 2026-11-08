// US-209 unit criteria on src/lib/server/features/srd.ts (run from the repo root).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as mod from '../../../src/lib/server/features/srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const srd = mod as any;
const core = (f: string) => JSON.parse(fs.readFileSync(`src/lib/srd/core/${f}`, 'utf8'));
const CORE_FILES: Record<string, string> = {
	classes: 'classes.json', subclasses: 'subclasses.json', ancestries: 'ancestries.json', communities: 'communities.json',
	'domain-cards': 'domain-cards.json', weapons: 'weapons.json', armors: 'armors.json', consumables: 'consumables.json',
	items: 'items.json', rules: 'rules.json'
};
const broadsword = () => core('weapons.json').find((e: { id: string }) => e.id === 'core_weapon_broadsword');
const hasEnUs = (n: unknown): boolean =>
	Array.isArray(n) ? n.some(hasEnUs) : !!n && typeof n === 'object' && ('en-US' in (n as object) || Object.values(n as object).some(hasEnUs));

describe('TRANSLATED_FIELDS', () => {
	it('TRANSLATED_FIELDS.adversaries equals name, description, motives_and_tactics, experience, attack, feature', () => {
		expect([...srd.TRANSLATED_FIELDS.adversaries]).toEqual(['name', 'description', 'motives_and_tactics', 'experience', 'attack', 'feature']);
	});
	it('TRANSLATED_FIELDS.domains equals [name]', () => {
		expect([...srd.TRANSLATED_FIELDS.domains]).toEqual(['name']);
	});
	it('TRANSLATED_FIELDS.environments holds name, description, impulses, potential_adversaries, feature', () => {
		expect([...srd.TRANSLATED_FIELDS.environments].sort()).toEqual(['description', 'feature', 'impulses', 'name', 'potential_adversaries']);
	});
	it('core kinds: every top-level key whose subtree holds an en-US leaf (classes also name)', () => {
		for (const [kind, f] of Object.entries(CORE_FILES)) {
			const keys = new Set<string>();
			for (const e of core(f)) for (const [k, v] of Object.entries(e)) if (hasEnUs(v)) keys.add(k);
			if (kind === 'classes') keys.add('name');
			expect([...srd.TRANSLATED_FIELDS[kind]].sort(), kind).toEqual([...keys].sort());
		}
	});
});

describe('localizedSrd', () => {
	it("weapons broadsword in fr: langs.name === 'fr', translated features come from the overlay with lang 'fr'", () => {
		const r = srd.localizedSrd('weapons', 'core_weapon_broadsword', 'fr');
		const en = broadsword();
		expect(r.langs.name).toBe('fr');
		expect(r.langs.features).toBe('fr');
		expect(r.element.name).toEqual({ 'en-US': 'Épée large' });
		expect(r.element.nameLocalized).toBe('Épée large');
		const fr = JSON.parse(fs.readFileSync('src/lib/srd/fr/weapons.json', 'utf8')).core_weapon_broadsword;
		expect(r.element.features).not.toEqual(en.features);
		expect(JSON.stringify(r.element.features)).toContain(fr.features[0].name);
		expect({ ...r.element, name: en.name, features: en.features, nameLocalized: undefined }).toEqual({ ...en, nameLocalized: undefined });
	});
	it("in en every field is English and every lang is 'en'", () => {
		const r = srd.localizedSrd('weapons', 'core_weapon_broadsword', 'en');
		expect(r.element).toEqual({ ...broadsword(), nameLocalized: 'Broadsword' });
		expect(r.langs.name).toBe('en');
		expect(r.langs.features).toBe('en');
		for (const v of Object.values(r.langs)) expect(v).toBe('en');
	});
	it('classes keep a plain-string name: Bard in fr is Barde, nameLocalized Barde', () => {
		const r = srd.localizedSrd('classes', 'core_class_bard', 'fr');
		expect(r.element.name).toBe('Barde');
		expect(r.element.nameLocalized).toBe('Barde');
		expect(r.langs.name).toBe('fr');
		expect(r.langs.description).toBe('fr');
	});
	it('domains: core_domain_arcana in fr has name {"en-US": "Arcanes"}', () => {
		const r = srd.localizedSrd('domains', 'core_domain_arcana', 'fr');
		expect(r.element.name).toEqual({ 'en-US': 'Arcanes' });
		expect(r.element.nameLocalized).toBe('Arcanes');
		expect(r.langs.name).toBe('fr');
	});
	it('unknown id answers null', () => {
		expect(srd.localizedSrd('weapons', 'nope', 'fr')).toBeNull();
	});
	it('getSrd returns localizedSrd(...).element, null for an unknown id', () => {
		expect(srd.getSrd('weapons', 'core_weapon_broadsword', 'fr')).toEqual(srd.localizedSrd('weapons', 'core_weapon_broadsword', 'fr').element);
		expect(srd.getSrd('weapons', 'nope', 'fr')).toBeNull();
	});
});

describe('frEntries', () => {
	it('returns the raw French file', () => {
		for (const kind of ['weapons', 'classes', 'domains', 'adversaries']) {
			expect(srd.frEntries(kind), kind).toEqual(JSON.parse(fs.readFileSync(`src/lib/srd/fr/${kind}.json`, 'utf8')));
		}
	});
});

describe('searchSrd', () => {
	const ids = (q: string, lang: string) =>
		srd.searchSrd(undefined, q, lang).flatMap((g: { items: { id: string }[] }) => g.items.map((i) => i.id));
	it("searchSrd(undefined, 'épée', 'fr') finds core_weapon_broadsword", () => {
		expect(ids('épée', 'fr')).toContain('core_weapon_broadsword');
	});
	it("searchSrd(undefined, 'broadsword', 'fr') finds core_weapon_broadsword", () => {
		expect(ids('broadsword', 'fr')).toContain('core_weapon_broadsword');
	});
	it("searchSrd(undefined, 'épée', 'en') does not find it", () => {
		expect(ids('épée', 'en')).not.toContain('core_weapon_broadsword');
	});
});

describe('pickOptions', () => {
	it("pickOptions('classes','fr') contains { value: 'Bard', label: 'Barde' }", () => {
		expect(srd.pickOptions('classes', 'fr')).toContainEqual({ value: 'Bard', label: 'Barde' });
		expect(srd.pickOptions('classes', 'en')).toContainEqual({ value: 'Bard', label: 'Bard' });
	});
});

describe('listSrd and adversariesByTier with nameLang', () => {
	it("listSrd('classes','fr') lists Barde with nameLang 'fr'; en lists Bard with nameLang 'en'", () => {
		expect(srd.listSrd('classes', 'fr').find((c: { id: string }) => c.id === 'core_class_bard')).toMatchObject({ name: 'Barde', nameLang: 'fr' });
		expect(srd.listSrd('classes', 'en').find((c: { id: string }) => c.id === 'core_class_bard')).toMatchObject({ name: 'Bard', nameLang: 'en' });
	});
	it("adversariesByTier in fr returns French names with nameLang 'fr' for tier 1, plus tier and role", () => {
		const en = srd.adversariesByTier(1, 'en');
		const fr = srd.adversariesByTier(1, 'fr');
		expect(fr.length).toBeGreaterThan(0);
		expect(fr.map((a: { id: string }) => a.id)).toEqual(en.map((a: { id: string }) => a.id));
		fr.forEach((a: Record<string, unknown>, i: number) => {
			expect(a.name).not.toBe(en[i].name);
			expect(a.nameLang).toBe('fr');
			expect(a.tier).toBe(1);
			expect(a.role).toBe(en[i].role);
		});
	});
});
