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
	try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
	return { status: res.status, text, json };
}
const campaign = async (name = 'C') => {
	const r = await call('POST', '/api/campaigns', { name });
	assert.equal(r.status, 201, r.text);
	return r.json;
};
const valid = {
	name: 'Rook', class: 'Guardian', evasion: 10,
	majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3
};
const mk = async (cid, over = {}) => call('POST', `/api/campaigns/${cid}/characters`, { ...valid, ...over });
const SHAPE = ['id','campaignId','name','class','level','evasion','majorThreshold','severeThreshold','hp','stress','hope','armor','conditions','notes','gold','items','down','subclass','ancestry','community','cards','traits','domains','experiences','primaryWeapon','secondaryWeapon','armorId'];

function checkDefault(c, cid) {
	assert.deepEqual(Object.keys(c).sort(), [...SHAPE].sort());
	assert.ok(c.id);
	assert.equal(c.campaignId, cid);
	assert.equal(c.name, 'Rook');
	assert.equal(c.class, 'Guardian');
	assert.equal(c.level, 1);
	assert.equal(c.evasion, 10);
	assert.equal(c.majorThreshold, 5);
	assert.equal(c.severeThreshold, 10);
	assert.deepEqual(c.hp, { marked: 0, max: 6 });
	assert.deepEqual(c.stress, { marked: 0, max: 6 });
	assert.equal(c.hope, 2);
	assert.deepEqual(c.armor, { marked: 0, max: 3 });
	assert.deepEqual(c.conditions, { vulnerable: false, restrained: false, hidden: false });
	assert.equal(c.notes, '');
	assert.deepEqual(c.gold, { handfuls: 0, bags: 0, chests: 0 });
	assert.deepEqual(c.items, []);
	assert.equal(c.subclass, null); assert.equal(c.ancestry, null); assert.equal(c.community, null); assert.deepEqual(c.cards, []);
	assert.equal(c.down, false);
}

test('POST creates a character with defaults -> 201 full object', async () => {
	const camp = await campaign();
	const r = await mk(camp.id);
	assert.equal(r.status, 201, r.text);
	checkDefault(r.json, camp.id);
});

test('POST invalid thresholds / maxHp -> 400 with error', async () => {
	const camp = await campaign();
	for (const over of [
		{ majorThreshold: 10, severeThreshold: 5 },
		{ severeThreshold: 101 },
		{ maxHp: 0 },
		{ maxHp: 13 }
	]) {
		const r = await mk(camp.id, over);
		assert.equal(r.status, 400, JSON.stringify(over));
		assert.equal(typeof r.json?.error, 'string');
	}
	const g = await call('GET', `/api/campaigns/${camp.id}`);
	assert.deepEqual(g.json.characters, []);
});

test('POST under an unknown campaign id -> 404', async () => {
	const r = await mk(randomUUID());
	assert.equal(r.status, 404);
});

test('GET /api/characters/:id -> 200 exact shape; unknown id -> 404', async () => {
	const camp = await campaign();
	const c = (await mk(camp.id)).json;
	const r = await call('GET', `/api/characters/${c.id}`);
	assert.equal(r.status, 200);
	checkDefault(r.json, camp.id);
	assert.deepEqual(r.json, c);
	const u = await call('GET', `/api/characters/${randomUUID()}`);
	assert.equal(u.status, 404);
});

test('PATCH updates a subset, returns full character; unknown id -> 404', async () => {
	const camp = await campaign();
	const c = (await mk(camp.id)).json;
	const r = await call('PATCH', `/api/characters/${c.id}`, { name: '  Rook II ', level: 3, notes: 'hi', armorSlots: 1, maxStress: 4 });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.name, 'Rook II');
	assert.equal(r.json.level, 3);
	assert.equal(r.json.notes, 'hi');
	assert.deepEqual(r.json.armor, { marked: 0, max: 1 });
	assert.deepEqual(r.json.stress, { marked: 0, max: 4 });
	assert.equal(r.json.class, 'Guardian');
	assert.deepEqual(Object.keys(r.json).sort(), [...SHAPE].sort());
	const u = await call('PATCH', `/api/characters/${randomUUID()}`, { name: 'x' });
	assert.equal(u.status, 404);
});

test('PATCH majorThreshold 20 with severeThreshold 10 -> 400, nothing changed', async () => {
	const camp = await campaign();
	const c = (await mk(camp.id)).json;
	const r = await call('PATCH', `/api/characters/${c.id}`, { majorThreshold: 20 });
	assert.equal(r.status, 400);
	assert.equal(typeof r.json?.error, 'string');
	const r2 = await call('PATCH', `/api/characters/${c.id}`, { name: 'Changed', maxHp: 0 });
	assert.equal(r2.status, 400);
	const g = await call('GET', `/api/characters/${c.id}`);
	assert.deepEqual(g.json, c);
});

test('DELETE -> 204, then GET 404 and campaign no longer lists it', async () => {
	const camp = await campaign();
	const c = (await mk(camp.id)).json;
	const d = await call('DELETE', `/api/characters/${c.id}`);
	assert.equal(d.status, 204);
	assert.equal(d.text, '');
	assert.equal((await call('GET', `/api/characters/${c.id}`)).status, 404);
	const g = await call('GET', `/api/campaigns/${camp.id}`);
	assert.deepEqual(g.json.characters, []);
	assert.equal((await call('DELETE', `/api/characters/${c.id}`)).status, 404);
});

test('campaign GET and PATCH list characters oldest-created first [X, Y]', async () => {
	const camp = await campaign();
	const x = (await mk(camp.id, { name: 'X' })).json;
	const y = (await mk(camp.id, { name: 'Y' })).json;
	const g = await call('GET', `/api/campaigns/${camp.id}`);
	assert.equal(g.status, 200);
	assert.deepEqual(g.json.characters, [x, y]);
	const p = await call('PATCH', `/api/campaigns/${camp.id}`, { name: 'Renamed' });
	assert.equal(p.status, 200);
	assert.deepEqual(p.json.characters, [x, y]);
});
