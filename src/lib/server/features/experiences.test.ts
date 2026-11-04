import { describe, expect, it } from 'vitest';
import { experienceSchema, patchExperienceSchema } from './characters';

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0].message;

describe('experience schemas', () => {
	it('trims the name', () => {
		expect(experienceSchema.parse({ name: '  Bounty hunter ', modifier: 2 })).toEqual({ name: 'Bounty hunter', modifier: 2 });
	});
	it('rejects bad modifiers with the exact message', () => {
		for (const m of [0, 6, 1.5, '2', null])
			expect(msg(experienceSchema.safeParse({ name: 'x', modifier: m }))).toBe('modifier must be an integer from 1 to 5');
	});
	it('rejects bad names', () => {
		for (const n of ['', '  ', 'x'.repeat(101)])
			expect(msg(experienceSchema.safeParse({ name: n, modifier: 2 }))).toBe('name must be 1 to 100 characters');
	});
	it('patch accepts a subset', () => {
		expect(patchExperienceSchema.parse({ modifier: 3 })).toEqual({ modifier: 3 });
		expect(msg(patchExperienceSchema.safeParse({ modifier: 9 }))).toMatch(/modifier/);
	});
});
