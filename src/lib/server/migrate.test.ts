import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from './migrate';
import { wrapPglite, type Db } from './db';

const wrap = (pglite: PGlite): Db => wrapPglite(pglite as any);

describe('runMigrations', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), 'migrations-test-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('applies migrations in numeric order and records them', async () => {
		writeFileSync(path.join(dir, '002_second.sql'), 'CREATE TABLE second (id int);');
		writeFileSync(path.join(dir, '001_first.sql'), 'CREATE TABLE first (id int);');

		const db = wrap(new PGlite());
		await runMigrations(db, dir);

		const { rows } = await db.query(
			'SELECT filename FROM schema_migrations ORDER BY filename'
		);
		expect(rows.map((row) => row.filename)).toEqual(['001_first.sql', '002_second.sql']);
	});

	it('is safe to call repeatedly without re-running applied migrations', async () => {
		writeFileSync(path.join(dir, '001_init.sql'), 'CREATE TABLE once_only (id int);');

		const db = wrap(new PGlite());
		await runMigrations(db, dir);
		await expect(runMigrations(db, dir)).resolves.not.toThrow();

		const { rows } = await db.query('SELECT filename FROM schema_migrations');
		expect(rows).toHaveLength(1);
	});

	it('applies a multi-statement migration', async () => {
		writeFileSync(
			path.join(dir, '001_multi.sql'),
			'CREATE TABLE a (i int); CREATE TABLE b (i int); CREATE INDEX a_i ON a (i);'
		);
		const db = wrap(new PGlite());
		await runMigrations(db, dir);
		await db.query('INSERT INTO a VALUES (1)');
		await db.query('INSERT INTO b VALUES (1)');
		const { rows } = await db.query('SELECT filename FROM schema_migrations');
		expect(rows).toHaveLength(1);
	});

	it('does not record or partially apply a failing migration', async () => {
		writeFileSync(path.join(dir, '001_bad.sql'), 'CREATE TABLE c (i int); SELECT nope();');
		const db = wrap(new PGlite());
		await expect(runMigrations(db, dir)).rejects.toThrow();
		const { rows } = await db.query('SELECT filename FROM schema_migrations');
		expect(rows).toHaveLength(0);
		await expect(db.query('SELECT * FROM c')).rejects.toThrow();
	});

	it('only applies newly added migrations on a later run', async () => {
		writeFileSync(path.join(dir, '001_init.sql'), 'CREATE TABLE once_only (id int);');

		const db = wrap(new PGlite());
		await runMigrations(db, dir);

		writeFileSync(path.join(dir, '002_later.sql'), 'CREATE TABLE later (id int);');
		await runMigrations(db, dir);

		const { rows } = await db.query(
			'SELECT filename FROM schema_migrations ORDER BY filename'
		);
		expect(rows.map((row) => row.filename)).toEqual(['001_init.sql', '002_later.sql']);
	});
});
