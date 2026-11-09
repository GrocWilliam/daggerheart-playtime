// US-254: per-copy marked HP through POST .../encounter/damage and POST .../encounter/hp.
// Run by run.sh against `node build` (BASE_URL), in-memory PGlite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

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

const ACID = 'adv_acid_burrower'; // hp 8, thresholds 8/15
const OOZE = 'adv_tiny_green_ooze'; // hp 2, thresholds 4/None
const RAT = 'adv_giant_rat'; // Minion, hp 1, thresholds None
const OBJECT_ERROR = 'body must be a JSON object';
const INDEX_ERROR = 'index must be a copy of that adversary';

async function scene() {
	const c = await call('POST', '/api/campaigns', { name: 'Battle' });
	assert.equal(c.status, 201, c.text);
	const s = await call('POST', `/api/campaigns/${c.json.id}/scenes`, { title: 'Fight' });
	assert.equal(s.status, 201, s.text);
	const url = `/api/campaigns/${c.json.id}/scenes/${s.json.id}/encounter`;
	return { campaignId: c.json.id, sceneId: s.json.id, url };
}

/** A fresh scene whose encounter is acid burrower ×1, giant rat ×3, tiny green ooze ×1. */
async function setup() {
	const sc = await scene();
	const g = await call('POST', sc.url, { partySize: 4, tier: 1, seed: 1 });
	assert.equal(g.status, 200, g.text);
	const p = await call('PATCH', sc.url, {
		adversaries: [{ id: ACID, count: 1 }, { id: RAT, count: 3 }, { id: OOZE, count: 1 }]
	});
	assert.equal(p.status, 200, p.text);
	return sc;
}

const entry = (enc, id) => {
	assert.ok(enc && Array.isArray(enc.adversaries), `no encounter adversaries in ${JSON.stringify(enc)}`);
	const e = enc.adversaries.find((a) => a.id === id);
	assert.ok(e, `no ${id} in ${JSON.stringify(enc)}`);
	return e;
};
const damage = (sc, adversaryId, index, amount) => call('POST', `${sc.url}/damage`, { adversaryId, index, amount });
const hp = (sc, adversaryId, index, delta) => call('POST', `${sc.url}/hp`, { adversaryId, index, delta });
const stored = async (sc) => {
	const r = await call('GET', `/api/campaigns/${sc.campaignId}/scenes`);
	assert.equal(r.status, 200, r.text);
	return r.json.find((x) => x.id === sc.sceneId).encounter;
};

function assertHit(r, hpHit, id, marks) {
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.hpHit, hpHit, r.text);
	if (marks) assert.deepEqual(entry(r.json.encounter, id).hpMarked, marks, r.text);
}

// --- damage ---

test('damage: amount 7 on acid burrower index 0 answers 200, hpHit 1, hpMarked [1]', async () => {
	const sc = await setup();
	assertHit(await damage(sc, ACID, 0, 7), 1, ACID, [1]);
});

for (const [amount, hit] of [[8, 2], [14, 2], [15, 3]]) {
	test(`damage: amount ${amount} on acid burrower gives hpHit ${hit}`, async () => {
		const sc = await setup();
		assertHit(await damage(sc, ACID, 0, amount), hit, ACID, [hit]);
	});
}

test('damage is capped at the maximum: 15 three times gives 3, 3, 2 then [8]; a fourth gives hpHit 0', async () => {
	const sc = await setup();
	assertHit(await damage(sc, ACID, 0, 15), 3, ACID, [3]);
	assertHit(await damage(sc, ACID, 0, 15), 3, ACID, [6]);
	assertHit(await damage(sc, ACID, 0, 15), 2, ACID, [8]);
	assertHit(await damage(sc, ACID, 0, 15), 0, ACID, [8]);
	assert.deepEqual(entry(await stored(sc), ACID).hpMarked, [8]);
});

test('minions: amount 1 on giant rat index 1 gives hpHit 1 and hpMarked [0,1,0]', async () => {
	const sc = await setup();
	assertHit(await damage(sc, RAT, 1, 1), 1, RAT, [0, 1, 0]);
});

test('4/None: amount 3 on tiny green ooze gives hpHit 1; on a fresh encounter amount 4 gives hpHit 2', async () => {
	assertHit(await damage(await setup(), OOZE, 0, 3), 1, OOZE, [1]);
	assertHit(await damage(await setup(), OOZE, 0, 4), 2, OOZE, [2]);
});

test('marks persist: GET of the scene shows the rat at [0,1,0]; untouched entries have no hpMarked key', async () => {
	const sc = await setup();
	assertHit(await damage(sc, RAT, 1, 1), 1, RAT, [0, 1, 0]);
	const enc = await stored(sc);
	assert.deepEqual(entry(enc, RAT).hpMarked, [0, 1, 0]);
	assert.ok(!('hpMarked' in entry(enc, ACID)), JSON.stringify(enc));
	assert.ok(!('hpMarked' in entry(enc, OOZE)), JSON.stringify(enc));
});

// --- hp ---

test('hp: delta 1 on tiny green ooze gives [1], [2], then still [2] at the limit; delta -1 gives [1], [0], [0]', async () => {
	const sc = await setup();
	for (const [delta, marks] of [[1, [1]], [1, [2]], [1, [2]], [-1, [1]], [-1, [0]], [-1, [0]]]) {
		const r = await hp(sc, OOZE, 0, delta);
		assert.equal(r.status, 200, `delta ${delta}: ${r.text}`);
		assert.deepEqual(entry(r.json, OOZE).hpMarked, marks, `delta ${delta}: ${r.text}`);
	}
	assert.deepEqual(entry(await stored(sc), OOZE).hpMarked, [0]);
});

// --- errors ---

const ENDPOINTS = [
	['damage', (adversaryId, index) => ({ adversaryId, index, amount: 5 })],
	['hp', (adversaryId, index) => ({ adversaryId, index, delta: 1 })]
];

for (const [name, body] of ENDPOINTS) {
	test(`errors on /${name}: unknown scene answers 404 {"error":"scene not found"}`, async () => {
		const sc = await setup();
		const r = await call('POST', `/api/campaigns/${sc.campaignId}/scenes/${randomUUID()}/encounter/${name}`, body(ACID, 0));
		assert.equal(r.status, 404, r.text);
		assert.deepEqual(r.json, { error: 'scene not found' });
	});

	test(`errors on /${name}: a scene of another campaign answers 404 {"error":"scene not found"}`, async () => {
		const sc = await setup();
		const other = await scene();
		const r = await call('POST', `/api/campaigns/${other.campaignId}/scenes/${sc.sceneId}/encounter/${name}`, body(ACID, 0));
		assert.equal(r.status, 404, r.text);
		assert.deepEqual(r.json, { error: 'scene not found' });
	});

	test(`errors on /${name}: a scene with no encounter answers 404 {"error":"encounter not found"}`, async () => {
		const sc = await scene();
		const r = await call('POST', `${sc.url}/${name}`, body(ACID, 0));
		assert.equal(r.status, 404, r.text);
		assert.deepEqual(r.json, { error: 'encounter not found' });
	});

	test(`errors on /${name}: adversaryId adv_nope answers 400 unknown adversary`, async () => {
		const sc = await setup();
		const r = await call('POST', `${sc.url}/${name}`, body('adv_nope', 0));
		assert.equal(r.status, 400, r.text);
		assert.deepEqual(r.json, { error: 'adversaries contains an unknown adversary: adv_nope' });
	});

	for (const [label, id, index] of [
		['an SRD adversary not in the encounter', 'adv_bear', 0],
		['index 3 on the 3 giant rats', RAT, 3],
		['index -1', ACID, -1]
	]) {
		test(`errors on /${name}: ${label} answers 400 "${INDEX_ERROR}"`, async () => {
			const sc = await setup();
			const r = await call('POST', `${sc.url}/${name}`, body(id, index));
			assert.equal(r.status, 400, r.text);
			assert.deepEqual(r.json, { error: INDEX_ERROR });
			const enc = await stored(sc);
			for (const a of enc.adversaries) assert.ok(!('hpMarked' in a), `nothing marked: ${JSON.stringify(enc)}`);
		});
	}

	test(`errors on /${name}: a JSON array body answers 400 "${OBJECT_ERROR}"`, async () => {
		const sc = await setup();
		const r = await call('POST', `${sc.url}/${name}`, '[]', true);
		assert.equal(r.status, 400, r.text);
		assert.deepEqual(r.json, { error: OBJECT_ERROR });
	});

	test(`errors on /${name}: a bad body answers 400 even on an unknown scene`, async () => {
		const sc = await setup();
		const r = await call('POST', `/api/campaigns/${sc.campaignId}/scenes/${randomUUID()}/encounter/${name}`, '[]', true);
		assert.equal(r.status, 400, r.text);
		assert.deepEqual(r.json, { error: OBJECT_ERROR });
	});
}

for (const amount of [0, 1000]) {
	test(`errors on /damage: amount ${amount} answers 400 "amount must be an integer from 1 to 999"`, async () => {
		const sc = await setup();
		const r = await damage(sc, ACID, 0, amount);
		assert.equal(r.status, 400, r.text);
		assert.deepEqual(r.json, { error: 'amount must be an integer from 1 to 999' });
	});
}

test('errors on /hp: delta 2 answers 400 "delta must be 1 or -1"', async () => {
	const sc = await setup();
	const r = await hp(sc, OOZE, 0, 2);
	assert.equal(r.status, 400, r.text);
	assert.deepEqual(r.json, { error: 'delta must be 1 or -1' });
});

// --- generation ---

test('a freshly generated encounter has no hpMarked key in any entry and keeps its fields', async () => {
	const sc = await scene();
	const g = await call('POST', sc.url, { partySize: 4, tier: 1, seed: 7 });
	assert.equal(g.status, 200, g.text);
	assert.ok(g.json.adversaries.length > 0, g.text);
	for (const a of g.json.adversaries) {
		assert.ok(!('hpMarked' in a), g.text);
		assert.equal(typeof a.id, 'string');
		assert.equal(typeof a.name, 'string');
		assert.equal(typeof a.role, 'string');
		assert.ok(Number.isInteger(a.count) && a.count > 0, g.text);
		assert.ok(Number.isInteger(a.cost), g.text);
	}
	for (const k of ['partySize', 'tier', 'adjustments', 'budget', 'spent']) assert.ok(k in g.json, `${k} missing: ${g.text}`);
	assert.deepEqual(await stored(sc), g.json);
});

test('regenerating after damage resets the marks (no hpMarked key)', async () => {
	const sc = await setup();
	assertHit(await damage(sc, ACID, 0, 7), 1, ACID, [1]);
	const g = await call('POST', sc.url, { partySize: 4, tier: 1, seed: 1 });
	assert.equal(g.status, 200, g.text);
	for (const a of g.json.adversaries) assert.ok(!('hpMarked' in a), g.text);
});
