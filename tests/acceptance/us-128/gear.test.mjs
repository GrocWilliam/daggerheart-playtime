import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await res.text();
	return { status: res.status, json: text ? JSON.parse(text) : undefined, text };
};
const valid = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 6 };
const mk = async (over = {}) => {
	const camp = (await call('POST', '/api/campaigns', { name: 'C' })).json;
	return (await call('POST', `/api/campaigns/${camp.id}/characters`, { ...valid, ...over })).json;
};
const patch = (id, b) => call('PATCH', `/api/characters/${id}`, b);
const err = (r, status, error) => { assert.equal(r.status, status, r.text); assert.deepEqual(r.json, { error }); };

test('a new character has all three fields null', async () => {
	const ch = await mk();
	for (const k of ['primaryWeapon', 'secondaryWeapon', 'armorId']) assert.equal(ch[k], null, k);
	const g = (await call('GET', `/api/characters/${ch.id}`)).json;
	assert.deepEqual([g.primaryWeapon, g.secondaryWeapon, g.armorId], [null, null, null]);
});

test('equipping valid tier 1 gear returns 200 and null unequips', async () => {
	const ch = await mk();
	let r = await patch(ch.id, { primaryWeapon: 'core_weapon_broadsword' });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.primaryWeapon, 'core_weapon_broadsword');
	r = await patch(ch.id, { secondaryWeapon: 'core_weapon_round_shield' });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.secondaryWeapon, 'core_weapon_round_shield');
	r = await patch(ch.id, { armorId: 'core_armor_leather_armor' });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armorId, 'core_armor_leather_armor');
	const g = (await call('GET', `/api/characters/${ch.id}`)).json;
	assert.deepEqual([g.primaryWeapon, g.secondaryWeapon, g.armorId], ['core_weapon_broadsword', 'core_weapon_round_shield', 'core_armor_leather_armor']);
	r = await patch(ch.id, { primaryWeapon: null, secondaryWeapon: null, armorId: null });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual([r.json.primaryWeapon, r.json.secondaryWeapon, r.json.armorId], [null, null, null]);
	r = await patch(ch.id, { primaryWeapon: 'core_weapon_wand' });
	assert.equal(r.json.primaryWeapon, 'core_weapon_wand');
});

test('wrong type or unknown id returns the 400 message', async () => {
	const ch = await mk();
	err(await patch(ch.id, { primaryWeapon: 'core_weapon_shortsword' }), 400, 'primaryWeapon must be a primary weapon');
	err(await patch(ch.id, { primaryWeapon: 'nope' }), 400, 'primaryWeapon must be a primary weapon');
	err(await patch(ch.id, { secondaryWeapon: 'core_weapon_broadsword' }), 400, 'secondaryWeapon must be a secondary weapon');
	err(await patch(ch.id, { secondaryWeapon: 'nope' }), 400, 'secondaryWeapon must be a secondary weapon');
	err(await patch(ch.id, { armorId: 'core_weapon_broadsword' }), 400, 'armorId must be an armor');
	err(await patch(ch.id, { armorId: 'nope' }), 400, 'armorId must be an armor');
	const g = (await call('GET', `/api/characters/${ch.id}`)).json;
	assert.deepEqual([g.primaryWeapon, g.secondaryWeapon, g.armorId], [null, null, null]);
});

test('gear above the character tier returns 400; the same id succeeds at level 2', async () => {
	const ch = await mk();
	err(await patch(ch.id, { primaryWeapon: 'core_weapon_improved_broadsword' }), 400, "primaryWeapon is tier 2, above the character's tier 1");
	err(await patch(ch.id, { secondaryWeapon: 'core_weapon_improved_shortsword' }), 400, "secondaryWeapon is tier 2, above the character's tier 1");
	err(await patch(ch.id, { armorId: 'core_armor_improved_gambeson_armor' }), 400, "armorId is tier 2, above the character's tier 1");
	err(await patch(ch.id, { primaryWeapon: 'core_weapon_advanced_broadsword' }), 400, "primaryWeapon is tier 3, above the character's tier 1");
	const l2 = await mk({ level: 2 });
	let r = await patch(l2.id, { primaryWeapon: 'core_weapon_improved_broadsword' });
	assert.equal(r.status, 200, r.text);
	r = await patch(l2.id, { secondaryWeapon: 'core_weapon_improved_shortsword', armorId: 'core_armor_improved_gambeson_armor' });
	assert.equal(r.status, 200, r.text);
	err(await patch(l2.id, { primaryWeapon: 'core_weapon_advanced_broadsword' }), 400, "primaryWeapon is tier 3, above the character's tier 2");
	// the level change in the same PATCH counts
	const l1 = await mk();
	r = await patch(l1.id, { level: 2, primaryWeapon: 'core_weapon_improved_broadsword' });
	assert.equal(r.status, 200, r.text);
	// tier boundaries
	const l5 = await mk({ level: 5 });
	assert.equal((await patch(l5.id, { primaryWeapon: 'core_weapon_advanced_broadsword' })).status, 200);
	err(await patch(l5.id, { armorId: 'core_armor_legendary_gambeson_armor' }), 400, "armorId is tier 4, above the character's tier 3");
	const l8 = await mk({ level: 8 });
	assert.equal((await patch(l8.id, { armorId: 'core_armor_legendary_gambeson_armor' })).status, 200);
});

test('a two-handed primary leaves no hand for a secondary', async () => {
	const M = 'a two-handed primary weapon leaves no hand for a secondary weapon';
	const ch = await mk();
	assert.equal((await patch(ch.id, { secondaryWeapon: 'core_weapon_shortsword' })).status, 200);
	err(await patch(ch.id, { primaryWeapon: 'core_weapon_longsword' }), 400, M);
	assert.equal((await patch(ch.id, { primaryWeapon: 'core_weapon_broadsword' })).status, 200);
	const ch2 = await mk();
	assert.equal((await patch(ch2.id, { primaryWeapon: 'core_weapon_longsword' })).status, 200);
	err(await patch(ch2.id, { secondaryWeapon: 'core_weapon_shortsword' }), 400, M);
	err(await patch(await mk().then((c) => c.id), { primaryWeapon: 'core_weapon_longsword', secondaryWeapon: 'core_weapon_shortsword' }), 400, M);
	// swapping out the secondary in the same PATCH is fine
	const r = await patch(ch2.id, { primaryWeapon: 'core_weapon_longsword', secondaryWeapon: null });
	assert.equal(r.status, 200, r.text);
	const g = (await call('GET', `/api/characters/${ch2.id}`)).json;
	assert.equal(g.secondaryWeapon, null);
});

test('equipping armor sets armor max and thresholds; marked armor is capped; unequip keeps numbers', async () => {
	const ch = await mk(); // armor max 6, thresholds 5/10, level 1
	assert.equal((await call('POST', `/api/characters/${ch.id}/armor`, { delta: 5 })).status, 200);
	const g = (await call('GET', `/api/characters/${ch.id}`)).json;
	assert.deepEqual(g.armor, { marked: 5, max: 6 }, 'precondition: 5 marked of 6');
	let r = await patch(ch.id, { armorId: 'core_armor_gambeson_armor' });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(r.json.armor, { marked: 3, max: 3 });
	assert.deepEqual([r.json.majorThreshold, r.json.severeThreshold], [6, 12]);
	r = await patch(ch.id, { armorId: null });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.armorId, null);
	assert.deepEqual(r.json.armor, { marked: 3, max: 3 });
	assert.deepEqual([r.json.majorThreshold, r.json.severeThreshold], [6, 12]);
});

test('armor thresholds use the new level; explicit values win; validation still applies', async () => {
	const ch = await mk();
	let r = await patch(ch.id, { level: 3, armorId: 'core_armor_improved_gambeson_armor' }); // 7/16, score 4
	assert.equal(r.status, 200, r.text);
	assert.deepEqual([r.json.armor.max, r.json.majorThreshold, r.json.severeThreshold], [4, 10, 19]);
	r = await patch(ch.id, { armorId: 'core_armor_chainmail_armor' }); // 7/15 score 4 at level 3
	assert.deepEqual([r.json.armor.max, r.json.majorThreshold, r.json.severeThreshold], [4, 10, 18]);
	r = await patch(ch.id, { armorId: 'core_armor_full_plate_armor', majorThreshold: 9, severeThreshold: 20, armorSlots: 2 });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual([r.json.armor.max, r.json.majorThreshold, r.json.severeThreshold], [2, 9, 20]);
	r = await patch(ch.id, { armorId: 'core_armor_leather_armor', majorThreshold: 30 }); // severe auto = 13+3 = 16
	err(r, 400, 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100');
});
