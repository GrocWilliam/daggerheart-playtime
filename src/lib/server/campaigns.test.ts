import { describe, expect, it } from 'vitest';
import { clampFear, parseName } from './campaigns';

describe('parseName', () => {
	it('trims', () => expect(parseName({ name: '  A  ' })).toBe('A'));
	it('rejects empty, blank, missing, long', () => {
		for (const b of [{ name: '' }, { name: '  ' }, {}, null, { name: 'x'.repeat(101) }]) {
			expect(() => parseName(b)).toThrow();
		}
	});
	it('accepts 100 chars', () => expect(parseName({ name: 'x'.repeat(100) })).toHaveLength(100));
});

describe('clampFear', () => {
	it('clamps', () => {
		expect(clampFear(0, 5)).toBe(5);
		expect(clampFear(5, 20)).toBe(12);
		expect(clampFear(12, -100)).toBe(0);
	});
});

describe('createCampaign validation', () => {
	it('rejects an invalid name before touching the database', async () => {
		const { createCampaign, ApiError } = await import('./campaigns');
		await expect(createCampaign({ name: '  ' })).rejects.toBeInstanceOf(ApiError);
	});
});
