import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
async function call(method, path, body, raw) {
	const res = await fetch(BASE + path, {
		method,
		headers: body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {},
		body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	let json;
	try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
	return { status: res.status, text, json };
}
const create = async (name) => {
	const r = await call('POST', '/api/campaigns', { name });
	assert.equal(r.status, 201, r.text);
	return r.json;
};

test('POST trims the name: "  My Camp  " -> 201 "My Camp"', async () => {
	const r = await call('POST', '/api/campaigns', { name: '  My Camp  ' });
	assert.equal(r.status, 201);
	assert.equal(r.json.name, 'My Camp');
	assert.equal(r.json.fear, 0);
	assert.ok(r.json.id);
	const g = await call('GET', `/api/campaigns/${r.json.id}`);
	assert.equal(g.json.name, 'My Camp');
});

test('POST with empty, blank or missing name -> 400 with error', async () => {
	for (const body of [{ name: '' }, { name: '   ' }, {}]) {
		const r = await call('POST', '/api/campaigns', body);
		assert.equal(r.status, 400, JSON.stringify(body));
		assert.equal(typeof r.json?.error, 'string');
	}
	const bad = await call('POST', '/api/campaigns', undefined, '{not json');
	assert.equal(bad.status, 400);
	assert.equal(typeof bad.json?.error, 'string');
});

test('POST with a 101-character name -> 400 (100 accepted)', async () => {
	const r = await call('POST', '/api/campaigns', { name: 'x'.repeat(101) });
	assert.equal(r.status, 400);
	assert.equal(typeof r.json?.error, 'string');
	const ok = await call('POST', '/api/campaigns', { name: 'y'.repeat(100) });
	assert.equal(ok.status, 201);
});

test('GET /api/campaigns after creating A then B -> [A, B] in order', async () => {
	const a = await create('Order A');
	const b = await create('Order B');
	const r = await call('GET', '/api/campaigns');
	assert.equal(r.status, 200);
	assert.ok(Array.isArray(r.json));
	const ids = r.json.map((c) => c.id);
	assert.ok(ids.indexOf(a.id) >= 0 && ids.indexOf(b.id) > ids.indexOf(a.id));
	assert.deepEqual(r.json[ids.indexOf(a.id)], { id: a.id, name: 'Order A', fear: 0 });
});

test('GET /api/campaigns/:id -> 200 with characters []; unknown id -> 404', async () => {
	const c = await create('Readable');
	const r = await call('GET', `/api/campaigns/${c.id}`);
	assert.equal(r.status, 200);
	assert.deepEqual(r.json, { id: c.id, name: 'Readable', fear: 0, characters: [] });
	const u = await call('GET', '/api/campaigns/00000000-0000-4000-8000-000000000000');
	assert.equal(u.status, 404);
	assert.equal(typeof u.json?.error, 'string');
});

test('PATCH renames; following GET reflects it', async () => {
	const c = await create('Old Name');
	const r = await call('PATCH', `/api/campaigns/${c.id}`, { name: 'New Name' });
	assert.equal(r.status, 200);
	assert.deepEqual(r.json, { id: c.id, name: 'New Name', fear: 0, characters: [] });
	const g = await call('GET', `/api/campaigns/${c.id}`);
	assert.equal(g.json.name, 'New Name');
	const bad = await call('PATCH', `/api/campaigns/${c.id}`, { name: '  ' });
	assert.equal(bad.status, 400);
	const nf = await call('PATCH', '/api/campaigns/00000000-0000-4000-8000-000000000000', { name: 'Z' });
	assert.equal(nf.status, 404);
});

test('DELETE -> 204 empty; following GET -> 404', async () => {
	const c = await create('Doomed');
	const r = await call('DELETE', `/api/campaigns/${c.id}`);
	assert.equal(r.status, 204);
	assert.equal(r.text, '');
	const g = await call('GET', `/api/campaigns/${c.id}`);
	assert.equal(g.status, 404);
});

test('POST fear: +5 -> 5, +20 -> 12 (clamped), -100 -> 0 (clamped)', async () => {
	const c = await create('Fearful');
	const f = (delta) => call('POST', `/api/campaigns/${c.id}/fear`, { delta });
	let r = await f(5);
	assert.equal(r.status, 200);
	assert.deepEqual(r.json, { fear: 5 });
	r = await f(20);
	assert.deepEqual(r.json, { fear: 12 });
	r = await f(-100);
	assert.deepEqual(r.json, { fear: 0 });
	const g = await call('GET', `/api/campaigns/${c.id}`);
	assert.equal(g.json.fear, 0);
	assert.equal((await f(1.5)).status, 400);
	assert.equal((await call('POST', '/api/campaigns/00000000-0000-4000-8000-000000000000/fear', { delta: 1 })).status, 404);
});
