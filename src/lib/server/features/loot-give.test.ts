import { describe, expect, it } from 'vitest';
import { lootGiveSchema } from './loot';

describe('lootGiveSchema', () => {
	it('accepts a characterId', () => {
		expect(lootGiveSchema.safeParse({ characterId: 'abc' }).success).toBe(true);
	});
	it('rejects a missing or bad characterId', () => {
		expect(lootGiveSchema.safeParse({}).error?.issues[0].message).toBe('invalid id');
		expect(lootGiveSchema.safeParse(null).error?.issues[0].message).toBe('body must be a JSON object');
	});
});
