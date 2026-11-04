import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { is } from 'drizzle-orm';
import * as schema from './schema';

let getDb: typeof import('./db').getDb;
let getDrizzle: typeof import('./db').getDrizzle;

beforeAll(async () => {
	process.env.PGLITE_DATA_DIR = 'memory://';
	delete process.env.DATABASE_URL;
	({ getDb, getDrizzle } = await import('./db'));
});

afterAll(async () => {
	await (await getDb()).close?.();
});

describe('drizzle', () => {
	it('runs real migrations: tables, indexes, one drizzle migration row', async () => {
		const db = await getDb();
		const tables = (
			await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)
		).rows.map((r) => r.table_name);
		for (const t of ['app_info', 'campaigns', 'characters', 'items', 'schema_migrations']) {
			expect(tables).toContain(t);
		}
		const idx = (await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).rows.map(
			(r) => r.indexname
		);
		expect(idx).toContain('items_character_name_uniq');
		const rows = (await db.query('SELECT * FROM drizzle.__drizzle_migrations')).rows;
		expect(rows).toHaveLength(2);
	});

	it('schema columns and nullability match the database', async () => {
		const db = await getDb();
		const tables = Object.values(schema).filter((v) => is(v, PgTable)).map((t) => getTableConfig(t));
		expect(tables).toHaveLength(4);
		for (const t of tables) {
			const { rows } = await db.query(
				`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
				[t.name]
			);
			const real = Object.fromEntries(rows.map((c) => [c.column_name, c.is_nullable === 'NO']));
			const decl = Object.fromEntries(t.columns.map((c) => [c.name, !!c.notNull]));
			expect(decl).toEqual(real);
		}
	});

	it('getDrizzle queries the same connection', async () => {
		const d = await getDrizzle();
		const [c] = await d.insert(schema.campaigns).values({ name: 'X' }).returning();
		const db = await getDb();
		const { rows } = await db.query('SELECT name FROM campaigns WHERE id=$1', [c.id]);
		expect(rows[0].name).toBe('X');
	});
});
