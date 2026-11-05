import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
};
const setup = async () => {
	const c = (await call('POST', '/api/campaigns', { name: 'Camp' })).json;
	const s = (await call('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Vault' })).json;
	return { c, s, url: `/api/campaigns/${c.id}/scenes/${s.id}/loot` };
};
const srd = {
	items: JSON.parse(fs.readFileSync('src/lib/srd/core/items.json', 'utf8')),
	consumables: JSON.parse(fs.readFileSync('src/lib/srd/core/consumables.json', 'utf8'))
};
const RANGE = { common: [1, 12], uncommon: [2, 24], rare: [3, 36], legendary: [4, 48] };

test('rolls stay in the rarity range and match the table entry number roll', async () => {
	const { url } = await setup();
	for (const table of ['items', 'consumables']) {
		for (const [rarity, [lo, hi]] of Object.entries(RANGE)) {
			const r = await call('POST', url, { table, rarity, count: 10 });
			assert.equal(r.status, 201);
			assert.equal(r.json.length, 10);
			for (const e of r.json) {
				assert.ok(Number.isInteger(e.roll) && e.roll >= lo && e.roll <= hi, `${rarity} roll ${e.roll}`);
				assert.equal(e.table, table);
				assert.equal(e.rarity, rarity);
				assert.equal(e.given, false);
				assert.ok(e.id !== undefined);
				const entry = srd[table][e.roll - 1];
				assert.equal(e.srdId, entry.id);
				assert.equal(e.name, entry.name['en-US']);
			}
		}
	}
});

test('count defaults to 1 and count 3 appends 3 entries', async () => {
	const { url } = await setup();
	const one = await call('POST', url, { table: 'items', rarity: 'common' });
	assert.equal(one.status, 201);
	assert.equal(one.json.length, 1);
	const three = await call('POST', url, { table: 'items', rarity: 'rare', count: 3 });
	assert.equal(three.status, 201);
	assert.equal(three.json.length, 3);
	assert.equal(new Set(three.json.map((e) => e.id)).size, 3);
});

test('invalid count, table or rarity -> 400 naming the field', async () => {
	const { url } = await setup();
	const ok = { table: 'items', rarity: 'common' };
	for (const count of [0, 11, 1.5, 'x']) {
		const r = await call('POST', url, { ...ok, count });
		assert.equal(r.status, 400);
		assert.deepEqual(r.json, { error: 'count must be an integer from 1 to 10' });
	}
	let r = await call('POST', url, { ...ok, table: 'weapons' });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'table must be items or consumables' });
	r = await call('POST', url, { ...ok, rarity: 'epic' });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'rarity must be common, uncommon, rare or legendary' });
});

test('same seed gives same rolls', async () => {
	const { url } = await setup();
	const body = { table: 'consumables', rarity: 'legendary', count: 8, seed: 12345 };
	const a = await call('POST', url, body);
	const b = await call('POST', url, body);
	assert.equal(a.status, 201);
	assert.deepEqual(a.json.map((e) => e.roll), b.json.map((e) => e.roll));
	assert.deepEqual(a.json.map((e) => e.srdId), b.json.map((e) => e.srdId));
});

test('PATCH given persists and DELETE removes; scene JSON lists loot', async () => {
	const { c, s, url } = await setup();
	const made = (await call('POST', url, { table: 'items', rarity: 'uncommon', count: 2 })).json;
	let scene = (await call('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id);
	assert.deepEqual(scene.loot.map((e) => e.id), made.map((e) => e.id));
	assert.deepEqual(scene.loot[0], made[0]);

	const p = await call('PATCH', `${url}/${made[0].id}`, { given: true });
	assert.equal(p.status, 200);
	assert.equal(p.json.given, true);
	scene = (await call('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id);
	assert.equal(scene.loot.find((e) => e.id === made[0].id).given, true);
	assert.equal(scene.loot.find((e) => e.id === made[1].id).given, false);
	const p2 = await call('PATCH', `${url}/${made[0].id}`, { given: false });
	assert.equal(p2.json.given, false);

	const d = await call('DELETE', `${url}/${made[0].id}`);
	assert.equal(d.status, 204);
	scene = (await call('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id);
	assert.deepEqual(scene.loot.map((e) => e.id), [made[1].id]);
});

test('unknown campaign, scene or loot id -> 404', async () => {
	const { c, s, url } = await setup();
	const made = (await call('POST', url, { table: 'items', rarity: 'common' })).json[0];
	const body = { table: 'items', rarity: 'common' };
	assert.equal((await call('POST', `/api/campaigns/${c.id}/scenes/999999/loot`, body)).status, 404);
	assert.equal((await call('POST', `/api/campaigns/999999/scenes/${s.id}/loot`, body)).status, 404);
	assert.equal((await call('PATCH', `${url}/999999`, { given: true })).status, 404);
	assert.equal((await call('DELETE', `${url}/999999`)).status, 404);
	assert.equal((await call('PATCH', `/api/campaigns/${c.id}/scenes/999999/loot/${made.id}`, { given: true })).status, 404);
	assert.equal((await call('DELETE', `/api/campaigns/${c.id}/scenes/999999/loot/${made.id}`)).status, 404);
});
