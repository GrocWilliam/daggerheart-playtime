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
const mk = async (name) => (await (await send('POST', '/api/campaigns', { name })).json());

test('campaigns.ts holds no raw SQL outside sql template fragments', () => {
	const lines = fs.readFileSync(path.join(ROOT, 'src/lib/server/features/campaigns.ts'), 'utf8').split('\n');
	const bad = lines.filter((l) => /SELECT|INSERT|UPDATE|DELETE/.test(l) && !/\bsql\b|sql`/.test(l));
	assert.deepEqual(bad, []);
	const src = lines.join('\n');
	assert.match(src, /getDrizzle/);
	assert.doesNotMatch(src, /\.query\(/);
});

test('campaign API handlers use the Drizzle builder, not db.query', () => {
	const dir = path.join(ROOT, 'src/routes/api/campaigns');
	const files = [];
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true }))
			e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name));
	})(dir);
	assert.ok(files.length >= 4);
	for (const f of files) {
		const t = fs.readFileSync(f, 'utf8');
		assert.doesNotMatch(t, /\.query\(/, f);
		assert.doesNotMatch(t, /\b(SELECT|INSERT INTO|DELETE FROM)\b/, f);
		assert.doesNotMatch(t, /\bUPDATE \w+ SET\b/, f);
	}
});

test('campaigns.test.ts runs on PGlite and covers list, create, read, fear clamping at 0 and 12, delete', () => {
	const file = path.join(ROOT, 'src/lib/server/features/campaigns.test.ts');
	const t = fs.readFileSync(file, 'utf8');
	assert.match(t, /listCampaigns|list/i);
	assert.match(t, /createCampaign|create/i);
	assert.match(t, /\b12\b/);
	assert.match(t, /delete/i);
	assert.match(t, /memory:\/\/|pglite/i);
	execSync('npx vitest run src/lib/server/features/campaigns.test.ts', { cwd: ROOT, stdio: 'pipe' });
});

test('endpoints: create returns 201 with exactly id, name, fear; list keeps creation order', async () => {
	const a = await mk('  Alpha  ');
	const b = await mk('Beta');
	assert.deepEqual(Object.keys(a).sort(), ['fear', 'id', 'name']);
	assert.equal(a.name, 'Alpha');
	assert.equal(a.fear, 0);
	const r = await send('POST', '/api/campaigns', { name: 'Gamma' });
	assert.equal(r.status, 201);
	const list = await (await send('GET', '/api/campaigns')).json();
	const ids = list.map((c) => c.id);
	assert.ok(ids.indexOf(a.id) < ids.indexOf(b.id));
	assert.deepEqual(list.find((c) => c.id === b.id), { id: b.id, name: 'Beta', fear: 0 });
});

test('endpoints: create validation errors keep status and message', async () => {
	let r = await send('POST', '/api/campaigns', { name: '' });
	assert.equal(r.status, 400);
	assert.deepEqual(await r.json(), { error: 'name must be 1 to 100 characters' });
	r = await send('POST', '/api/campaigns', '{bad', true);
	assert.equal(r.status, 400);
	assert.deepEqual(await r.json(), { error: 'malformed JSON' });
});

test('endpoints: read returns id, name, fear, characters in creation order', async () => {
	const c = await mk('Reader');
	const body = { name: 'Zed', class: 'Bard', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };
	const c1 = await send('POST', `/api/campaigns/${c.id}/characters`, body);
	assert.equal(c1.status, 201);
	const first = await c1.json();
	const second = await (await send('POST', `/api/campaigns/${c.id}/characters`, { ...body, name: 'Amy' })).json();
	const r = await send('GET', `/api/campaigns/${c.id}`);
	assert.equal(r.status, 200);
	const d = await r.json();
	assert.deepEqual(Object.keys(d), ['id', 'name', 'fear', 'characters']);
	assert.deepEqual(d.characters.map((x) => x.id), [first.id, second.id]);
	assert.deepEqual(d.characters[0], first);
	assert.equal((await send('POST', '/api/campaigns/nope/characters', body)).status, 404);
});

test('endpoints: rename returns the detail; unknown id is 404 "campaign not found"', async () => {
	const c = await mk('Old');
	const r = await send('PATCH', `/api/campaigns/${c.id}`, { name: 'New' });
	assert.equal(r.status, 200);
	assert.deepEqual(await r.json(), { id: c.id, name: 'New', fear: 0, characters: [] });
	for (const [m, b] of [['GET'], ['PATCH', { name: 'x' }], ['DELETE'], ['POST', { delta: 1 }]]) {
		const p = `/api/campaigns/does-not-exist${m === 'POST' ? '/fear' : ''}`;
		const x = await send(m, p, b);
		assert.equal(x.status, 404, m);
		assert.deepEqual(await x.json(), { error: 'campaign not found' });
	}
	assert.equal((await send('PATCH', `/api/campaigns/${c.id}`, { name: '' })).status, 400);
});

test('endpoints: fear moves by delta and clamps at 0 and 12', async () => {
	const c = await mk('Fearful');
	const fear = async (delta) => {
		const r = await send('POST', `/api/campaigns/${c.id}/fear`, { delta });
		assert.equal(r.status, 200);
		return r.json();
	};
	assert.deepEqual(await fear(5), { fear: 5 });
	assert.deepEqual(await fear(-100), { fear: 0 });
	assert.deepEqual(await fear(7), { fear: 7 });
	assert.deepEqual(await fear(100), { fear: 12 });
	assert.deepEqual(await fear(Number.MAX_SAFE_INTEGER), { fear: 12 });
	assert.deepEqual(await fear(-Number.MAX_SAFE_INTEGER), { fear: 0 });
	assert.equal((await (await send('GET', `/api/campaigns/${c.id}`)).json()).fear, 0);
	const bad = await send('POST', `/api/campaigns/${c.id}/fear`, { delta: 1.5 });
	assert.equal(bad.status, 400);
});

test('endpoints: delete returns 204 empty, removes it and its characters', async () => {
	const c = await mk('Doomed');
	const ch = await (await send('POST', `/api/campaigns/${c.id}/characters`, { name: 'X', class: 'Bard', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 })).json();
	const r = await send('DELETE', `/api/campaigns/${c.id}`);
	assert.equal(r.status, 204);
	assert.equal(await r.text(), '');
	assert.equal((await send('GET', `/api/campaigns/${c.id}`)).status, 404);
	assert.equal((await send('GET', `/api/characters/${ch.id}`)).status, 404);
	assert.equal((await send('DELETE', `/api/campaigns/${c.id}`)).status, 404);
	const list = await (await send('GET', '/api/campaigns')).json();
	assert.ok(!list.some((x) => x.id === c.id));
});
