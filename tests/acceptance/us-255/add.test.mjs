// US-255: POST .../encounter/adversaries and PATCH keeping marks. Run by run.sh against `node build` (BASE_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE_URL;
const call = async (method, path, body, raw) => {
	const r = await fetch(BASE + path, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : {},
		body: body !== undefined ? (raw ? body : JSON.stringify(body)) : undefined
	});
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
};
const ACID = 'adv_acid_burrower';
const RAT = 'adv_giant_rat';

async function scene() {
	const c = await call('POST', '/api/campaigns', { name: 'Add' });
	assert.equal(c.status, 201, c.text);
	const s = await call('POST', `/api/campaigns/${c.json.id}/scenes`, { title: 'Fight' });
	assert.equal(s.status, 201, s.text);
	return { campaignId: c.json.id, sceneId: s.json.id, url: `/api/campaigns/${c.json.id}/scenes/${s.json.id}/encounter` };
}
async function withEnc(list) {
	const sc = await scene();
	const g = await call('POST', sc.url, { partySize: 4, tier: 1, seed: 1 });
	assert.equal(g.status, 200, g.text);
	const p = await call('PATCH', sc.url, { adversaries: list });
	assert.equal(p.status, 200, p.text);
	return sc;
}
const entry = (enc, id) => {
	assert.ok(enc && Array.isArray(enc.adversaries), JSON.stringify(enc));
	const e = enc.adversaries.find((a) => a.id === id);
	assert.ok(e, `no ${id} in ${JSON.stringify(enc)}`);
	return e;
};
const add = (sc, adversaryId, count) => call('POST', `${sc.url}/adversaries`, { adversaryId, count });
const damage = (sc, adversaryId, index, amount) => call('POST', `${sc.url}/damage`, { adversaryId, index, amount });
const hp = (sc, adversaryId, index, delta) => call('POST', `${sc.url}/hp`, { adversaryId, index, delta });

test('add: one giant rat to rat ×2 answers 201, count 3, spent equals PATCH with count 3, order unchanged', async () => {
	const sc = await withEnc([{ id: ACID, count: 1 }, { id: RAT, count: 2 }]);
	const r = await add(sc, RAT, 1);
	assert.equal(r.status, 201, r.text);
	assert.equal(entry(r.json, RAT).count, 3);
	assert.deepEqual(r.json.adversaries.map((a) => a.id), [ACID, RAT]);
	assert.equal('over' in r.json, false);
	const sc2 = await withEnc([{ id: ACID, count: 1 }, { id: RAT, count: 3 }]);
	const p = await call('PATCH', sc2.url, { adversaries: [{ id: ACID, count: 1 }, { id: RAT, count: 3 }] });
	assert.equal(p.status, 200, p.text);
	assert.equal(r.json.spent, p.json.spent);
	assert.equal(r.json.budget, p.json.budget);
});

test('add: single-entry encounter {rat ×2} + 1 rat matches PATCH rat ×3 spent', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	const r = await add(sc, RAT, 1);
	assert.equal(r.status, 201, r.text);
	const p = await call('PATCH', sc.url, { adversaries: [{ id: RAT, count: 3 }] });
	assert.equal(r.json.spent, p.json.spent);
	assert.equal(entry(r.json, RAT).count, 3);
});

test('add: marks are padded with zeros ([1,0] + 2 rats -> count 4, [1,0,0,0])', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	const d = await damage(sc, RAT, 0, 1);
	assert.equal(d.status, 200, d.text);
	assert.deepEqual(entry(d.json.encounter, RAT).hpMarked, [1, 0]);
	const r = await add(sc, RAT, 2);
	assert.equal(r.status, 201, r.text);
	assert.equal(entry(r.json, RAT).count, 4);
	assert.deepEqual(entry(r.json, RAT).hpMarked, [1, 0, 0, 0]);
	const g = await call('GET', `/api/campaigns/${sc.campaignId}/scenes`);
	const stored = g.json.find((x) => x.id === sc.sceneId).encounter;
	assert.deepEqual(entry(stored, RAT).hpMarked, [1, 0, 0, 0]);
});

test('add: a new adversary is appended last with name, count and no hpMarked; spent grows by its cost', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	const before = (await call('PATCH', sc.url, { adversaries: [{ id: RAT, count: 2 }] })).json;
	const r = await add(sc, ACID, 1);
	assert.equal(r.status, 201, r.text);
	const last = r.json.adversaries.at(-1);
	assert.equal(last.id, ACID);
	assert.equal(last.name, 'Acid Burrower');
	assert.equal(last.count, 1);
	assert.equal('hpMarked' in last, false);
	assert.equal(typeof last.cost, 'number');
	assert.equal(r.json.spent, before.spent + last.cost);
	assert.equal(r.json.adversaries[0].id, RAT);
});

test('add: a tier 3 adversary can be added to a tier 1 encounter', async () => {
	const file = JSON.parse(fs.readFileSync('src/lib/srd/adversaries.json', 'utf8').replace(/^\uFEFF/, '')).find((a) => Number(a.tier) === 3);
	const list = (await call('GET', '/api/srd/adversaries')).json;
	const t3 = list.find((a) => a.name === file.name);
	assert.ok(t3, 'no tier 3 adversary in the list');
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	const r = await add(sc, t3.id, 1);
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.adversaries.at(-1).id, t3.id);
	assert.equal(r.json.adversaries.at(-1).count, 1);
});

for (const count of [0, 21]) {
	test(`add errors: count ${count} answers 400`, async () => {
		const sc = await withEnc([{ id: RAT, count: 2 }]);
		const r = await add(sc, RAT, count);
		assert.equal(r.status, 400, r.text);
		assert.deepEqual(r.json, { error: 'count must be an integer from 1 to 20' });
	});
}

test('add: counts 1 and 20 are accepted', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	assert.equal((await add(sc, RAT, 20)).status, 201);
	const r = await add(sc, RAT, 1);
	assert.equal(entry(r.json, RAT).count, 23);
});

test('add errors: unknown adversary, non-string adversaryId, non-object body', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	const u = await add(sc, 'adv_nope', 1);
	assert.equal(u.status, 400, u.text);
	assert.deepEqual(u.json, { error: 'adversaries contains an unknown adversary: adv_nope' });
	const n = await call('POST', `${sc.url}/adversaries`, { adversaryId: 5, count: 1 });
	assert.equal(n.status, 400);
	assert.deepEqual(n.json, { error: 'adversaryId must be a string' });
	const o = await call('POST', `${sc.url}/adversaries`, '[1]', true);
	assert.equal(o.status, 400);
	assert.deepEqual(o.json, { error: 'body must be a JSON object' });
	const g = await call('GET', `/api/campaigns/${sc.campaignId}/scenes`);
	assert.equal(entry(g.json.find((x) => x.id === sc.sceneId).encounter, RAT).count, 2);
});

test('add errors: unknown scene 404 scene not found; scene without encounter 404 encounter not found', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	const a = await call('POST', `/api/campaigns/${sc.campaignId}/scenes/00000000-0000-0000-0000-000000000000/encounter/adversaries`, { adversaryId: RAT, count: 1 });
	assert.equal(a.status, 404, a.text);
	assert.deepEqual(a.json, { error: 'scene not found' });
	const empty = await scene();
	const b = await add(empty, RAT, 1);
	assert.equal(b.status, 404, b.text);
	assert.deepEqual(b.json, { error: 'encounter not found' });
});

test('PATCH keeps marks: burrower [3] -> [3,0], rats [1,1,0] -> [1,1]; over, budget, spent still present', async () => {
	const sc = await withEnc([{ id: ACID, count: 1 }, { id: RAT, count: 3 }]);
	assert.equal((await damage(sc, ACID, 0, 15)).status, 200);
	assert.equal((await damage(sc, RAT, 0, 1)).status, 200);
	assert.equal((await damage(sc, RAT, 1, 1)).status, 200);
	const m = await hp(sc, ACID, 0, -1);
	assert.equal(m.status, 200, m.text);
	assert.deepEqual(entry(m.json, ACID).hpMarked, [2]);
	// bring burrower marks to exactly [3]
	assert.equal((await hp(sc, ACID, 0, 1)).status, 200);
	const s = await call('GET', `/api/campaigns/${sc.campaignId}/scenes`);
	const cur = s.json.find((x) => x.id === sc.sceneId).encounter;
	assert.deepEqual(entry(cur, RAT).hpMarked, [1, 1, 0]);
	const burrowerMarks = entry(cur, ACID).hpMarked;
	assert.equal(burrowerMarks.length, 1);
	const p = await call('PATCH', sc.url, { adversaries: [{ id: ACID, count: 2 }, { id: RAT, count: 2 }] });
	assert.equal(p.status, 200, p.text);
	assert.deepEqual(entry(p.json, ACID).hpMarked, [burrowerMarks[0], 0]);
	assert.deepEqual(entry(p.json, RAT).hpMarked, [1, 1]);
	assert.equal(typeof p.json.over, 'boolean');
	assert.equal(typeof p.json.budget, 'number');
	assert.equal(typeof p.json.spent, 'number');
});

test('PATCH: an entry without marks stays without hpMarked, even if another has marks', async () => {
	const sc = await withEnc([{ id: ACID, count: 1 }, { id: RAT, count: 3 }]);
	assert.equal((await damage(sc, RAT, 0, 1)).status, 200);
	const p = await call('PATCH', sc.url, { adversaries: [{ id: ACID, count: 3 }, { id: RAT, count: 3 }] });
	assert.equal(p.status, 200, p.text);
	assert.equal('hpMarked' in entry(p.json, ACID), false);
	assert.deepEqual(entry(p.json, RAT).hpMarked, [1, 0, 0]);
});

test('PATCH on an encounter with no marks has no hpMarked keys', async () => {
	const sc = await withEnc([{ id: ACID, count: 1 }, { id: RAT, count: 3 }]);
	const p = await call('PATCH', sc.url, { adversaries: [{ id: ACID, count: 2 }, { id: RAT, count: 1 }] });
	assert.equal(p.status, 200, p.text);
	for (const a of p.json.adversaries) assert.equal('hpMarked' in a, false, p.text);
	assert.equal(typeof p.json.over, 'boolean');
});

test('generate after marks resets every hpMarked', async () => {
	const sc = await withEnc([{ id: ACID, count: 1 }, { id: RAT, count: 3 }]);
	assert.equal((await damage(sc, RAT, 0, 1)).status, 200);
	const g = await call('POST', sc.url, { partySize: 4, tier: 1, seed: 2 });
	assert.equal(g.status, 200, g.text);
	for (const a of g.json.adversaries) assert.equal('hpMarked' in a, false, g.text);
});

test('add then PATCH down keeps marks of surviving copies', async () => {
	const sc = await withEnc([{ id: RAT, count: 2 }]);
	await damage(sc, RAT, 1, 1);
	await add(sc, RAT, 1);
	const p = await call('PATCH', sc.url, { adversaries: [{ id: RAT, count: 2 }] });
	assert.deepEqual(entry(p.json, RAT).hpMarked, [0, 1]);
});

test('docs: CLAUDE.md encounters.ts row mentions the adversaries route', () => {
	const row = fs.readFileSync('CLAUDE.md', 'utf8').split('\n').find((l) => l.includes('`src/lib/server/features/encounters.ts`'));
	assert.ok(row && /adversaries/.test(row), 'row must mention adversaries');
});

test('unit tests file checks battleAddSchema and its messages', () => {
	const src = fs.readFileSync('src/lib/server/features/encounters.test.ts', 'utf8');
	for (const s of ['battleAddSchema', 'count must be an integer from 1 to 20', 'adversaryId must be a string'])
		assert.ok(src.includes(s), `encounters.test.ts lacks ${s}`);
});
