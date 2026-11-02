import { runMigrations } from './migrate';

export interface Db {
	close?(): Promise<void>;
	query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

let db: Promise<Db> | undefined;

/**
 * Returns the singleton DB connection, lazily opening it (Postgres via
 * DATABASE_URL, or PGlite otherwise) and running pending migrations to
 * completion exactly once before the first caller sees it.
 */
export function getDb(): Promise<Db> {
	if (!db) {
		db = open().then(async (opened) => {
			process.once('sveltekit:shutdown' as any, async () => {
				try {
					await opened.close?.();
				} catch (err) {
					console.error('error closing database', err);
				}
			});
			await runMigrations(opened);
			return opened;
		});
	}
	return db;
}

async function open(): Promise<Db> {
	if (process.env.DATABASE_URL) {
		return openPostgres(process.env.DATABASE_URL);
	}
	return openPglite(process.env.PGLITE_DATA_DIR ?? './data/pglite');
}

async function openPostgres(connectionString: string): Promise<Db> {
	const { Pool } = await import('pg');
	const pool = new Pool({ connectionString });
	return {
		async query(sql, params) {
			const result = await pool.query(sql, params);
			return { rows: result.rows };
		},
		close: () => pool.end()
	};
}

async function openPglite(dataDir: string): Promise<Db> {
	const { PGlite } = await import('@electric-sql/pglite');
	if (dataDir !== 'memory://') {
		const { mkdir } = await import('node:fs/promises');
		await mkdir(dataDir, { recursive: true });
	}
	const pglite = dataDir === 'memory://' ? new PGlite() : new PGlite(dataDir);
	return { ...wrapPglite(pglite), close: () => pglite.close() };
}

/**
 * Adapts a PGlite instance to Db. Without params the SQL goes through exec()
 * (simple protocol), so multi-statement text works as it does with `pg`.
 */
export function wrapPglite(pglite: {
	query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
	exec(sql: string): Promise<{ rows: any[] }[]>;
}): Db {
	return {
		async query(sql, params) {
			if (!params || params.length === 0) {
				const results = await pglite.exec(sql);
				return { rows: (results[results.length - 1]?.rows ?? []) as any[] };
			}
			const result = await pglite.query(sql, params as any[]);
			return { rows: result.rows as any[] };
		}
	};
}
