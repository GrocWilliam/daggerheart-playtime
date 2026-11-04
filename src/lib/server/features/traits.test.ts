import { describe, expect, it } from 'vitest';
import { characterJson, patchSchema, traitsSchema, TRAITS } from './characters';

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error!.issues[0].message);

describe('traits', () => {
	it('rejects out-of-range, fractional and non-numeric values per trait', () => {
		for (const k of TRAITS) for (const v of [6, -6, 1.5, '1'])
			expect(msg(traitsSchema.safeParse({ [k]: v }))).toBe(`${k} must be an integer from -5 to 5`);
	});
	it('rejects an unknown trait and keeps only named ones', () => {
		expect(msg(traitsSchema.safeParse({ luck: 1 }))).toBe('traits has an unknown trait: luck');
		expect(traitsSchema.parse({ agility: 2 })).toEqual({ agility: 2 });
	});
	it('is part of the patch schema', () => {
		const s = patchSchema({ majorThreshold: 1, severeThreshold: 2 });
		expect(msg(s.safeParse({ traits: { agility: 6 } }))).toBe('agility must be an integer from -5 to 5');
	});
	it('characterJson defaults all six to 0', () => {
		expect(characterJson({}).traits).toEqual({ agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 });
	});
});
