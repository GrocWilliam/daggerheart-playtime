import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, parse } from '../errors';
import { idSchema } from '../../utils/validation';
import { clampFear, nameSchema } from './campaigns';

/** The 400 message `parse` gives for `body`, or null when valid. */
function msg(schema: Parameters<typeof parse>[0], body: unknown): string | null {
	try {
		parse(schema, body);
		return null;
	} catch (e) {
		if (e instanceof ApiError && e.status === 400) return e.message;
		throw e;
	}
}

describe('nameSchema', () => {
	it('trims', () => expect(parse(nameSchema, { name: '  A  ' })).toEqual({ name: 'A' }));
	it('boundaries 1, 100 and 101', () => {
		expect(msg(nameSchema, { name: 'x' })).toBeNull();
		expect(msg(nameSchema, { name: 'x'.repeat(100) })).toBeNull();
		expect(msg(nameSchema, { name: 'x'.repeat(101) })).toBe('name must be 1 to 100 characters');
	});
	it('rejects empty and blank', () => {
		for (const name of ['', '  ']) expect(msg(nameSchema, { name })).toBe('name must be 1 to 100 characters');
	});
	it('rejects non-strings and non-objects', () => {
		for (const b of [{}, null, [], 'x', { name: 3 }, { name: null }]) {
			expect(msg(nameSchema, b)).toBe('name must be a string');
		}
	});
});

describe('idSchema', () => {
	it('accepts any non-empty string without NUL', () => {
		expect(msg(idSchema, 'nope')).toBeNull();
		expect(msg(idSchema, crypto.randomUUID())).toBeNull();
	});
	it('rejects empty, NUL and non-strings', () => {
		for (const v of ['', 'a\0b', 5, undefined]) expect(msg(idSchema, v)).toBe('invalid id');
	});
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
		const { createCampaign } = await import('./campaigns');
		await expect(createCampaign({ name: '  ' })).rejects.toBeInstanceOf(ApiError);
	});
});

describe('campaigns on PGlite', () => {
	let m: typeof import('./campaigns');
	beforeAll(async () => {
		process.env.PGLITE_DATA_DIR = 'memory://';
		delete process.env.DATABASE_URL;
		m = await import('./campaigns');
	});
	afterAll(async () => {
		await (await (await import('../db')).getDb()).close?.();
	});

	it('creates, lists in order, reads, renames', async () => {
		const a = await m.createCampaign({ name: ' First ' });
		const b = await m.createCampaign({ name: 'Second' });
		expect(a).toEqual({ id: expect.any(String), name: 'First', fear: 0 });
		expect((await m.listCampaigns()).map((c) => c.name)).toEqual(['First', 'Second']);
		expect(await m.getCampaign(b.id)).toEqual(b);
		expect(await m.getCampaign('nope')).toBeUndefined();
		expect((await m.renameCampaign(a.id, 'Renamed'))?.name).toBe('Renamed');
		expect(await m.renameCampaign('nope', 'x')).toBeUndefined();
	});

	it('clamps fear at 0 and 12', async () => {
		const c = await m.createCampaign({ name: 'Fear' });
		expect(await m.adjustFear(c.id, 5)).toBe(5);
		expect(await m.adjustFear(c.id, 100)).toBe(12);
		expect(await m.adjustFear(c.id, -3)).toBe(9);
		expect(await m.adjustFear(c.id, -100)).toBe(0);
		expect(await m.adjustFear('nope', 1)).toBeUndefined();
	});

	it('deletes', async () => {
		const c = await m.createCampaign({ name: 'Gone' });
		expect(await m.deleteCampaign(c.id)).toBe(true);
		expect(await m.deleteCampaign(c.id)).toBe(false);
		expect(await m.getCampaign(c.id)).toBeUndefined();
	});
});
