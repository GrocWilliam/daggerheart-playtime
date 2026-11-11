// US-248: optional armorId on POST /api/campaigns/:id/characters (HTTP against `node build`).
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
const CHAR = { name: 'Ayla', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };
const CHAIN = 'core_armor_chainmail_armor';
const camp = async () => {
	const c = await call('POST', '/api/campaigns', { name: 'Armor' });
	assert.equal(c.status, 201, c.text);
	return `/api/campaigns/${c.json.id}/characters`;
};

test('POST with a tier 1 armor at level 3 stores armorId and the numbers as sent', async () => {
	const u = await camp();
	const body = { ...CHAR, level: 3, evasion: 7, majorThreshold: 4, severeThreshold: 9, armorSlots: 1, armorId: CHAIN };
	const r = await call('POST', u, body);
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.armorId, CHAIN);
	const g = await call('GET', `/api/characters/${r.json.id}`);
	assert.equal(g.status, 200, g.text);
	assert.equal(g.json.armorId, CHAIN);
	assert.equal(g.json.evasion, 7);
	assert.equal(g.json.majorThreshold, 4);
	assert.equal(g.json.severeThreshold, 9);
	assert.equal(g.json.level, 3);
});

test('POST with an unknown armorId answers 400 armorId must be an armor', async () => {
	const u = await camp();
	const r = await call('POST', u, { ...CHAR, armorId: 'nope' });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'armorId must be an armor' });
});

test('POST with a tier 2 armor at level 1 answers 400 with the tier message', async () => {
	const u = await camp();
	const r = await call('POST', u, { ...CHAR, armorId: 'core_armor_improved_gambeson_armor' });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: "armorId is tier 2, above the character's tier 1" });
});

test('POST without armorId answers 201 with armorId null', async () => {
	const u = await camp();
	const r = await call('POST', u, CHAR);
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.armorId, null);
	const g = await call('GET', `/api/characters/${r.json.id}`);
	assert.equal(g.json.armorId, null);
});

test('POST does not enforce the trait array', async () => {
	const u = await camp();
	const traits = { agility: 2, strength: 2, finesse: 1, instinct: 0, presence: 0, knowledge: -1 };
	const r = await call('POST', u, { ...CHAR, traits });
	assert.equal(r.status, 201, r.text);
});

test('the thresholds error still applies with an armorId', async () => {
	const u = await camp();
	const r = await call('POST', u, { ...CHAR, majorThreshold: 10, severeThreshold: 5, armorId: CHAIN });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100' });
});
