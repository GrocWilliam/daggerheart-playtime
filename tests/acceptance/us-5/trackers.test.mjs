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
async function mk(over = {}) {
	const c = await call('POST', '/api/campaigns', { name: 'C' });
	assert.equal(c.status, 201, c.text);
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, {
		name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10,
		maxHp: 6, armorSlots: 3, ...over
	});
	assert.equal(r.status, 201, r.text);
	return r.json;
}
async function post(id, what, delta) {
	const r = await call('POST', `/api/characters/${id}/${what}`, { delta });
	assert.equal(r.status, 200, r.text);
	return r.json;
}

test('hp: adjust, clamp to max (down:true) and clamp to 0', async () => {
	const ch = await mk();
	let c = await post(ch.id, 'hp', 2);
	assert.deepEqual(c.hp, { marked: 2, max: 6 });
	assert.equal(c.down, false);
	c = await post(ch.id, 'hp', 10);
	assert.deepEqual(c.hp, { marked: 6, max: 6 });
	assert.equal(c.down, true);
	c = await post(ch.id, 'hp', -100);
	assert.deepEqual(c.hp, { marked: 0, max: 6 });
	assert.equal(c.down, false);
});

test('hope: clamp to 0 and to 6', async () => {
	const ch = await mk();
	assert.equal(ch.hope, 2);
	let c = await post(ch.id, 'hope', -5);
	assert.equal(c.hope, 0);
	c = await post(ch.id, 'hope', 10);
	assert.equal(c.hope, 6);
});

test('armor: clamp to max and adjust down', async () => {
	const ch = await mk();
	let c = await post(ch.id, 'armor', 5);
	assert.deepEqual(c.armor, { marked: 3, max: 3 });
	c = await post(ch.id, 'armor', -1);
	assert.deepEqual(c.armor, { marked: 2, max: 3 });
});

test('stress without overflow leaves hp and vulnerable unchanged', async () => {
	const ch = await mk({ maxHp: 10 });
	const c = await post(ch.id, 'stress', 4);
	assert.deepEqual(c.stress, { marked: 4, max: 6 });
	assert.deepEqual(c.hp, { marked: 0, max: 10 });
	assert.equal(c.conditions.vulnerable, false);
});

test('stress overflow goes to hp and sets vulnerable; dropping from max clears it', async () => {
	const ch = await mk({ maxHp: 10 });
	await post(ch.id, 'stress', 4);
	let c = await post(ch.id, 'stress', 4);
	assert.deepEqual(c.stress, { marked: 6, max: 6 });
	assert.deepEqual(c.hp, { marked: 2, max: 10 });
	assert.equal(c.conditions.vulnerable, true);
	c = await post(ch.id, 'stress', -1);
	assert.deepEqual(c.stress, { marked: 5, max: 6 });
	assert.equal(c.conditions.vulnerable, false);
});

test('invalid delta -> 400, unknown character -> 404', async () => {
	const ch = await mk();
	for (const what of ['hp', 'hope', 'armor', 'stress']) {
		for (const body of [{ delta: 'two' }, {}, { delta: 1.5 }]) {
			const r = await call('POST', `/api/characters/${ch.id}/${what}`, body);
			assert.equal(r.status, 400, `${what} ${JSON.stringify(body)}: ${r.text}`);
			assert.ok(r.json?.error);
		}
		const r = await call('POST', `/api/characters/00000000-0000-0000-0000-000000000000/${what}`, { delta: 1 });
		assert.equal(r.status, 404, `${what}: ${r.text}`);
		assert.ok(r.json?.error);
	}
});
