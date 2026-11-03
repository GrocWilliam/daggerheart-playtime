import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL;
const ROOT = process.env.ROOT;
const send = (m, p, body, raw) =>
	fetch(BASE + p, {
		method: m,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
	});
const BODY = { name: 'Rook', class: 'Guardian', level: 3, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 4, armorSlots: 3 };
const mkChar = async () => {
	const c = await (await send('POST', '/api/campaigns', { name: 'C' })).json();
	const r = await send('POST', `/api/campaigns/${c.id}/characters`, BODY);
	assert.equal(r.status, 201);
	return r.json();
};
const walk = (d) =>
	fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
	);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('getDb is not used in src outside db.ts and tests', () => {
	const hits = walk(path.join(ROOT, 'src'))
		.filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && path.basename(f) !== 'db.ts')
		.filter((f) => /\bgetDb\b/.test(fs.readFileSync(f, 'utf8')));
	assert.deepEqual(hits, []);
	assert.match(read('src/lib/server/db.ts'), /export (async )?function getDb/);
});

test('no raw SQL, db.query or leftover SQL constants in src/routes and the item code', () => {
	for (const f of walk(path.join(ROOT, 'src/routes')).filter((f) => /\.ts$/.test(f))) {
		const t = fs.readFileSync(f, 'utf8');
		assert.doesNotMatch(t, /\.query\(/, f);
		assert.doesNotMatch(t, /\b(SELECT|INSERT INTO|DELETE FROM)\b/, f);
		assert.doesNotMatch(t, /\bUPDATE \w+ SET\b/, f);
	}
	for (const f of walk(path.join(ROOT, 'src')).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))) {
		const t = fs.readFileSync(f, 'utf8');
		assert.doesNotMatch(t, /ITEMS_SUBQUERY/, f);
		if (!/migrate\.ts$|db\.ts$/.test(f)) assert.doesNotMatch(t, /\bdb\.query\(/, f);
	}
});

test('unit tests cover item create, duplicate name, quantity update, delete and cascade on in-memory PGlite', () => {
	const files = walk(path.join(ROOT, 'src')).filter((f) => /\.test\.ts$/.test(f));
	const t = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
	assert.match(t, /memory:\/\//);
	for (const re of [/addItem/, /setItemQuantity/, /deleteItem/, /cascade/i, /deleteCharacter|deleteCampaign/])
		assert.match(t, re, String(re));
});

test('POST item creates (201), merges a duplicate name (200), 404 for unknown character, 400 for bad input', async () => {
	const ch = await mkChar();
	const a = await send('POST', `/api/characters/${ch.id}/items`, { name: 'Rope', quantity: 2 });
	assert.equal(a.status, 201);
	const ai = await a.json();
	assert.deepEqual(Object.keys(ai).sort(), ['id', 'name', 'quantity', 'srdId']);
	assert.equal(ai.name, 'Rope');
	assert.equal(ai.quantity, 2);
	assert.equal(ai.srdId, null);
	const b = await send('POST', `/api/characters/${ch.id}/items`, { name: ' ROPE ', quantity: 3 });
	assert.equal(b.status, 200);
	const bi = await b.json();
	assert.equal(bi.id, ai.id);
	assert.equal(bi.quantity, 5);
	assert.equal(bi.name, 'Rope');
	const g = await (await send('GET', `/api/characters/${ch.id}`)).json();
	assert.deepEqual(g.items, [{ id: ai.id, name: 'Rope', quantity: 5, srdId: null }]);
	const nf = await send('POST', '/api/characters/00000000-0000-0000-0000-000000000000/items', { name: 'x' });
	assert.equal(nf.status, 404);
	assert.deepEqual(await nf.json(), { error: 'character not found' });
	const bad = await send('POST', `/api/characters/${ch.id}/items`, { name: '  ' });
	assert.equal(bad.status, 400);
	assert.deepEqual(await bad.json(), { error: 'name must be 1 to 100 characters' });
});

test('same name on two characters stays separate', async () => {
	const a = await mkChar();
	const b = await mkChar();
	const x = await send('POST', `/api/characters/${a.id}/items`, { name: 'Torch' });
	const y = await send('POST', `/api/characters/${b.id}/items`, { name: 'Torch' });
	assert.equal(x.status, 201);
	assert.equal(y.status, 201);
});

test('PATCH item quantity, 0 deletes, DELETE, 404s and 400s', async () => {
	const ch = await mkChar();
	const it = await (await send('POST', `/api/characters/${ch.id}/items`, { name: 'Gem' })).json();
	const p = await send('PATCH', `/api/items/${it.id}`, { quantity: 7 });
	assert.equal(p.status, 200);
	assert.deepEqual(await p.json(), { id: it.id, name: 'Gem', quantity: 7, srdId: null });
	const bad = await send('PATCH', `/api/items/${it.id}`, { quantity: -1 });
	assert.equal(bad.status, 400);
	assert.deepEqual(await bad.json(), { error: 'quantity must be an integer from 0 to 1000000' });
	const z = await send('PATCH', `/api/items/${it.id}`, { quantity: 0 });
	assert.equal(z.status, 204);
	const again = await send('PATCH', `/api/items/${it.id}`, { quantity: 1 });
	assert.equal(again.status, 404);
	assert.deepEqual(await again.json(), { error: 'item not found' });
	const it2 = await (await send('POST', `/api/characters/${ch.id}/items`, { name: 'Coin' })).json();
	assert.equal((await send('DELETE', `/api/items/${it2.id}`)).status, 204);
	const d2 = await send('DELETE', `/api/items/${it2.id}`);
	assert.equal(d2.status, 404);
	assert.deepEqual(await d2.json(), { error: 'item not found' });
});

test('deleting a character removes its items', async () => {
	const ch = await mkChar();
	const it = await (await send('POST', `/api/characters/${ch.id}/items`, { name: 'Map' })).json();
	assert.equal((await send('DELETE', `/api/characters/${ch.id}`)).status, 204);
	assert.equal((await send('DELETE', `/api/items/${it.id}`)).status, 404);
});

test('npx drizzle-kit generate reports no schema changes', () => {
	const before = fs.readdirSync(path.join(ROOT, 'drizzle')).sort();
	const out = execSync('npx drizzle-kit generate 2>&1', { cwd: ROOT, encoding: 'utf8' });
	assert.match(out, /No schema changes/i);
	assert.deepEqual(fs.readdirSync(path.join(ROOT, 'drizzle')).sort(), before);
});

test('CLAUDE.md no longer presents raw query or migrations/NNN as the way to work', () => {
	const t = read('CLAUDE.md');
	const sec = (name) => {
		const m = t.match(new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
		assert.ok(m, name);
		return m[1];
	};
	const stack = sec('Stack');
	assert.doesNotMatch(stack, /query\(sql, params\)/);
	assert.doesNotMatch(stack, /Legacy\s+`db\.query` remains/);
	assert.doesNotMatch(sec('Conventions'), /migrations\/NNN/);
	assert.doesNotMatch(sec('Layout') + sec('Conventions'), /migrations\/NNN[^\n]*(change|how)/i);
	assert.match(stack + sec('Layout'), /drizzle/i);
});
