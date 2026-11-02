import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

function migrationNumber(filename: string): number {
	const match = filename.match(/^(\d+)_/);
	return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function listMigrationFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) {
		return [];
	}
	return fs
		.readdirSync(dir)
		.filter((name) => name.endsWith('.sql'))
		.sort((a, b) => migrationNumber(a) - migrationNumber(b));
}

/**
 * Ensures schema_migrations exists, then applies any migrations/*.sql file
 * not yet recorded there, in numeric-prefix order. Safe to call repeatedly:
 * already-applied files are skipped without error.
 */
export async function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): Promise<void> {
	await db.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`);

	const { rows } = await db.query('SELECT filename FROM schema_migrations');
	const applied = new Set(rows.map((row) => row.filename as string));

	for (const filename of listMigrationFiles(dir)) {
		if (applied.has(filename)) {
			continue;
		}
		const sql = fs.readFileSync(path.join(dir, filename), 'utf-8');
		// Sent as one parameterless multi-statement query, which Postgres (and
		// PGlite's exec) run in a single implicit transaction: the migration and
		// its record are applied atomically.
		const quoted = filename.replace(/'/g, "''");
		await db.query(`${sql}\n;\nINSERT INTO schema_migrations (filename) VALUES ('${quoted}');`);
	}
}
