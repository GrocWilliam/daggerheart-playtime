import { describe, expect, it } from 'vitest';
import { getDb } from './db';

describe('getDb', () => {
	it('runs queries against an in-memory PGlite database', async () => {
		const db = await getDb();
		const { rows } = await db.query('SELECT 1 as one');
		expect(rows[0].one).toBe(1);
	});

	it('returns the same singleton on repeated calls', async () => {
		const first = await getDb();
		const second = await getDb();
		expect(first).toBe(second);
	});

	it('has already applied migrations by the time it resolves', async () => {
		const db = await getDb();
		const { rows } = await db.query('SELECT filename FROM schema_migrations');
		expect(rows.map((row) => row.filename)).toContain('001_init.sql');
	});
});

describe('shutdown', () => {
	it('closes the database on sveltekit:shutdown', async () => {
		await getDb();
		expect(process.listenerCount('sveltekit:shutdown' as any)).toBeGreaterThan(0);
	});
});
