// US-249: recomputeOnPatch, pure, no database.
import { describe, it, expect } from 'vitest';
import * as mod from '../../../src/lib/server/features/characters';

const CHAIN = 'core_armor_chainmail_armor'; // Heavy (-1): 7/15 + level, Armor 4
const GAMB = 'core_armor_gambeson_armor'; // Flexible (+1): 8/14 at level 3, Armor 3
const run = (cur: any, p: any): Record<string, number> => {
	const f = (mod as Record<string, any>).recomputeOnPatch;
	expect(typeof f, 'characters.ts must export recomputeOnPatch').toBe('function');
	return f(cur, p) ?? {};
};
const cur = (o: any = {}) => ({ level: 3, evasion: 10, majorThreshold: 10, severeThreshold: 18, armorId: CHAIN, ...o });

describe('armorId is a string', () => {
	it('swaps the armor: thresholds, armorSlots and the evasion difference', () =>
		expect(run(cur({ evasion: 12 }), { armorId: GAMB })).toEqual({ majorThreshold: 8, severeThreshold: 14, armorSlots: 3, evasion: 14 }));
	it('from no armor adds the new modifier', () =>
		expect(run(cur({ armorId: null, evasion: 10 }), { armorId: GAMB })).toMatchObject({ evasion: 11, armorSlots: 3, majorThreshold: 8, severeThreshold: 14 }));
	it('uses p.level when given', () =>
		expect(run(cur({ level: 1 }), { armorId: CHAIN, level: 3 })).toMatchObject({ majorThreshold: 10, severeThreshold: 18, armorSlots: 4 }));
	it('same armor keeps evasion', () => expect(run(cur(), { armorId: CHAIN }).evasion).toBe(10));
});

describe('armorId null', () => {
	it('unequips: level thresholds, 0 slots, evasion minus modifier', () =>
		expect(run(cur(), { armorId: null })).toEqual({ majorThreshold: 3, severeThreshold: 6, armorSlots: 0, evasion: 11 }));
	it('uses p.level when given', () =>
		expect(run(cur(), { armorId: null, level: 5 })).toMatchObject({ majorThreshold: 5, severeThreshold: 10, armorSlots: 0 }));
	it('with no current armor returns nothing', () => expect(Object.keys(run(cur({ armorId: null }), { armorId: null }))).toEqual([]));
});

describe('level change', () => {
	it('armored: thresholds from the current armor at the new level, no armorId in p', () => {
		const r = run(cur({ level: 1, majorThreshold: 8, severeThreshold: 16 }), { level: 3 });
		expect(r).toMatchObject({ majorThreshold: 10, severeThreshold: 18 });
		expect(r.evasion).toBeUndefined();
	});
	it('unarmored with level-based thresholds follows the level', () => {
		const r = run(cur({ armorId: null, level: 2, majorThreshold: 2, severeThreshold: 4 }), { level: 5 });
		expect(r).toMatchObject({ majorThreshold: 5, severeThreshold: 10 });
		expect(r.evasion).toBeUndefined();
	});
	it('unarmored with hand-entered thresholds keeps them', () =>
		expect(Object.keys(run(cur({ armorId: null, level: 2, majorThreshold: 5, severeThreshold: 10 }), { level: 3 }))).toEqual([]));
	it('same level changes nothing', () => expect(Object.keys(run(cur(), { level: 3 }))).toEqual([]));
	it('never returns evasion for a level change', () => {
		for (const c of [cur(), cur({ armorId: null, majorThreshold: 3, severeThreshold: 6 })]) expect(run(c, { level: 4 }).evasion).toBeUndefined();
	});
	it('an unrelated field recomputes nothing', () => expect(Object.keys(run(cur(), { name: 'X' } as any))).toEqual([]));
});

describe('evasion clamp 0..30', () => {
	it('upper', () => expect(run(cur({ evasion: 30, armorId: CHAIN }), { armorId: GAMB }).evasion).toBe(30));
	it('upper on unequip', () => expect(run(cur({ evasion: 30 }), { armorId: null }).evasion).toBe(30));
	it('lower', () => expect(run(cur({ evasion: 0, armorId: GAMB }), { armorId: null }).evasion).toBe(0));
});
