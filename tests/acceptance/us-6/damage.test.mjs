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
// majorThreshold=5, severeThreshold=10, hp {0,10}, armor {0,2}
async function mk({ hp = 0, armor = 0 } = {}) {
	const c = await call('POST', '/api/campaigns', { name: 'C' });
	assert.equal(c.status, 201, c.text);
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, {
		name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10,
		maxHp: 10, armorSlots: 2
	});
	assert.equal(r.status, 201, r.text);
	const id = r.json.id;
	if (hp) assert.equal((await call('POST', `/api/characters/${id}/hp`, { delta: hp })).status, 200);
	if (armor) assert.equal((await call('POST', `/api/characters/${id}/armor`, { delta: armor })).status, 200);
	return id;
}
const dmg = (id, body) => call('POST', `/api/characters/${id}/damage`, body);
async function get(id) {
	const r = await call('GET', `/api/characters/${id}`);
	assert.equal(r.status, 200, r.text);
	return r.json;
}

test('amount 7 with armor: hpMarked 1, armorUsed, armor {1,2}, hp {1,10}', async () => {
	const id = await mk();
	const r = await dmg(id, { amount: 7, useArmor: true });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.hpMarked, 1);
	assert.equal(r.json.armorUsed, true);
	assert.deepEqual(r.json.character.armor, { marked: 1, max: 2 });
	assert.deepEqual(r.json.character.hp, { marked: 1, max: 10 });
	assert.equal(r.json.character.id, id);
	// persisted
	const c = await get(id);
	assert.deepEqual(c.armor, { marked: 1, max: 2 });
	assert.deepEqual(c.hp, { marked: 1, max: 10 });
});

test('amount 3 without armor: hpMarked 1, armorUsed false, hp +1, armor unchanged', async () => {
	const id = await mk();
	const r = await dmg(id, { amount: 3, useArmor: false });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.hpMarked, 1);
	assert.equal(r.json.armorUsed, false);
	assert.deepEqual(r.json.character.hp, { marked: 1, max: 10 });
	assert.deepEqual(r.json.character.armor, { marked: 0, max: 2 });
});

test('amount 10 (>= severe) without armor: hpMarked 3; amount 5 (= major) -> 2', async () => {
	const id = await mk();
	const r = await dmg(id, { amount: 10, useArmor: false });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.hpMarked, 3);
	assert.equal(r.json.character.hp.marked, 3);
	const r2 = await dmg(id, { amount: 5, useArmor: false });
	assert.equal(r2.json.hpMarked, 2);
	assert.equal(r2.json.character.hp.marked, 5);
});

test('amount 0 or -5: hpMarked 0, hp unchanged', async () => {
	const id = await mk({ hp: 2 });
	for (const amount of [0, -5]) {
		for (const useArmor of [false, true]) {
			const r = await dmg(id, { amount, useArmor });
			assert.equal(r.status, 200, r.text);
			assert.equal(r.json.hpMarked, 0);
			assert.equal(r.json.character.hp.marked, 2);
		}
	}
});

test('full armor: amount 7 useArmor -> armorUsed false, hpMarked 2', async () => {
	const id = await mk({ armor: 2 });
	const r = await dmg(id, { amount: 7, useArmor: true });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armorUsed, false);
	assert.equal(r.json.hpMarked, 2);
	assert.deepEqual(r.json.character.armor, { marked: 2, max: 2 });
	assert.deepEqual(r.json.character.hp, { marked: 2, max: 10 });
});

test('hp {9,10}, amount 20: hp.marked clamped to 10, hpMarked 3', async () => {
	const id = await mk({ hp: 9 });
	const r = await dmg(id, { amount: 20, useArmor: false });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.hpMarked, 3);
	assert.equal(r.json.character.hp.marked, 10);
	assert.equal(r.json.character.down, true);
});

test('unknown id -> 404; invalid body -> 400', async () => {
	const r = await dmg('00000000-0000-0000-0000-000000000000', { amount: 3, useArmor: false });
	assert.equal(r.status, 404, r.text);
	const id = await mk();
	for (const body of [
		{ amount: 'lots', useArmor: false },
		{ amount: 'lots' },
		{ useArmor: false },
		{ amount: 2.5, useArmor: false },
		{ amount: 3, useArmor: 'yes' },
		{ amount: 3 }
	]) {
		const b = await dmg(id, body);
		assert.equal(b.status, 400, JSON.stringify(body) + ' ' + b.text);
	}
	const c = await get(id);
	assert.deepEqual(c.hp, { marked: 0, max: 10 });
	assert.deepEqual(c.armor, { marked: 0, max: 2 });
});
