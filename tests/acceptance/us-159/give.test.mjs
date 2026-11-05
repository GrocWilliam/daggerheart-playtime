import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
};
const ch = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
const setup = async () => {
	const c = (await call('POST', '/api/campaigns', { name: 'Camp' })).json;
	const other = (await call('POST', '/api/campaigns', { name: 'Other' })).json;
	const s = (await call('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Vault' })).json;
	const mine = (await call('POST', `/api/campaigns/${c.id}/characters`, ch)).json;
	const foreign = (await call('POST', `/api/campaigns/${other.id}/characters`, ch)).json;
	const loot = (await call('POST', `/api/campaigns/${c.id}/scenes/${s.id}/loot`, { table: 'items', rarity: 'common' })).json[0];
	const url = `/api/campaigns/${c.id}/scenes/${s.id}/loot`;
	return { c, s, mine, foreign, loot, url };
};
const given = async (c, s, id) =>
	(await call('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id).loot.find((e) => e.id === id).given;

test('give to a character of the campaign -> 200 with item srdId; entry given true', async () => {
	const { c, s, mine, loot, url } = await setup();
	const r = await call('POST', `${url}/${loot.id}/give`, { characterId: mine.id });
	assert.equal(r.status, 200, r.text);
	assert.ok(r.json.items.some((i) => i.srdId === loot.srdId));
	const get = await call('GET', `/api/characters/${mine.id}`);
	assert.deepEqual(r.json, get.json);
	assert.equal(await given(c, s, loot.id), true);
});

test('character of another campaign -> 400; unknown character -> 404', async () => {
	const { foreign, loot, url } = await setup();
	let r = await call('POST', `${url}/${loot.id}/give`, { characterId: foreign.id });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'character is not in this campaign' });
	r = await call('POST', `${url}/${loot.id}/give`, { characterId: 'does-not-exist-999' });
	assert.equal(r.status, 404);
});

test('unknown campaign, scene or loot -> 404', async () => {
	const { c, s, mine, loot, url } = await setup();
	const b = { characterId: mine.id };
	assert.equal((await call('POST', `${url}/999999/give`, b)).status, 404);
	assert.equal((await call('POST', `/api/campaigns/${c.id}/scenes/999999/loot/${loot.id}/give`, b)).status, 404);
	assert.equal((await call('POST', `/api/campaigns/999999/scenes/${s.id}/loot/${loot.id}/give`, b)).status, 404);
});

test('a failed give leaves given false', async () => {
	const { c, s, foreign, loot, url } = await setup();
	await call('POST', `${url}/${loot.id}/give`, { characterId: foreign.id });
	await call('POST', `${url}/${loot.id}/give`, { characterId: 'does-not-exist-999' });
	assert.equal(await given(c, s, loot.id), false);
	const f = await call('GET', `/api/characters/${foreign.id}`);
	assert.equal(f.json.items.length, 0);
});
