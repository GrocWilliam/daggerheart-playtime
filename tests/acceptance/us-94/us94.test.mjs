import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = process.env.ROOT;
const require = createRequire(ROOT + '/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('package.json lists drizzle-orm and drizzle-kit', () => {
	const pkg = JSON.parse(read('package.json'));
	assert.ok(pkg.dependencies?.['drizzle-orm'], 'drizzle-orm in dependencies');
	assert.ok(pkg.devDependencies?.['drizzle-kit'], 'drizzle-kit in devDependencies');
});

test('config, schema, baseline migration and Docker files are in place', () => {
	assert.ok(fs.existsSync(path.join(ROOT, 'src/lib/server/schema.ts')));
	const cfg = read('drizzle.config.ts');
	assert.match(cfg, /postgresql/);
	assert.match(cfg, /\.\/drizzle/);
	assert.match(cfg, /schema\.ts/);
	const journal = JSON.parse(read('drizzle/meta/_journal.json'));
	assert.equal(journal.entries.length, 1);
	assert.match(journal.entries[0].tag, /baseline/);
	assert.equal(read(`drizzle/${journal.entries[0].tag}.sql`).trim(), 'SELECT 1;');
	assert.ok(fs.readdirSync(path.join(ROOT, 'drizzle/meta')).some((f) => /snapshot\.json$/.test(f)));
	const ign = fs.existsSync(path.join(ROOT, '.dockerignore')) ? read('.dockerignore') : '';
	assert.ok(!ign.split('\n').some((l) => /^\/?drizzle\/?\*?$/.test(l.trim())), '.dockerignore excludes drizzle');
	const df = read('Dockerfile');
	assert.match(df, /COPY \. \.|drizzle/);
});

test('Drizzle schema matches the real database (columns, nullability, indexes, FK rules)', async () => {
	const { PGlite } = require('@electric-sql/pglite');
	const { getTableConfig, PgTable } = require('drizzle-orm/pg-core');
	const { is } = require('drizzle-orm');
	const schema = await import(path.join(ROOT, 'src/lib/server/schema.ts'));
	const tables = Object.values(schema).filter((v) => is(v, PgTable)).map((t) => getTableConfig(t));
	assert.ok(tables.length > 0, 'schema exports tables');

	const pg = new PGlite();
	const dir = path.join(ROOT, 'migrations');
	for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
	}
	const dbTables = (
		await pg.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'schema_migrations'`
		)
	).rows.map((r) => r.table_name).sort();
	assert.deepEqual(tables.map((t) => t.name).sort(), dbTables);

	for (const t of tables) {
		const cols = (
			await pg.query(
				`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
				[t.name]
			)
		).rows;
		const real = Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable === 'NO']));
		const decl = Object.fromEntries(t.columns.map((c) => [c.name, !!c.notNull]));
		assert.deepEqual(decl, real, `columns of ${t.name}`);

		const idx = (await pg.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=$1`, [t.name]))
			.rows.map((r) => r.indexname);
		for (const i of t.indexes) assert.ok(idx.includes(i.config.name), `index ${i.config.name} on ${t.name}`);

		const fks = (
			await pg.query(
				`SELECT rc.constraint_name, rc.delete_rule FROM information_schema.referential_constraints rc
				 JOIN information_schema.table_constraints tc ON tc.constraint_name=rc.constraint_name AND tc.constraint_schema=rc.constraint_schema
				 WHERE tc.table_name=$1 AND tc.table_schema='public'`,
				[t.name]
			)
		).rows;
		assert.equal(t.foreignKeys.length, fks.length, `foreign keys of ${t.name}`);
		const rules = fks.map((f) => f.delete_rule).sort();
		const declRules = t.foreignKeys.map((f) => (f.onDelete ?? 'no action').toUpperCase()).sort();
		assert.deepEqual(declRules, rules, `ON DELETE rules of ${t.name}`);
	}
	await pg.close();
});

test('drizzle-kit generate reports no schema changes', () => {
	const before = spawnSync('git', ['status', '--porcelain', 'drizzle'], { cwd: ROOT, encoding: 'utf8' }).stdout;
	const r = spawnSync('npx', ['drizzle-kit', 'generate'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
	const out = r.stdout + r.stderr;
	const after = spawnSync('git', ['status', '--porcelain', 'drizzle'], { cwd: ROOT, encoding: 'utf8' }).stdout;
	assert.match(out, /no schema changes/i, out);
	assert.equal(after, before, 'generate must not create files');
});

function freePort() {
	return new Promise((resolve) => {
		(function t() {
			const p = 10000 + Math.floor(Math.random() * 22000);
			const s = net.createServer().once('error', t).listen(p, () => s.close(() => resolve(p)));
		})();
	});
}

async function start(env) {
	const port = await freePort();
	const e = { ...process.env, PORT: String(port), ...env };
	delete e.DATABASE_URL;
	const child = spawn('node', ['build'], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
	let log = '';
	child.stdout.on('data', (d) => (log += d));
	child.stderr.on('data', (d) => (log += d));
	const base = `http://localhost:${port}`;
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(base + '/health');
			if (r.status === 200) return { child, base };
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	child.kill();
	throw new Error('server not healthy:\n' + log);
}
const stop = (child) =>
	new Promise((resolve) => {
		child.once('exit', resolve);
		child.kill('SIGTERM');
		setTimeout(() => child.kill('SIGKILL'), 5000);
	});

test('restart on the same PGLITE_DATA_DIR keeps data and /health is 200; one drizzle migration row', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us94-'));
	try {
		let s = await start({ PGLITE_DATA_DIR: dir });
		const r = await fetch(s.base + '/api/campaigns', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Persisted' })
		});
		assert.equal(r.status, 201);
		const created = await r.json();
		await stop(s.child);

		s = await start({ PGLITE_DATA_DIR: dir });
		const list = await (await fetch(s.base + '/api/campaigns')).json();
		assert.ok(list.some((c) => c.id === created.id && c.name === 'Persisted'), 'campaign survived restart');
		assert.equal((await fetch(s.base + '/health')).status, 200);
		await stop(s.child);

		const { PGlite } = require('@electric-sql/pglite');
		const pg = new PGlite(dir);
		const rows = (await pg.query('SELECT * FROM drizzle.__drizzle_migrations')).rows;
		assert.equal(rows.length, 1);
		const t = (await pg.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map((x) => x.table_name);
		for (const n of ['campaigns', 'schema_migrations']) assert.ok(t.includes(n), n);
		await pg.close();
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('empty in-memory start answers /health 200', async () => {
	const s = await start({ PGLITE_DATA_DIR: 'memory://' });
	try {
		assert.equal((await fetch(s.base + '/health')).status, 200);
	} finally {
		await stop(s.child);
	}
});
