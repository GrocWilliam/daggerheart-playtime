import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json };
};
const campaign = async (name = 'Camp') => (await call('POST', '/api/campaigns', { name })).json;
const scenes = async (c) => (await call('GET', `/api/campaigns/${c}/scenes`)).json;
const add = async (c, title) => (await call('POST', `/api/campaigns/${c}/scenes`, { title })).json;
const titles = (l) => l.map((s) => s.title);
const bad = (r, msg) => { assert.equal(r.status, 400); assert.deepEqual(r.json, { error: msg }); };

test('POST creates a trimmed scene with defaults, last in GET', async () => {
	const c = await campaign();
	await add(c.id, 'First');
	const r = await call('POST', `/api/campaigns/${c.id}/scenes`, { title: '  Ambush ' });
	assert.equal(r.status, 201);
	assert.equal(r.json.title, 'Ambush');
	assert.equal(r.json.notes, '');
	assert.equal(r.json.environmentId, null);
	assert.equal(r.json.status, 'planned');
	assert.equal(r.json.encounter, null);
	assert.deepEqual(r.json.loot, []);
	assert.ok(r.json.id !== undefined);
	const list = await scenes(c.id);
	assert.deepEqual(titles(list), ['First', 'Ambush']);
	assert.deepEqual(list[1], r.json);
});

test('POST accepts notes and an SRD environment id', async () => {
	const c = await campaign();
	const envs = (await call('GET', '/api/srd/environments')).json;
	const r = await call('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Cave', notes: 'Dark', environmentId: envs[0].id });
	assert.equal(r.status, 201);
	assert.equal(r.json.notes, 'Dark');
	assert.equal(r.json.environmentId, envs[0].id);
});

test('400 messages for invalid input', async () => {
	const c = await campaign();
	const base = `/api/campaigns/${c.id}/scenes`;
	const TITLE = 'title must be 1 to 100 characters';
	bad(await call('POST', base, { title: '' }), TITLE);
	bad(await call('POST', base, { title: '   ' }), TITLE);
	bad(await call('POST', base, { title: 'x'.repeat(101) }), TITLE);
	assert.equal((await call('POST', base, { title: 'x'.repeat(100) })).status, 201);
	const NOTES = 'notes must be at most 5000 characters';
	bad(await call('POST', base, { title: 'A', notes: 'n'.repeat(5001) }), NOTES);
	assert.equal((await call('POST', base, { title: 'A', notes: 'n'.repeat(5000) })).status, 201);
	const advs = (await call('GET', '/api/srd/adversaries')).json;
	const ENV = 'environmentId must be an environment';
	bad(await call('POST', base, { title: 'A', environmentId: advs[0].id }), ENV);
	const s = await add(c.id, 'S');
	bad(await call('PATCH', `${base}/${s.id}`, { environmentId: advs[0].id }), ENV);
	bad(await call('PATCH', `${base}/${s.id}`, { status: 'active' }), 'status must be planned, current or done');
	bad(await call('PATCH', `${base}/${s.id}`, { title: '' }), TITLE);
	bad(await call('PATCH', `${base}/${s.id}`, { notes: 'n'.repeat(5001) }), NOTES);
	const n = (await scenes(c.id)).length;
	const POS = `position must be an integer from 0 to ${n - 1}`;
	for (const position of [-1, 1.5, n]) bad(await call('POST', `${base}/${s.id}/move`, { position }), POS);
});

test('unknown campaign or scene -> 404', async () => {
	const c = await campaign();
	const s = await add(c.id, 'S');
	const other = await campaign('Other');
	const o = await add(other.id, 'O');
	assert.equal((await call('GET', '/api/campaigns/999999/scenes')).status, 404);
	assert.equal((await call('POST', '/api/campaigns/999999/scenes', { title: 'A' })).status, 404);
	const b = `/api/campaigns/${c.id}/scenes`;
	assert.equal((await call('PATCH', `${b}/999999`, { title: 'A' })).status, 404);
	assert.equal((await call('DELETE', `${b}/999999`)).status, 404);
	assert.equal((await call('POST', `${b}/999999/move`, { position: 0 })).status, 404);
	assert.equal((await call('PATCH', `/api/campaigns/999999/scenes/${s.id}`, { title: 'A' })).status, 404);
	// a scene of another campaign is not reachable
	assert.equal((await call('PATCH', `${b}/${o.id}`, { title: 'A' })).status, 404);
	assert.equal((await call('DELETE', `${b}/${o.id}`)).status, 404);
});

test('PATCH updates fields and returns the scene', async () => {
	const c = await campaign();
	const s = await add(c.id, 'Old');
	const r = await call('PATCH', `/api/campaigns/${c.id}/scenes/${s.id}`, { title: ' New ', notes: 'N' });
	assert.equal(r.status, 200);
	assert.equal(r.json.title, 'New');
	assert.equal(r.json.notes, 'N');
	assert.equal(r.json.id, s.id);
});

test('setting B current while A is current leaves A done', async () => {
	const c = await campaign();
	const b = `/api/campaigns/${c.id}/scenes`;
	const A = await add(c.id, 'A'), B = await add(c.id, 'B'), C = await add(c.id, 'C');
	assert.equal((await call('PATCH', `${b}/${A.id}`, { status: 'current' })).json.status, 'current');
	assert.equal((await call('PATCH', `${b}/${B.id}`, { status: 'current' })).json.status, 'current');
	let l = await scenes(c.id);
	assert.deepEqual(l.map((s) => s.status), ['done', 'current', 'planned']);
	await call('PATCH', `${b}/${C.id}`, { status: 'current' });
	l = await scenes(c.id);
	assert.deepEqual(l.map((s) => s.status), ['done', 'done', 'current']);
	assert.equal(l.filter((s) => s.status === 'current').length, 1);
});

test('move C to position 0 returns [C,A,B] and persists', async () => {
	const c = await campaign();
	const b = `/api/campaigns/${c.id}/scenes`;
	await add(c.id, 'A'); await add(c.id, 'B'); const C = await add(c.id, 'C');
	const r = await call('POST', `${b}/${C.id}/move`, { position: 0 });
	assert.equal(r.status, 200);
	assert.deepEqual(titles(r.json), ['C', 'A', 'B']);
	assert.deepEqual(titles(await scenes(c.id)), ['C', 'A', 'B']);
	const r2 = await call('POST', `${b}/${C.id}/move`, { position: 2 });
	assert.deepEqual(titles(r2.json), ['A', 'B', 'C']);
	const D = await add(c.id, 'D');
	assert.deepEqual(titles(await scenes(c.id)), ['A', 'B', 'C', 'D']);
	assert.deepEqual(titles((await call('POST', `${b}/${D.id}/move`, { position: 1 })).json), ['A', 'D', 'B', 'C']);
});

test('DELETE returns 204 and the scene is gone', async () => {
	const c = await campaign();
	const A = await add(c.id, 'A'); await add(c.id, 'B');
	const r = await call('DELETE', `/api/campaigns/${c.id}/scenes/${A.id}`);
	assert.equal(r.status, 204);
	assert.deepEqual(titles(await scenes(c.id)), ['B']);
	assert.equal((await call('DELETE', `/api/campaigns/${c.id}/scenes/${A.id}`)).status, 404);
	await add(c.id, 'C');
	assert.deepEqual(titles(await scenes(c.id)), ['B', 'C']);
});

test('deleting the campaign removes its scenes', async () => {
	const c = await campaign('Same');
	await add(c.id, 'A');
	assert.equal((await call('DELETE', `/api/campaigns/${c.id}`)).status, 204);
	assert.equal((await call('GET', `/api/campaigns/${c.id}/scenes`)).status, 404);
	const c2 = await campaign('Same');
	assert.deepEqual(await scenes(c2.id), []);
});

test('GET /api/campaigns/:id JSON is unchanged', async () => {
	const c = await campaign('Plain');
	const before = (await call('GET', `/api/campaigns/${c.id}`)).json;
	await add(c.id, 'A');
	const after = (await call('GET', `/api/campaigns/${c.id}`)).json;
	assert.deepEqual(after, before);
	assert.ok(!('scenes' in after));
});

test('scenes.ts has colocated Vitest tests', () => {
	assert.ok(fs.existsSync('src/lib/server/features/scenes.ts'));
	assert.ok(fs.existsSync('src/lib/server/features/scenes.test.ts'));
	assert.match(fs.readFileSync('src/lib/server/features/scenes.test.ts', 'utf8'), /title must be 1 to 100 characters/);
});
