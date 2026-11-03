import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL;
const ROOT = process.env.ROOT;

async function call(method, url, body, raw) {
	const res = await fetch(BASE + url, {
		method,
		headers: { 'content-type': 'application/json' },
		body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	let json;
	try { json = JSON.parse(text); } catch { json = undefined; }
	return { status: res.status, json };
}

async function expectErr(method, url, body, status, message) {
	const r = await call(method, url, body);
	assert.equal(r.status, status, `${method} ${url} ${JSON.stringify(body)} -> ${r.status}`);
	assert.deepEqual(r.json, { error: message }, `${method} ${url} ${JSON.stringify(body)}`);
}

const CHAR = { name: 'Ayla', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };

async function setup() {
	const camp = (await call('POST', '/api/campaigns', { name: 'C' })).json;
	const ch = (await call('POST', `/api/campaigns/${camp.id}/characters`, CHAR)).json;
	return { camp, ch };
}

test('package.json lists zod ^4 in dependencies', () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	assert.match(pkg.dependencies?.zod ?? '', /^\^4(\.|$)/);
});

test('no hand-written parse* function remains in src', () => {
	const re = /parse(Name|Create|Patch|Delta|Damage|Gold|Conditions|ItemCreate|ItemQuantity|CardId)/;
	const hits = [];
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (/\.(ts|js|svelte|mjs)$/.test(e.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
		}
	})(path.join(ROOT, 'src'));
	assert.deepEqual(hits, []);
});

test('invalid JSON still returns 400 malformed JSON on every body endpoint', async () => {
	const { camp, ch } = await setup();
	const targets = [
		['POST', '/api/campaigns'],
		['PATCH', `/api/campaigns/${camp.id}`],
		['POST', `/api/campaigns/${camp.id}/characters`],
		['POST', `/api/campaigns/${camp.id}/fear`],
		['PATCH', `/api/characters/${ch.id}`],
		['POST', `/api/characters/${ch.id}/hp`],
		['POST', `/api/characters/${ch.id}/damage`],
		['POST', `/api/characters/${ch.id}/gold`],
		['PUT', `/api/characters/${ch.id}/conditions`],
		['POST', `/api/characters/${ch.id}/cards`],
		['POST', `/api/characters/${ch.id}/items`],
		['PATCH', `/api/items/someid`]
	];
	for (const [m, u] of targets) {
		const r = await call(m, u, undefined, '{not json');
		assert.equal(r.status, 400, `${m} ${u}`);
		assert.deepEqual(r.json, { error: 'malformed JSON' }, `${m} ${u}`);
	}
});

test('campaign name: valid, boundaries 100/101, rejections keep their messages', async () => {
	for (const url of ['/api/campaigns']) {
		assert.equal((await call('POST', url, { name: '  Trimmed  ' })).json.name, 'Trimmed');
		assert.equal((await call('POST', url, { name: 'x'.repeat(100) })).status, 201);
		await expectErr('POST', url, { name: 'x'.repeat(101) }, 400, 'name must be 1 to 100 characters');
		await expectErr('POST', url, { name: '   ' }, 400, 'name must be 1 to 100 characters');
		await expectErr('POST', url, { name: 5 }, 400, 'name must be a string');
		await expectErr('POST', url, {}, 400, 'name must be a string');
		await expectErr('POST', url, null, 400, 'name must be a string');
	}
	const { camp } = await setup();
	const u = `/api/campaigns/${camp.id}`;
	assert.equal((await call('PATCH', u, { name: 'y'.repeat(100) })).status, 200);
	await expectErr('PATCH', u, { name: 'y'.repeat(101) }, 400, 'name must be 1 to 100 characters');
	await expectErr('PATCH', u, { name: 1 }, 400, 'name must be a string');
});

test('fear: delta validation and clamping at 0 and 12', async () => {
	const { camp } = await setup();
	const u = `/api/campaigns/${camp.id}/fear`;
	assert.deepEqual((await call('POST', u, { delta: 12 })).json, { fear: 12 });
	assert.deepEqual((await call('POST', u, { delta: 1 })).json, { fear: 12 });
	assert.deepEqual((await call('POST', u, { delta: -100 })).json, { fear: 0 });
	for (const b of [{ delta: 1.5 }, { delta: '1' }, {}, null, { delta: 1e300 }])
		await expectErr('POST', u, b, 400, 'delta must be an integer');
	await expectErr('POST', '/api/campaigns/nope/fear', { delta: 1 }, 404, 'campaign not found');
});

test('create character: valid, defaults, boundaries and each rejection message', async () => {
	const { camp } = await setup();
	const u = `/api/campaigns/${camp.id}/characters`;
	const ok = await call('POST', u, { name: ' Bo ', class: ' Bard ', evasion: 0, majorThreshold: 1, severeThreshold: 2, maxHp: 1, armorSlots: 0 });
	assert.equal(ok.status, 201);
	assert.equal(ok.json.name, 'Bo');
	assert.equal(ok.json.class, 'Bard');
	assert.equal(ok.json.level, 1);
	assert.equal(ok.json.stress.max, 6);
	const max = await call('POST', u, { ...CHAR, name: 'n'.repeat(100), class: 'c'.repeat(50), level: 10, evasion: 30, majorThreshold: 99, severeThreshold: 100, maxHp: 12, maxStress: 12, armorSlots: 12 });
	assert.equal(max.status, 201);
	const bad = (over, msg) => expectErr('POST', u, { ...CHAR, ...over }, 400, msg);
	await bad({ name: 'n'.repeat(101) }, 'name must be 1 to 100 characters');
	await bad({ name: '' }, 'name must be 1 to 100 characters');
	await bad({ name: 3 }, 'name must be a string');
	await bad({ class: 'c'.repeat(51) }, 'class must be 1 to 50 characters');
	await bad({ class: 3 }, 'class must be a string');
	await bad({ level: 0 }, 'level must be an integer from 1 to 10');
	await bad({ level: 11 }, 'level must be an integer from 1 to 10');
	await bad({ level: 1.5 }, 'level must be an integer from 1 to 10');
	await bad({ level: '2' }, 'level must be an integer from 1 to 10');
	await bad({ evasion: -1 }, 'evasion must be an integer from 0 to 30');
	await bad({ evasion: 31 }, 'evasion must be an integer from 0 to 30');
	await bad({ evasion: undefined }, 'evasion must be an integer from 0 to 30');
	await bad({ majorThreshold: 0 }, 'majorThreshold must be an integer from 1 to 100');
	await bad({ majorThreshold: 101 }, 'majorThreshold must be an integer from 1 to 100');
	await bad({ severeThreshold: 101 }, 'severeThreshold must be an integer from 1 to 100');
	await bad({ maxHp: 0 }, 'maxHp must be an integer from 1 to 12');
	await bad({ maxHp: 13 }, 'maxHp must be an integer from 1 to 12');
	await bad({ maxStress: 0 }, 'maxStress must be an integer from 1 to 12');
	await bad({ maxStress: 13 }, 'maxStress must be an integer from 1 to 12');
	await bad({ armorSlots: -1 }, 'armorSlots must be an integer from 0 to 12');
	await bad({ armorSlots: 13 }, 'armorSlots must be an integer from 0 to 12');
	const th = 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100';
	await bad({ majorThreshold: 10, severeThreshold: 10 }, th);
	await bad({ majorThreshold: 11, severeThreshold: 10 }, th);
	for (const b of [null, [], 'x', 5]) await expectErr('POST', u, b, 400, 'body must be a JSON object');
	await expectErr('POST', '/api/campaigns/nope/characters', CHAR, 404, 'campaign not found');
});

test('patch character: valid, boundaries and each rejection message', async () => {
	const { ch } = await setup();
	const u = `/api/characters/${ch.id}`;
	const ok = await call('PATCH', u, { name: ' New ', level: 10, notes: 'n'.repeat(5000), subclass: 'core_subclass_beastbound', ancestry: 'core_ancestry_clank', community: null });
	assert.equal(ok.status, 200);
	assert.equal(ok.json.name, 'New');
	assert.equal(ok.json.subclass, 'core_subclass_beastbound');
	assert.equal(ok.json.ancestry, 'core_ancestry_clank');
	assert.equal((await call('PATCH', u, {})).status, 200);
	assert.equal((await call('PATCH', u, { community: 'core_community_highborne' })).json.community, 'core_community_highborne');
	const bad = (b, msg) => expectErr('PATCH', u, b, 400, msg);
	await bad({ name: 'n'.repeat(101) }, 'name must be 1 to 100 characters');
	await bad({ name: 1 }, 'name must be a string');
	await bad({ class: '' }, 'class must be 1 to 50 characters');
	await bad({ level: 11 }, 'level must be an integer from 1 to 10');
	await bad({ evasion: 31 }, 'evasion must be an integer from 0 to 30');
	await bad({ maxHp: 13 }, 'maxHp must be an integer from 1 to 12');
	await bad({ maxStress: 0 }, 'maxStress must be an integer from 1 to 12');
	await bad({ armorSlots: 13 }, 'armorSlots must be an integer from 0 to 12');
	await bad({ majorThreshold: 101 }, 'majorThreshold must be an integer from 1 to 100');
	await bad({ severeThreshold: 0 }, 'severeThreshold must be an integer from 1 to 100');
	await bad({ notes: 'n'.repeat(5001) }, 'notes must be a string of up to 5000 characters');
	await bad({ notes: 3 }, 'notes must be a string of up to 5000 characters');
	await bad({ subclass: 'nope' }, 'subclass must be an SRD subclasses id or null');
	await bad({ subclass: 3 }, 'subclass must be an SRD subclasses id or null');
	await bad({ ancestry: 'nope' }, 'ancestry must be an SRD ancestries id or null');
	await bad({ community: 'nope' }, 'community must be an SRD communities id or null');
	await bad({ class: 'Bard', subclass: 'core_subclass_beastbound' }, "subclass must belong to the character's class");
	const th = 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100';
	await bad({ majorThreshold: 10 }, th); // severe is 10
	await bad({ severeThreshold: 5 }, th); // major is 5
	await bad({ majorThreshold: 50, severeThreshold: 40 }, th);
	for (const b of [null, [], 'x']) await bad(b, 'body must be a JSON object');
	await expectErr('PATCH', '/api/characters/nope', { name: 'x' }, 404, 'character not found');
});

test('trackers: delta validation, clamping, unknown tracker', async () => {
	const { ch } = await setup();
	for (const t of ['hp', 'stress', 'hope', 'armor']) {
		const u = `/api/characters/${ch.id}/${t}`;
		assert.equal((await call('POST', u, { delta: 1 })).status, 200, t);
		for (const b of [{ delta: 0.5 }, { delta: 'a' }, {}, null])
			await expectErr('POST', u, b, 400, 'delta must be an integer');
	}
	const hope = (await call('POST', `/api/characters/${ch.id}/hope`, { delta: 100 })).json;
	assert.equal(hope.hope, 6);
	await expectErr('POST', `/api/characters/${ch.id}/bogus`, { delta: 1 }, 404, 'not found');
	await expectErr('POST', '/api/characters/nope/hp', { delta: 1 }, 404, 'character not found');
});

test('damage: validation and result shape', async () => {
	const { ch } = await setup();
	const u = `/api/characters/${ch.id}/damage`;
	const ok = await call('POST', u, { amount: 6, useArmor: false });
	assert.equal(ok.status, 200);
	assert.equal(ok.json.hpMarked, 2);
	for (const b of [{ amount: 1.5, useArmor: true }, { amount: '1', useArmor: true }, { useArmor: true }, null])
		await expectErr('POST', u, b, 400, 'amount must be an integer');
	for (const b of [{ amount: 1 }, { amount: 1, useArmor: 'yes' }])
		await expectErr('POST', u, b, 400, 'useArmor must be a boolean');
	await expectErr('POST', '/api/characters/nope/damage', { amount: 1, useArmor: false }, 404, 'character not found');
});

test('gold: validation, not enough gold, 404', async () => {
	const { ch } = await setup();
	const u = `/api/characters/${ch.id}/gold`;
	assert.equal((await call('POST', u, { handfuls: 25 })).json.gold.bags, 2);
	for (const b of [{ handfuls: 1.5 }, { handfuls: '1' }, {}, null])
		await expectErr('POST', u, b, 400, 'handfuls must be an integer');
	await expectErr('POST', u, { handfuls: -1000 }, 400, 'not enough gold');
	await expectErr('POST', '/api/characters/nope/gold', { handfuls: 1 }, 404, 'character not found');
});

test('conditions: boolean validation, partial bodies, 404', async () => {
	const { ch } = await setup();
	const u = `/api/characters/${ch.id}/conditions`;
	const ok = await call('PUT', u, { hidden: true });
	assert.equal(ok.status, 200);
	assert.equal(ok.json.conditions.hidden, true);
	assert.equal((await call('PUT', u, {})).status, 200);
	for (const k of ['vulnerable', 'restrained', 'hidden'])
		await expectErr('PUT', u, { [k]: 'yes' }, 400, `${k} must be a boolean`);
	for (const b of [null, [], 'x']) await expectErr('PUT', u, b, 400, 'body must be a JSON object');
	await expectErr('PUT', '/api/characters/nope/conditions', { hidden: true }, 404, 'character not found');
});

test('cards: validation, 409 duplicate, delete and 404s', async () => {
	const { ch } = await setup();
	const u = `/api/characters/${ch.id}/cards`;
	const card = 'core_domain_card_a_soldiers_bond';
	assert.equal((await call('POST', u, { cardId: card })).status, 201);
	await expectErr('POST', u, { cardId: card }, 409, 'card already held');
	for (const b of [{ cardId: 'nope' }, { cardId: 3 }, {}])
		await expectErr('POST', u, b, 400, 'cardId must be an SRD domain card id');
	await expectErr('POST', u, null, 400, 'body must be a JSON object');
	assert.equal((await call('DELETE', `${u}/${card}`)).status, 204);
	await expectErr('DELETE', `${u}/${card}`, undefined, 404, 'card not held');
	await expectErr('POST', '/api/characters/nope/cards', { cardId: card }, 404, 'character not found');
});

test('items: create, merge, quantity boundaries, validation messages', async () => {
	const { ch } = await setup();
	const u = `/api/characters/${ch.id}/items`;
	const rope = await call('POST', u, { name: ' Rope ' });
	assert.equal(rope.status, 201);
	assert.equal(rope.json.quantity, 1);
	assert.equal(rope.json.name, 'Rope');
	const again = await call('POST', u, { name: 'rope', quantity: 2 });
	assert.equal(again.status, 200);
	assert.equal(again.json.quantity, 3);
	assert.equal((await call('POST', u, { name: 'Big', quantity: 1000000 })).status, 201);
	const srd = await call('POST', u, { srdId: 'core_weapon_broadsword', name: 'ignored' });
	assert.equal(srd.status, 201);
	assert.equal(srd.json.srdId, 'core_weapon_broadsword');
	assert.equal((await call('POST', u, { name: 'Null srd', srdId: null })).status, 201);
	const bad = (b, msg) => expectErr('POST', u, b, 400, msg);
	const q = 'quantity must be an integer from 1 to 1000000';
	await bad({ name: 'x', quantity: 0 }, q);
	await bad({ name: 'x', quantity: 1000001 }, q);
	await bad({ name: 'x', quantity: 1.5 }, q);
	await bad({ name: 'x', quantity: '2' }, q);
	await bad({ name: 'x'.repeat(101) }, 'name must be 1 to 100 characters');
	await bad({ name: '' }, 'name must be 1 to 100 characters');
	await bad({}, 'name must be a string');
	await bad({ name: 3 }, 'name must be a string');
	await bad({ srdId: 'nope' }, 'srdId must be an SRD weapon, armor, consumable or item id');
	await bad({ srdId: 3 }, 'srdId must be an SRD weapon, armor, consumable or item id');
	for (const b of [null, [], 'x']) await bad(b, 'body must be a JSON object');
	await expectErr('POST', '/api/characters/nope/items', { name: 'x' }, 404, 'character not found');
});

test('item quantity patch/delete: boundaries, validation, 404', async () => {
	const { ch } = await setup();
	const item = (await call('POST', `/api/characters/${ch.id}/items`, { name: 'Torch' })).json;
	const u = `/api/items/${item.id}`;
	assert.equal((await call('PATCH', u, { quantity: 1000000 })).json.quantity, 1000000);
	const q = 'quantity must be an integer from 0 to 1000000';
	for (const b of [{ quantity: -1 }, { quantity: 1000001 }, { quantity: 1.5 }, { quantity: 'a' }, {}])
		await expectErr('PATCH', u, b, 400, q);
	for (const b of [null, [], 'x']) await expectErr('PATCH', u, b, 400, 'body must be a JSON object');
	await expectErr('PATCH', '/api/items/nope', { quantity: 1 }, 404, 'item not found');
	assert.equal((await call('PATCH', u, { quantity: 0 })).status, 204);
	await expectErr('DELETE', u, undefined, 404, 'item not found');
	await expectErr('DELETE', '/api/items/nope', undefined, 404, 'item not found');
});

test('unknown campaign/character ids still give 404 on GET, DELETE', async () => {
	await expectErr('GET', '/api/campaigns/nope', undefined, 404, 'campaign not found');
	await expectErr('DELETE', '/api/campaigns/nope', undefined, 404, 'campaign not found');
	await expectErr('GET', '/api/characters/nope', undefined, 404, 'character not found');
	await expectErr('DELETE', '/api/characters/nope', undefined, 404, 'character not found');
});
