import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const api = async (method, path, body, raw) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
	const t = await r.text();
	let json = null; try { json = JSON.parse(t); } catch {}
	return { status: r.status, json, text: t };
};
const campaign = async () => (await api('POST', '/api/campaigns', { name: 'Camp' })).json.id;
const J = (c) => `/api/campaigns/${c}/journal`;
const TEXT_ERR = { error: 'text must be 1 to 2000 characters' };

test('GET returns [] for a campaign without entries', async () => {
	const c = await campaign();
	const r = await api('GET', J(c));
	assert.equal(r.status, 200);
	assert.deepEqual(r.json, []);
});

test('POST trims text and returns 201 {id, text, createdAt}', async () => {
	const c = await campaign();
	const r = await api('POST', J(c), { text: '  Door found  ' });
	assert.equal(r.status, 201);
	assert.equal(r.json.text, 'Door found');
	assert.equal(typeof r.json.id, 'string');
	assert.ok(r.json.id.length > 0);
	assert.equal(new Date(r.json.createdAt).toISOString(), r.json.createdAt);
});

test('POST accepts 2000 characters', async () => {
	const c = await campaign();
	const r = await api('POST', J(c), { text: 'a'.repeat(2000) });
	assert.equal(r.status, 201);
});

test('GET lists entries newest first with id, text, createdAt (ISO 8601)', async () => {
	const c = await campaign();
	for (const t of ['first', 'second', 'third']) {
		assert.equal((await api('POST', J(c), { text: t })).status, 201);
		await new Promise((r) => setTimeout(r, 15));
	}
	const r = await api('GET', J(c));
	assert.equal(r.status, 200);
	assert.deepEqual(r.json.map((e) => e.text), ['third', 'second', 'first']);
	for (const e of r.json) {
		assert.equal(typeof e.id, 'string');
		assert.equal(new Date(e.createdAt).toISOString(), e.createdAt);
	}
});

test('POST invalid text -> 400', async () => {
	const c = await campaign();
	for (const text of ['', 'a'.repeat(2001)]) {
		const r = await api('POST', J(c), { text });
		assert.equal(r.status, 400);
		assert.deepEqual(r.json, TEXT_ERR);
	}
	const w = await api('POST', J(c), { text: 5 });
	assert.equal(w.status, 400);
	assert.deepEqual(w.json, { error: 'text must be a string' });
	assert.deepEqual((await api('GET', J(c))).json, []);
});

test('POST non-object or invalid JSON body -> 400', async () => {
	const c = await campaign();
	for (const raw of ['[]', '{not json']) {
		const r = await api('POST', J(c), undefined, raw);
		assert.equal(r.status, 400);
		assert.deepEqual(r.json, { error: 'body must be a JSON object' });
	}
});

test('GET/POST on an unknown campaign -> 404', async () => {
	for (const [m, b] of [['GET'], ['POST', { text: 'x' }]]) {
		const r = await api(m, J('00000000-0000-4000-8000-000000000000'), b);
		assert.equal(r.status, 404);
		assert.deepEqual(r.json, { error: 'campaign not found' });
	}
});

test('DELETE removes the entry -> 204', async () => {
	const c = await campaign();
	const a = (await api('POST', J(c), { text: 'keep' })).json;
	const b = (await api('POST', J(c), { text: 'drop' })).json;
	const r = await api('DELETE', `${J(c)}/${b.id}`);
	assert.equal(r.status, 204);
	assert.deepEqual((await api('GET', J(c))).json.map((e) => e.id), [a.id]);
});

test('DELETE unknown entry or entry of another campaign -> 404', async () => {
	const c1 = await campaign();
	const c2 = await campaign();
	const e = (await api('POST', J(c1), { text: 'mine' })).json;
	for (const [c, id] of [[c1, '00000000-0000-4000-8000-000000000000'], [c2, e.id]]) {
		const r = await api('DELETE', `${J(c)}/${id}`);
		assert.equal(r.status, 404);
		assert.deepEqual(r.json, { error: 'journal entry not found' });
	}
	assert.equal((await api('GET', J(c1))).json.length, 1);
});

test('deleting a campaign removes its entries (checked in the database by run.sh)', async () => {
	const gone = await campaign();
	const kept = await campaign();
	await api('POST', J(gone), { text: 'bye' });
	await api('POST', J(gone), { text: 'bye2' });
	await api('POST', J(kept), { text: 'stay' });
	assert.equal((await api('DELETE', `/api/campaigns/${gone}`)).status, 204);
	writeFileSync(process.env.STATE_FILE, JSON.stringify({ gone, kept }));
});
