import { describe, expect, it } from 'vitest';
import { lootPatchSchema, lootRollSchema, rollLoot } from './loot';

const RANGES = { common: [1, 12], uncommon: [2, 24], rare: [3, 36], legendary: [4, 48] } as const;

describe('rollLoot', () => {
	for (const [rarity, [min, max]] of Object.entries(RANGES)) {
		it(`${rarity} rolls stay within ${min}-${max}`, () => {
			for (const table of ['items', 'consumables'] as const) {
				const rolls = rollLoot(table, rarity as keyof typeof RANGES, 200, 7);
				for (const r of rolls) {
					expect(r.roll).toBeGreaterThanOrEqual(min);
					expect(r.roll).toBeLessThanOrEqual(max);
					expect(r.srdId).toMatch(/^core_/);
					expect(r.given).toBe(false);
				}
			}
		});
	}
	it('is deterministic for a seed', () => {
		expect(rollLoot('items', 'rare', 10, 42)).toEqual(rollLoot('items', 'rare', 10, 42));
		expect(rollLoot('items', 'legendary', 10, 1)).not.toEqual(rollLoot('items', 'legendary', 10, 2));
	});
});

describe('schemas', () => {
	const ok = { table: 'items', rarity: 'common' };
	const msg = (b: unknown) => lootRollSchema.safeParse(b).error?.issues[0].message;
	it('defaults count to 1', () => expect(lootRollSchema.parse(ok).count).toBe(1));
	it('rejects bad count', () => {
		for (const count of [0, 11, 1.5, '3']) expect(msg({ ...ok, count })).toBe('count must be an integer from 1 to 10');
	});
	it('rejects bad table and rarity', () => {
		expect(msg({ ...ok, table: 'x' })).toBe('table must be items or consumables');
		expect(msg({ ...ok, rarity: 'x' })).toBe('rarity must be common, uncommon, rare or legendary');
	});
	it('rejects bad seed and given', () => {
		expect(msg({ ...ok, seed: 1.5 })).toBe('seed must be an integer');
		expect(lootPatchSchema.safeParse({ given: 'yes' }).error?.issues[0].message).toBe('given must be true or false');
	});
});
