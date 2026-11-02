import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

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
const put = (id, body) => call('PUT', `/api/characters/${id}/conditions`, body);
const get = async (id) => (await call('GET', `/api/characters/${id}`)).json;

async function newChar() {
	const c = await call('POST', '/api/campaigns', { name: 'C' });
	assert.equal(c.status, 201, c.text);
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, {
		name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5,
		severeThreshold: 10, maxHp: 6, armorSlots: 3
	});
	assert.equal(r.status, 201, r.text);
	assert.deepEqual(r.json.conditions, { vulnerable: false, restrained: false, hidden: false });
	return r.json.id;
}

// The criteria form one sequence on a single character.
test('AC1-AC4 and AC5 sequence on one character', async (t) => {
	const id = await newChar();

	await t.test('PUT {"restrained":true} -> 200, only restrained set', async () => {
		const r = await put(id, { restrained: true });
		assert.equal(r.status, 200, r.text);
		assert.deepEqual(r.json.conditions, { vulnerable: false, restrained: true, hidden: false });
		assert.equal(r.json.id, id);
		assert.equal(r.json.name, 'Rook');
		assert.deepEqual(r.json.hp, { marked: 0, max: 6 });
	});

	await t.test('PUT {"hidden":true,"vulnerable":true} -> all true', async () => {
		const r = await put(id, { hidden: true, vulnerable: true });
		assert.equal(r.status, 200, r.text);
		assert.deepEqual(r.json.conditions, { vulnerable: true, restrained: true, hidden: true });
	});

	await t.test('PUT {"restrained":false} leaves others unchanged', async () => {
		const r = await put(id, { restrained: false });
		assert.equal(r.status, 200, r.text);
		assert.deepEqual(r.json.conditions, { vulnerable: true, restrained: false, hidden: true });
		assert.deepEqual((await get(id)).conditions, { vulnerable: true, restrained: false, hidden: true });
	});

	await t.test('PUT {} -> 200, conditions unchanged', async () => {
		const before = await get(id);
		const r = await put(id, {});
		assert.equal(r.status, 200, r.text);
		assert.deepEqual(r.json.conditions, { vulnerable: true, restrained: false, hidden: true });
		assert.deepEqual(r.json, before);
	});

	await t.test('PUT {"vulnerable":"yes"} -> 400, conditions unchanged', async () => {
		const r = await put(id, { vulnerable: 'yes' });
		assert.equal(r.status, 400, r.text);
		assert.deepEqual((await get(id)).conditions, { vulnerable: true, restrained: false, hidden: true });
	});

	await t.test('400 is atomic: valid field alongside invalid one is not applied', async () => {
		const r = await put(id, { hidden: false, restrained: 1 });
		assert.equal(r.status, 400, r.text);
		assert.deepEqual((await get(id)).conditions, { vulnerable: true, restrained: false, hidden: true });
	});
});

test('Unknown character id -> 404', async () => {
	const r = await put(randomUUID(), { hidden: true });
	assert.equal(r.status, 404, r.text);
});
