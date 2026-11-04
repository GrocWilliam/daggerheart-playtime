import { describe, expect, it } from 'vitest';
import { createSchema, patchSchema } from '../../../src/lib/server/characters';

const base = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
const patch = (b: unknown) => patchSchema({ majorThreshold: 5, severeThreshold: 10, class: 'Guardian' }).safeParse(b);
const create = (traits: unknown) => createSchema.safeParse({ ...base, traits });
const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error!.issues[0].message);

describe('trait validation messages (no database)', () => {
	for (const bad of [6, -6, 1.5, '2', null, 100])
		it(`patch rejects agility ${JSON.stringify(bad)}`, () => {
			expect(msg(patch({ traits: { agility: bad } }))).toBe('agility must be an integer from -5 to 5');
		});
	for (const name of ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'])
		it(`patch message names ${name}`, () => {
			expect(msg(patch({ traits: { [name]: 6 } }))).toBe(`${name} must be an integer from -5 to 5`);
			expect(patch({ traits: { [name]: -5 } }).success).toBe(true);
			expect(patch({ traits: { [name]: 5 } }).success).toBe(true);
		});
	it('patch rejects an unknown trait', () => {
		expect(msg(patch({ traits: { luck: 1 } }))).toBe('traits has an unknown trait: luck');
	});
	it('patch accepts a subset and keeps only the named traits', () => {
		const r = patch({ traits: { agility: 2 } });
		expect(r.success).toBe(true);
		expect((r as any).data.traits).toEqual({ agility: 2 });
	});
	it('create accepts no traits, a subset, and rejects out-of-range or unknown', () => {
		expect(create(undefined).success).toBe(true);
		expect(create({ strength: 3 }).success).toBe(true);
		expect(msg(create({ strength: 9 }))).toBe('strength must be an integer from -5 to 5');
		expect(msg(create({ luck: 1 }))).toBe('traits has an unknown trait: luck');
	});
});
