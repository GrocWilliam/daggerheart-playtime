import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
};

// SRD adversaries by id (same id rule as the app: adv_ + lowercase slug).
const raw = JSON.parse(readFileSync('src/lib/srd/adversaries.json', 'utf8').replace(/^﻿/, ''));
const SRD = new Map(raw.map((r) => [
	'adv_' + String(r.name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
	{ tier: Number(r.tier), role: String(r.type).replace(/\s*\(.*$/, '').trim() }
]));
const COSTS = { Social: 1, Support: 1, Horde: 2, Ranged: 2, Skulk: 2, Standard: 2, Leader: 3, Bruiser: 4, Solo: 5 };
const DELTA = { easier: -1, damageBoost: -2, harder: 2 };
const BIG = ['Bruiser', 'Horde', 'Leader', 'Solo'];

const setup = async () => {
	const c = (await call('POST', '/api/campaigns', { name: 'Camp' })).json;
	const s = (await call('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Ambush' })).json;
	return { c, s, url: `/api/campaigns/${c.id}/scenes/${s.id}/encounter` };
};
const stored = async (c, s) => (await call('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id).encounter;
const costOf = (role, count, p) => (role === 'Minion' ? Math.ceil(count / p) : COSTS[role] * count);

function check(enc, p, tier, adj, label) {
	const m = `${label}: ${JSON.stringify(enc)}`;
	assert.equal(enc.partySize, p, m);
	assert.equal(enc.tier, tier, m);
	assert.deepEqual([...enc.adjustments].sort(), [...adj].sort(), m);
	assert.ok(enc.spent <= enc.budget, m);
	assert.ok(enc.budget - enc.spent <= 1, m);
	let total = 0;
	let solos = 0;
	for (const a of enc.adversaries) {
		const info = SRD.get(a.id);
		assert.ok(info, `unknown id ${m}`);
		assert.equal(info.tier, tier, m);
		assert.equal(a.role, info.role, m);
		assert.ok(Number.isInteger(a.count) && a.count > 0, m);
		if (info.role === 'Minion') assert.equal(a.count % p, 0, `minion groups ${m}`);
		assert.equal(a.cost, costOf(info.role, a.count, p), m);
		total += a.cost;
		if (info.role === 'Solo') solos += a.count;
	}
	assert.equal(total, enc.spent, m);
	if (solos > 1) assert.ok(enc.automatic.includes('twoSolos'), `two solos need -2: ${m}`);
	if (enc.budget >= 4) assert.ok(new Set(enc.adversaries.map((a) => a.id)).size >= 2, m);
	const roles = enc.adversaries.map((a) => a.role);
	let budget = 3 * p + 2 + [...new Set(adj)].reduce((n, a) => n + DELTA[a], 0);
	if (solos > 1) budget -= 2;
	if (!roles.some((r) => BIG.includes(r))) budget += 1;
	assert.equal(enc.budget, budget, `budget ${m}`);
}

test('invariants for every party size, tier, adjustment combination and seeds 1-20', { timeout: 600000 }, async () => {
	const { c, s, url } = await setup();
	const names = ['easier', 'damageBoost', 'harder'];
	const combos = [];
	for (let mask = 0; mask < 8; mask++) combos.push(names.filter((_, i) => mask & (1 << i)));
	for (let p = 1; p <= 8; p++)
		for (let tier = 1; tier <= 4; tier++)
			for (const adj of combos)
				for (let seed = 1; seed <= 20; seed++) {
					const r = await call('POST', url, { partySize: p, tier, adjustments: adj, seed });
					const label = `p=${p} t=${tier} adj=${adj} seed=${seed}`;
					assert.equal(r.status, 200, `${label} ${r.text}`);
					check(r.json, p, tier, adj, label);
				}
	assert.ok(await stored(c, s));
});

test('same seed twice gives the same adversaries; GET scenes shows the stored encounter', async () => {
	const { c, s, url } = await setup();
	const body = { partySize: 4, tier: 2, adjustments: ['harder'], seed: 42 };
	const a = await call('POST', url, body);
	const b = await call('POST', url, body);
	assert.equal(a.status, 200, a.text);
	assert.deepEqual(a.json.adversaries, b.json.adversaries);
	assert.deepEqual(await stored(c, s), b.json);
	// no seed: still valid, replaces the previous encounter
	const r = await call('POST', url, { partySize: 3, tier: 1 });
	assert.equal(r.status, 200, r.text);
	check(r.json, 3, 1, [], 'noseed');
	assert.deepEqual(await stored(c, s), r.json);
});

test('defaults come from the campaign characters', async () => {
	const { c, s, url } = await setup();
	const ch = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
	await call('POST', `/api/campaigns/${c.id}/characters`, { ...ch, level: 5 });
	await call('POST', `/api/campaigns/${c.id}/characters`, { ...ch, name: 'Ash', level: 2 });
	const r = await call('POST', url, { seed: 1 });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.partySize, 2);
	assert.equal(r.json.tier, 3);
	assert.deepEqual(r.json.adjustments, []);
	check(r.json, 2, 3, [], 'defaults');
});

test('a scene without encounter has encounter null', async () => {
	const { c, s } = await setup();
	assert.equal(await stored(c, s), null);
});

test('PATCH replaces the list, recomputes budget and spent, flags over', async () => {
	const { c, s, url } = await setup();
	const gen = await call('POST', url, { partySize: 4, tier: 1, seed: 3 });
	const tier1 = [...SRD].filter(([, v]) => v.tier === 1);
	const solo = tier1.find(([, v]) => v.role === 'Solo')[0];
	const std = tier1.find(([, v]) => v.role === 'Standard')[0];
	let r = await call('PATCH', url, { adversaries: [{ id: std, count: 1 }] });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.over, false);
	assert.equal(r.json.spent, 2);
	assert.equal(r.json.partySize, gen.json.partySize);
	assert.deepEqual(r.json.adversaries.map((a) => [a.id, a.count, a.cost]), [[std, 1, 2]]);
	assert.equal((await stored(c, s)).adversaries.length, 1);
	r = await call('PATCH', url, { adversaries: [{ id: solo, count: 4 }] });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.spent, 20);
	assert.ok(r.json.spent > r.json.budget);
	assert.equal(r.json.over, true);
	r = await call('PATCH', url, { adversaries: [{ id: std, count: 1 }, { id: solo, count: 1 }] });
	assert.equal(r.json.spent, 7);
	assert.equal(r.json.over, r.json.spent > r.json.budget);
});

test('PATCH unknown adversary id -> 400 with the exact message', async () => {
	const { url } = await setup();
	await call('POST', url, { partySize: 4, tier: 1, seed: 3 });
	const r = await call('PATCH', url, { adversaries: [{ id: 'adv_nope', count: 1 }] });
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'adversaries contains an unknown adversary: adv_nope' });
});

test('DELETE sets the encounter to null (204)', async () => {
	const { c, s, url } = await setup();
	await call('POST', url, { partySize: 4, tier: 1, seed: 3 });
	assert.ok(await stored(c, s));
	const r = await call('DELETE', url);
	assert.equal(r.status, 204);
	assert.equal(await stored(c, s), null);
});

test('unknown campaign or scene -> 404', async () => {
	const { c, url } = await setup();
	for (const m of ['POST', 'PATCH', 'DELETE']) {
		const body = m === 'POST' ? {} : m === 'PATCH' ? { adversaries: [] } : undefined;
		let r = await call(m, `/api/campaigns/${c.id}/scenes/999999/encounter`, body);
		assert.equal(r.status, 404, `${m} scene`);
		r = await call(m, url.replace(c.id, '999999'), body);
		assert.equal(r.status, 404, `${m} campaign`);
	}
});

test('invalid partySize, tier or adjustment -> 400 naming the field', async () => {
	const { url } = await setup();
	for (const [body, field] of [
		[{ partySize: 0 }, 'partySize'], [{ partySize: 9 }, 'partySize'],
		[{ tier: 0 }, 'tier'], [{ tier: 5 }, 'tier'],
		[{ adjustments: ['bogus'] }, 'adjustments']
	]) {
		const r = await call('POST', url, body);
		assert.equal(r.status, 400, JSON.stringify(body));
		assert.ok(r.json.error.includes(field), r.text);
	}
});
