// us-210 unit tests: helpLines(kind, element, langs, lang) returns Line[] (facts line first, in the page lang;
// text lines in the lang of their field), and the catalog keys the story names.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import * as srd from '../../../src/lib/server/features/srd';

const cat = (lang: string): Record<string, string> =>
	JSON.parse(readFileSync(new URL(`../../../src/lib/i18n/${lang}.json`, import.meta.url), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const helpLines = (srd as any).helpLines as (kind: string, e: unknown, langs: Record<string, string>, lang: string) => { text: string; lang: string }[];

const loc = (kind: srd.SrdKind, id: string, lang: 'en' | 'fr') => {
	const r = srd.localizedSrd(kind, id, lang);
	if (!r) throw new Error(`${kind} ${id} missing`);
	return r;
};

describe('helpLines(kind, element, langs, lang)', () => {
	test("helpLines('weapons', e, langs, 'fr') returns a first Line with lang 'fr' (Mêlée, dice kept)", () => {
		const { element, langs } = loc('weapons', 'core_weapon_broadsword', 'fr');
		const lines = helpLines('weapons', element, langs, 'fr');
		expect(Array.isArray(lines)).toBe(true);
		expect(lines[0].lang).toBe('fr');
		expect(lines[0].text).toContain('Mêlée');
		expect(lines[0].text).toContain('D8');
		for (const l of lines) expect(typeof l.text).toBe('string');
	});

	test("helpLines('weapons', e, langs, 'en') returns a first Line with lang 'en' (Melee)", () => {
		const { element, langs } = loc('weapons', 'core_weapon_broadsword', 'en');
		const lines = helpLines('weapons', element, langs, 'en');
		expect(lines[0].lang).toBe('en');
		expect(lines[0].text).toContain('Melee');
	});

	test('a feature line stays "<name>: <text>" and carries langs.features', () => {
		const { element, langs } = loc('weapons', 'core_weapon_broadsword', 'en');
		const lines = helpLines('weapons', element, { ...langs, features: 'en' }, 'fr');
		const feat = lines.find((l) => l.text.includes('+1 to attack rolls'));
		expect(feat).toBeDefined();
		expect(feat!.text).toBe('Reliable: +1 to attack rolls');
		expect(feat!.lang).toBe('en');
		expect(lines[0].lang).toBe('fr');
	});

	test("with langs.description === 'en', the description lines have lang 'en'", () => {
		const { element, langs } = loc('classes', 'core_class_bard', 'en');
		const ls = { ...langs, description: 'en' };
		const lines = helpLines('classes', element, ls, 'fr');
		const desc = lines.filter((l) => l.text.includes('Bards are the most charismatic people'));
		expect(desc.length).toBeGreaterThan(0);
		for (const l of desc) expect(l.lang).toBe('en');
	});

	test('armor facts line: thresholds and score labels in the page lang', () => {
		const fr = loc('armors', 'core_armor_gambeson_armor', 'fr');
		const f = helpLines('armors', fr.element, fr.langs, 'fr')[0];
		expect(f.lang).toBe('fr');
		expect(f.text).toContain('seuils');
		expect(f.text).toContain('score');
		const en = loc('armors', 'core_armor_gambeson_armor', 'en');
		const e = helpLines('armors', en.element, en.langs, 'en')[0];
		expect(e.lang).toBe('en');
		expect(e.text).toContain('thresholds');
		expect(e.text).toContain('score');
	});

	test('domain card facts line: level and recall cost labels in the page lang', () => {
		const fr = loc('domain-cards', 'core_domain_card_a_soldiers_bond', 'fr');
		const f = helpLines('domain-cards', fr.element, fr.langs, 'fr')[0];
		expect(f.lang).toBe('fr');
		expect(f.text).toContain('niveau');
		expect(f.text).toContain('coût de rappel');
		const en = loc('domain-cards', 'core_domain_card_a_soldiers_bond', 'en');
		const e = helpLines('domain-cards', en.element, en.langs, 'en')[0];
		expect(e.lang).toBe('en');
		expect(e.text).toContain('level');
		expect(e.text).toContain('recall cost');
	});

	test('adversary facts line: catalog labels and the French role, no raw key', () => {
		const { element, langs } = loc('adversaries', 'adv_acid_burrower', 'fr');
		const lines = helpLines('adversaries', element, langs, 'fr');
		expect(lines[0].lang).toBe('fr');
		expect(lines[0].text).toContain(cat('fr')['adversary.role.Solo']);
		for (const l of lines) expect(l.text).not.toMatch(/\b[a-z]+(_[a-z]+)+\s*:/);
	});
});

describe('catalog keys', () => {
	const en = cat('en');
	const fr = cat('fr');
	test('srd.help.* labels in English and French', () => {
		expect([en['srd.help.thresholds'], en['srd.help.score'], en['srd.help.level'], en['srd.help.recallCost']]).toEqual(['thresholds', 'score', 'level', 'recall cost']);
		expect([fr['srd.help.thresholds'], fr['srd.help.score'], fr['srd.help.level'], fr['srd.help.recallCost']]).toEqual(['seuils', 'score', 'niveau', 'coût de rappel']);
	});
	test('adversary.role.<Role> labels, French as specified', () => {
		const roles: Record<string, string> = { Bruiser: 'Cogneur', Horde: 'Horde', Leader: 'Meneur', Minion: 'Sbire', Ranged: 'Tireur', Skulk: 'Rôdeur', Social: 'Social', Solo: 'Solo', Standard: 'Standard', Support: 'Soutien' };
		for (const [r, f] of Object.entries(roles)) {
			expect(en[`adversary.role.${r}`], r).toBeTruthy();
			expect(fr[`adversary.role.${r}`], r).toBe(f);
		}
	});
	test('environment.type.<Type> labels, French as specified', () => {
		const types: Record<string, string> = { Exploration: 'Exploration', Social: 'Social', Traversal: 'Traversée', Event: 'Événement' };
		for (const [k, f] of Object.entries(types)) {
			expect(en[`environment.type.${k}`], k).toBeTruthy();
			expect(fr[`environment.type.${k}`], k).toBe(f);
		}
	});
	test('srd.field.<key> labels exist in both languages', () => {
		for (const k of ['tier', 'difficulty', 'hp', 'stress', 'thresholds', 'atk', 'range', 'damage', 'motives_and_tactics', 'experience', 'impulses', 'potential_adversaries', 'description']) {
			expect(en[`srd.field.${k}`], k).toBeTruthy();
			expect(fr[`srd.field.${k}`], k).toBeTruthy();
		}
	});
});
