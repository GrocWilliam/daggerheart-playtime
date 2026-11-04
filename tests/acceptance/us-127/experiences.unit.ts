import { describe, expect, it } from 'vitest';
// Assumed exports of src/lib/server/features/characters.ts: plain Zod schemas
// `experienceSchema` (POST body) and `patchExperienceSchema` (PATCH body).
import { experienceSchema, patchExperienceSchema } from '../../../src/lib/server/features/characters';

const msg = (r: any) => (r.success ? null : (r.error.issues[0].message as string));

describe('experience validation (no database)', () => {
	it('accepts a valid experience and trims the name', () => {
		const r: any = experienceSchema.safeParse({ name: '  Bounty hunter ', modifier: 2 });
		expect(r.success).toBe(true);
		expect(r.data).toEqual({ name: 'Bounty hunter', modifier: 2 });
		for (const m of [1, 5]) expect(experienceSchema.safeParse({ name: 'x', modifier: m }).success).toBe(true);
		expect(experienceSchema.safeParse({ name: 'x'.repeat(100), modifier: 1 }).success).toBe(true);
	});
	for (const bad of [0, 6, -1, 1.5, '2', null, undefined])
		it(`rejects modifier ${JSON.stringify(bad)} with a clear message`, () => {
			const m = msg(experienceSchema.safeParse({ name: 'Hunter', modifier: bad }));
			expect(m).toBeTruthy();
			expect(m).toMatch(/modifier/i);
			expect(m).toMatch(/1/);
			expect(m).toMatch(/5/);
		});
	for (const bad of ['', '   ', 'x'.repeat(101), 5, undefined])
		it(`rejects name ${JSON.stringify(bad)?.slice(0, 20)} with a clear message`, () => {
			const m = msg(experienceSchema.safeParse({ name: bad, modifier: 2 }));
			expect(m).toBeTruthy();
			expect(m).toMatch(/name/i);
		});
	it('patch accepts a subset and rejects bad values', () => {
		expect(patchExperienceSchema.safeParse({ modifier: 3 }).success).toBe(true);
		expect(patchExperienceSchema.safeParse({ name: ' New ' }).success).toBe(true);
		expect(msg(patchExperienceSchema.safeParse({ modifier: 0 }))).toMatch(/modifier/i);
		expect(msg(patchExperienceSchema.safeParse({ modifier: 6 }))).toMatch(/modifier/i);
		expect(msg(patchExperienceSchema.safeParse({ modifier: 1.5 }))).toMatch(/modifier/i);
		expect(msg(patchExperienceSchema.safeParse({ name: '' }))).toMatch(/name/i);
		expect(msg(patchExperienceSchema.safeParse({ name: 'x'.repeat(101) }))).toMatch(/name/i);
	});
});
