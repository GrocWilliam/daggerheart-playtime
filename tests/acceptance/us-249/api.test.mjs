// US-249: PATCH /api/characters/:id recomputes thresholds, Armor and Evasion (HTTP against `node build`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
};
const CHAIN = 'core_armor_chainmail_armor'; // Heavy: 7/15 + level, Armor 4
const GAMB = 'core_armor_gambeson_armor'; // Flexible: 5/11 + level, Armor 3
const BASEC = { name: 'Ayla', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };
const mk = async (over = {}) => {
	const c = await call('POST', '/api/campaigns', { name: 'Recompute' });
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, { ...BASEC, ...over });
	assert.equal(r.status, 201, r.text);
	return r.json.id;
};
const patch = (id, b) => call('PATCH', `/api/characters/${id}`, b);
const th = (j) => [j.majorThreshold, j.severeThreshold];

test('swapping Heavy armor for a Flexible one at level 3 adds 2 Evasion and takes the new armor numbers', async () => {
	const id = await mk({ level: 3, evasion: 12, majorThreshold: 10, severeThreshold: 18, armorSlots: 4, armorId: CHAIN });
	const r = await patch(id, { armorId: GAMB });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armorId, GAMB);
	assert.equal(r.json.evasion, 14);
	assert.deepEqual(th(r.json), [8, 14]);
	assert.equal(r.json.armor.max, 3);
	const g = await call('GET', `/api/characters/${id}`);
	assert.equal(g.json.evasion, 14);
});

test('unequipping Chainmail clears Armor and marks, resets thresholds and gives back Evasion', async () => {
	const id = await mk({ level: 3, evasion: 10, majorThreshold: 10, severeThreshold: 18, armorSlots: 4, armorId: CHAIN });
	const m = await call('POST', `/api/characters/${id}/armor`, { delta: 2 });
	assert.equal(m.status, 200, m.text);
	assert.equal(m.json.armor.marked, 2);
	const r = await patch(id, { armorId: null });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armorId, null);
	assert.deepEqual(r.json.armor, { marked: 0, max: 0 });
	assert.deepEqual(th(r.json), [3, 6]);
	assert.equal(r.json.evasion, 11);
});

test('unequipping with no armor changes nothing', async () => {
	const id = await mk({ level: 3, evasion: 9, majorThreshold: 7, severeThreshold: 13, armorSlots: 2 });
	const r = await patch(id, { armorId: null });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(th(r.json), [7, 13]);
	assert.equal(r.json.evasion, 9);
	assert.equal(r.json.armor.max, 2);
});

test('level 1 to 3 in Chainmail raises thresholds to 10/18 and keeps Evasion', async () => {
	const id = await mk({ level: 1, evasion: 9, majorThreshold: 8, severeThreshold: 16, armorSlots: 4, armorId: CHAIN });
	const r = await patch(id, { level: 3 });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.level, 3);
	assert.deepEqual(th(r.json), [10, 18]);
	assert.equal(r.json.evasion, 9);
});

test('unarmored level 2 with 2/4 follows the level to 5/10', async () => {
	const id = await mk({ level: 2, majorThreshold: 2, severeThreshold: 4 });
	const r = await patch(id, { level: 5 });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(th(r.json), [5, 10]);
});

test('unarmored level 2 with hand-entered 5/10 keeps them at level 3', async () => {
	const id = await mk({ level: 2, majorThreshold: 5, severeThreshold: 10 });
	const r = await patch(id, { level: 3 });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(th(r.json), [5, 10]);
});

test('explicit thresholds and evasion win over the recomputed ones', async () => {
	const id = await mk({ level: 3, evasion: 10, majorThreshold: 8, severeThreshold: 14, armorSlots: 3, armorId: GAMB });
	const r = await patch(id, { armorId: CHAIN, majorThreshold: 9, evasion: 15 });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armorId, CHAIN);
	assert.equal(r.json.majorThreshold, 9);
	assert.equal(r.json.severeThreshold, 18);
	assert.equal(r.json.evasion, 15);
});

test('an explicit armorSlots wins over the armor value', async () => {
	const id = await mk({ level: 3, armorSlots: 3, armorId: GAMB, majorThreshold: 8, severeThreshold: 14 });
	const r = await patch(id, { armorId: CHAIN, armorSlots: 6 });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armor.max, 6);
});

test('a level change never touches maxHp or evasion', async () => {
	for (const over of [{ armorId: CHAIN, majorThreshold: 8, severeThreshold: 16, armorSlots: 4 }, {}]) {
		const id = await mk({ level: 1, evasion: 13, maxHp: 8, ...over });
		const r = await patch(id, { level: 4 });
		assert.equal(r.status, 200, r.text);
		assert.equal(r.json.level, 4);
		assert.equal(r.json.hp.max, 8);
		assert.equal(r.json.evasion, 13);
	}
});

test('PATCH error texts are unchanged', async () => {
	const id = await mk();
	let r = await patch(id, { armorId: 'nope' });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'armorId must be an armor' });
	r = await patch(id, { armorId: 'core_armor_improved_gambeson_armor' });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: "armorId is tier 2, above the character's tier 1" });
	r = await patch(id, { majorThreshold: 10, severeThreshold: 5 });
	assert.equal(r.status, 400);
	r = await patch('00000000-0000-0000-0000-000000000000', { name: 'x' });
	assert.equal(r.status, 404);
});
