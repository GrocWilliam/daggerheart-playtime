import { describe, expect, it } from 'vitest';
import { moveSchema, sceneCreateSchema, scenePatchSchema } from './scenes';
import { listSrd } from './srd';

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0].message;
const env = listSrd('environments', 'en')[0].id;
const adv = listSrd('adversaries', 'en')[0].id;

describe('scene schemas', () => {
	it('trims the title and applies defaults', () => {
		expect(sceneCreateSchema.parse({ title: '  Ambush ' })).toEqual({ title: 'Ambush', notes: '', environmentId: null });
	});
	it('rejects bad titles', () => {
		for (const t of ['', '  ', 'x'.repeat(101), 3])
			expect(msg(sceneCreateSchema.safeParse({ title: t }))).toBe(t === 3 ? 'title must be a string' : 'title must be 1 to 100 characters');
	});
	it('limits notes', () => {
		expect(sceneCreateSchema.safeParse({ title: 'a', notes: 'n'.repeat(5000) }).success).toBe(true);
		expect(msg(sceneCreateSchema.safeParse({ title: 'a', notes: 'n'.repeat(5001) }))).toBe('notes must be at most 5000 characters');
	});
	it('accepts only environments', () => {
		expect(scenePatchSchema.parse({ environmentId: env })).toEqual({ environmentId: env });
		expect(scenePatchSchema.parse({ environmentId: null })).toEqual({ environmentId: null });
		for (const e of [adv, 'env_nope', 4])
			expect(msg(scenePatchSchema.safeParse({ environmentId: e }))).toBe('environmentId must be an environment');
	});
	it('validates status', () => {
		expect(scenePatchSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
		expect(msg(scenePatchSchema.safeParse({ status: 'active' }))).toBe('status must be planned, current or done');
	});
	it('validates position against the count', () => {
		expect(moveSchema(3).parse({ position: 2 })).toEqual({ position: 2 });
		for (const p of [-1, 1.5, 3, '1'])
			expect(msg(moveSchema(3).safeParse({ position: p }))).toBe('position must be an integer from 0 to 2');
	});
});
