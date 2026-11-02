import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
async function call(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : {},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	let json;
	try { json = text ? JSON.parse(text) : undefined; } catch {}
	return { status: res.status, text, json };
}
async function mk() {
	const c = await call('POST', '/api/campaigns', { name: 'C' });
	assert.equal(c.status, 201, c.text);
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, {
		name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10,
		maxHp: 10, armorSlots: 2
	});
	assert.equal(r.status, 201, r.text);
	return r.json.id;
}
const gold = (id, handfuls) => call('POST', `/api/characters/${id}/gold`, { handfuls });
const getGold = async (id) => {
	const r = await call('GET', `/api/characters/${id}`);
	assert.equal(r.status, 200, r.text);
	return r.json.gold;
};

test('new character: POST 9 handfuls -> {9,0,0}', async () => {
	const id = await mk();
	assert.deepEqual(await getGold(id), { handfuls: 0, bags: 0, chests: 0 });
	const r = await gold(id, 9);
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.id, id);
	assert.deepEqual(r.json.gold, { handfuls: 9, bags: 0, chests: 0 });
	assert.deepEqual(await getGold(id), { handfuls: 9, bags: 0, chests: 0 });
});

test('9 + 3 = 12 -> {2,1,0}', async () => {
	const id = await mk();
	assert.equal((await gold(id, 9)).status, 200);
	const r = await gold(id, 3);
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(r.json.gold, { handfuls: 2, bags: 1, chests: 0 });
	assert.deepEqual(await getGold(id), { handfuls: 2, bags: 1, chests: 0 });
});

test('{5,9,0} + 5 = 100 -> {0,0,1}', async () => {
	const id = await mk();
	// gold is not settable on create/patch, so reach 95 through the endpoint itself
	const a = await gold(id, 95);
	assert.equal(a.status, 200, a.text);
	assert.deepEqual(a.json.gold, { handfuls: 5, bags: 9, chests: 0 });
	const r = await gold(id, 5);
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(r.json.gold, { handfuls: 0, bags: 0, chests: 1 });
	assert.deepEqual(await getGold(id), { handfuls: 0, bags: 0, chests: 1 });
});

test('spending with {0,0,0}: -1 -> 400 not enough gold, unchanged', async () => {
	const id = await mk();
	const r = await gold(id, -1);
	assert.equal(r.status, 400, r.text);
	assert.deepEqual(r.json, { error: 'not enough gold' });
	assert.deepEqual(await getGold(id), { handfuls: 0, bags: 0, chests: 0 });
});

test('{2,0,0}: -5 -> 400 (would be -3), unchanged', async () => {
	const id = await mk();
	assert.equal((await gold(id, 2)).status, 200);
	const r = await gold(id, -5);
	assert.equal(r.status, 400, r.text);
	assert.deepEqual(r.json, { error: 'not enough gold' });
	assert.deepEqual(await getGold(id), { handfuls: 2, bags: 0, chests: 0 });
});

test('valid spend re-normalizes (100 - 1 = 99 -> {9,9,0}); chests unbounded', async () => {
	const id = await mk();
	const a = await gold(id, 1234);
	assert.deepEqual(a.json.gold, { handfuls: 4, bags: 3, chests: 12 });
	const r = await gold(id, -1135);
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(r.json.gold, { handfuls: 9, bags: 9, chests: 0 });
});

test('unknown character id -> 404', async () => {
	const r = await gold('00000000-0000-0000-0000-000000000000', 1);
	assert.equal(r.status, 404, r.text);
	const r2 = await gold('999999', 1);
	assert.equal(r2.status, 404, r2.text);
});

test('non-integer or missing handfuls -> 400', async () => {
	const id = await mk();
	for (const v of ['two', 1.5, null]) {
		const r = await gold(id, v);
		assert.equal(r.status, 400, `${JSON.stringify(v)}: ${r.text}`);
	}
	const m = await call('POST', `/api/characters/${id}/gold`, {});
	assert.equal(m.status, 400, m.text);
	assert.deepEqual(await getGold(id), { handfuls: 0, bags: 0, chests: 0 });
});
