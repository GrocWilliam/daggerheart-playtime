// US-248 pure rules, without a database.
import { describe, it, expect } from 'vitest';
import * as mod from '../../../src/lib/server/features/characters';

const m = mod as Record<string, any>;
const fn = (name: string) => {
	expect(typeof m[name], `characters.ts must export ${name}`).toBe('function');
	return m[name];
};
const CHAIN = 'core_armor_chainmail_armor';

describe('armorStats', () => {
	it('chainmail at level 3', () => expect(fn('armorStats')(CHAIN, 3)).toEqual({ armorMax: 4, majorThreshold: 10, severeThreshold: 18 }));
	it('unarmored level 3', () => expect(fn('armorStats')(null, 3)).toEqual({ armorMax: 0, majorThreshold: 3, severeThreshold: 6 }));
	it('unarmored level 10', () => expect(fn('armorStats')(null, 10)).toEqual({ armorMax: 0, majorThreshold: 10, severeThreshold: 20 }));
});

describe('armorEvasionModifier', () => {
	it('Full Plate is -2', () => expect(fn('armorEvasionModifier')('core_armor_full_plate_armor')).toBe(-2));
	it('chainmail is -1', () => expect(fn('armorEvasionModifier')(CHAIN)).toBe(-1));
	it('Flexible armor is +1', () => expect(fn('armorEvasionModifier')('core_armor_gambeson_armor')).toBe(1));
	it('armor without feature is 0', () => expect(fn('armorEvasionModifier')('core_armor_leather_armor')).toBe(0));
	it('null is 0', () => expect(fn('armorEvasionModifier')(null)).toBe(0));
});

describe('trait array', () => {
	it('TRAIT_ARRAY', () => expect([...m.TRAIT_ARRAY]).toEqual([2, 1, 1, 0, 0, -1]));
	it('permutation is true', () => expect(fn('traitsFollowArray')([0, -1, 2, 1, 0, 1])).toBe(true));
	it('duplicate 2 is false', () => expect(fn('traitsFollowArray')([2, 2, 1, 0, 0, -1])).toBe(false));
	it('five values is false', () => expect(fn('traitsFollowArray')([2, 1, 1, 0, 0])).toBe(false));
});

describe('MAX_STRESS and classStart', () => {
	it('MAX_STRESS is 6', () => expect(m.MAX_STRESS).toBe(6));
	const table: [string, number, number][] = [['Bard', 10, 5], ['Druid', 10, 6], ['Guardian', 9, 7], ['Ranger', 12, 6], ['Rogue', 12, 6], ['Seraph', 9, 7], ['Sorcerer', 10, 6], ['Warrior', 11, 6], ['Wizard', 11, 5]];
	for (const [c, evasion, hp] of table) it(`${c} ${evasion}/${hp}`, () => expect(fn('classStart')(c)).toEqual({ evasion, hp }));
	it('unknown class is null', () => expect(fn('classStart')('Pirate')).toBeNull());
});

describe('derivedStats', () => {
	it('Warrior 3 chainmail', () =>
		expect(fn('derivedStats')('Warrior', 3, CHAIN)).toEqual({ evasion: 10, majorThreshold: 10, severeThreshold: 18, maxHp: 6, maxStress: 6, armorSlots: 4 }));
	it('Warrior 3 unarmored', () =>
		expect(fn('derivedStats')('Warrior', 3, null)).toEqual({ evasion: 11, majorThreshold: 3, severeThreshold: 6, maxHp: 6, maxStress: 6, armorSlots: 0 }));
	it('unknown class is null', () => expect(fn('derivedStats')('Pirate', 1, null)).toBeNull());
});

describe('gearTierIssue', () => {
	it('message for a too-high tier', () => {
		const r = fn('gearTierIssue')('armorId', 'armors', 'core_armor_improved_gambeson_armor', 1);
		expect(r).toBe("armorId is tier 2, above the character's tier 1");
	});
	it('null when fine', () => expect(fn('gearTierIssue')('armorId', 'armors', CHAIN, 1)).toBeNull());
});
