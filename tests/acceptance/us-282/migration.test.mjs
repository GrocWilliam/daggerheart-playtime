import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

const ROOT = process.env.ROOT;
const FILE = path.join(ROOT, 'drizzle/0006_level_up.sql');
const UPDATE = 'UPDATE "characters" SET "proficiency" = 1 + ("level" >= 2)::int + ("level" >= 5)::int + ("level" >= 8)::int;';
const norm = (s) => s.replace(/\s+/g, ' ');
const statements = (f) => fs.readFileSync(f, 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);

test('drizzle/0006_level_up.sql exists and contains the proficiency UPDATE after a statement breakpoint', () => {
	assert.ok(fs.existsSync(FILE), 'drizzle/0006_level_up.sql is missing');
	const t = fs.readFileSync(FILE, 'utf8');
	assert.ok(norm(t).includes(UPDATE), 'UPDATE statement missing');
	assert.ok(t.indexOf('--> statement-breakpoint') < t.indexOf('UPDATE "characters"'));
});

test('a second drizzle-kit generate reports no changes', () => {
	const before = execSync('git status --porcelain drizzle', { cwd: ROOT }).toString();
	let out = '';
	try {
		out = execSync('npx drizzle-kit generate', { cwd: ROOT, stdio: 'pipe' }).toString();
	} finally {
		const after = execSync('git status --porcelain drizzle', { cwd: ROOT }).toString();
		assert.equal(after, before, 'drizzle-kit generate changed drizzle/');
	}
	assert.match(out, /No schema changes/i);
});

test('backfill sets proficiency from the level and leaves advancements and marked_traits empty', async () => {
	const db = new PGlite('memory://');
	const files = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
	const num = (f) => parseInt(f.match(/^(\d+)_/)[1], 10);
	for (const f of files(path.join(ROOT, 'migrations')).sort((a, b) => num(a) - num(b)))
		await db.exec(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
	const drizzleFiles = files(path.join(ROOT, 'drizzle')).sort();
	for (const f of drizzleFiles.filter((f) => num(f) <= 5))
		for (const s of statements(path.join(ROOT, 'drizzle', f))) await db.exec(s);
	await db.exec(`INSERT INTO campaigns (id, name) VALUES ('c1', 'C')`);
	for (const l of [1, 2, 5, 8, 10])
		await db.exec(`INSERT INTO characters (id, campaign_id, name, class, level, evasion, major_threshold, severe_threshold, hp_max)
			VALUES ('ch${l}', 'c1', 'N${l}', 'Guardian', ${l}, 10, 5, 10, 6)`);
	assert.ok(fs.existsSync(FILE), 'drizzle/0006_level_up.sql is missing');
	for (const s of statements(FILE)) await db.exec(s);
	const { rows } = await db.query('SELECT level, proficiency, advancements, marked_traits FROM characters ORDER BY level');
	assert.deepEqual(rows.map((r) => [r.level, r.proficiency]), [[1, 1], [2, 2], [5, 3], [8, 4], [10, 4]]);
	for (const r of rows) {
		assert.deepEqual(r.advancements, []);
		assert.deepEqual(r.marked_traits, []);
	}
	await db.close();
});
