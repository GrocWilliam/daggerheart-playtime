import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL;
const ROOT = process.env.ROOT;
const send = (m, p, body, raw) =>
	fetch(BASE + p, {
		method: m,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
	});
const BODY = { name: 'Rook', class: 'Guardian', level: 3, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 4, armorSlots: 3 };
const mkChar = async (over = {}) => {
	const c = await (await send('POST', '/api/campaigns', { name: 'C' })).json();
	const r = await send('POST', `/api/campaigns/${c.id}/characters`, { ...BODY, ...over });
	assert.equal(r.status, 201);
	return { campaign: c, ch: await r.json() };
};
const post = async (id, p, b) => {
	const r = await send('POST', `/api/characters/${id}/${p}`, b);
	return { status: r.status, body: await r.json() };
};
const tracker = async (id, t, delta) => {
	const r = await post(id, t, { delta });
	assert.equal(r.status, 200);
	return r.body;
};

const walk = (d) =>
	fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
	);
const CHAR_ROUTES = () => {
	const dir = path.join(ROOT, 'src/routes/api/characters/[id]');
	// items are not part of this story (they stay on db.query until migrated)
	return walk(dir).filter((f) => !f.includes(`${path.sep}items${path.sep}`)).concat(
		path.join(ROOT, 'src/routes/api/campaigns/[id]/characters/+server.ts')
	);
};

test('no raw SQL strings remain in characters.ts', () => {
	const src = fs.readFileSync(path.join(ROOT, 'src/lib/server/characters.ts'), 'utf8');
	for (const name of ['TRACKER_SQL', 'DAMAGE_SQL', 'GOLD_SQL', 'BASE_COLS', 'ITEMS_SUBQUERY', 'CHARACTER_COLS'])
		assert.doesNotMatch(src, new RegExp(name), name);
	assert.doesNotMatch(src, /\.query\(/);
	assert.doesNotMatch(src, /\bFOR UPDATE\b|\bRETURNING \$\{|\bWITH old\b/);
	// multi-line sql`` fragments may start on a previous line: allow only lines within a sql template
	let inSql = false;
	const stray = [];
	for (const l of src.split('\n')) {
		if (/sql(<[^>]*>)?`/.test(l)) inSql = true;
		const hit = /\b(SELECT|INSERT INTO|DELETE FROM|UPDATE \w+ SET)\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l);
		if (hit && !inSql) stray.push(l);
		if (inSql && /`/.test(l.replace(/sql(<[^>]*>)?`/, ''))) inSql = false;
	}
	assert.deepEqual(stray, []);
	assert.match(src, /getDrizzle/);
});

test('character API handlers use the Drizzle builder, not db.query nor SQL constants', () => {
	const files = CHAR_ROUTES();
	assert.ok(files.length >= 8, String(files.length));
	for (const f of files) {
		const t = fs.readFileSync(f, 'utf8');
		assert.doesNotMatch(t, /\.query\(/, f);
		assert.doesNotMatch(t, /\b(TRACKER_SQL|DAMAGE_SQL|GOLD_SQL|CHARACTER_COLS)\b/, f);
		assert.doesNotMatch(t, /\b(SELECT|INSERT INTO|DELETE FROM)\b/, f);
		assert.doesNotMatch(t, /\bUPDATE \w+ SET\b/, f);
	}
});

test('characters.test.ts runs on in-memory PGlite and covers create, patch, trackers at bounds, damage, gold floor, conditions, cards', () => {
	const t = fs.readFileSync(path.join(ROOT, 'src/lib/server/characters.test.ts'), 'utf8');
	assert.match(t, /memory:\/\/|getDrizzle|getDb/); // vitest setup uses PGlite in memory
	assert.doesNotMatch(t, /\b(TRACKER_SQL|DAMAGE_SQL|GOLD_SQL)\b/);
	for (const re of [/create|insert/i, /patch|update/i, /\bhp\b/, /stress/, /hope/, /armor/, /damage/i, /gold/i, /condition/i, /card/i, /\b6\b/, /\b0\b/])
		assert.match(t, re, String(re));
	execSync('npx vitest run src/lib/server/characters.test.ts', { cwd: ROOT, stdio: 'pipe' });
});

test('endpoints: create, read, list in campaign, JSON shape', async () => {
	const { campaign, ch } = await mkChar({ name: '  Rook  ' });
	assert.deepEqual(ch, {
		id: ch.id, campaignId: campaign.id, name: 'Rook', class: 'Guardian', level: 3, evasion: 10,
		majorThreshold: 5, severeThreshold: 10, hp: { marked: 0, max: 6 }, stress: { marked: 0, max: 4 },
		hope: 2, armor: { marked: 0, max: 3 },
		conditions: { vulnerable: false, restrained: false, hidden: false }, notes: '',
		gold: { handfuls: 0, bags: 0, chests: 0 }, subclass: null, ancestry: null, community: null,
		cards: [], items: [], down: false
	});
	const g = await send('GET', `/api/characters/${ch.id}`);
	assert.equal(g.status, 200);
	assert.deepEqual(await g.json(), ch);
	const second = await (await send('POST', `/api/campaigns/${campaign.id}/characters`, { ...BODY, name: 'Amy' })).json();
	const d = await (await send('GET', `/api/campaigns/${campaign.id}`)).json();
	assert.deepEqual(d.characters.map((x) => x.id), [ch.id, second.id]);
	const bad = await send('POST', `/api/campaigns/${campaign.id}/characters`, { ...BODY, name: '' });
	assert.equal(bad.status, 400);
	assert.deepEqual(await bad.json(), { error: 'name must be 1 to 100 characters' });
	const nf = await send('GET', '/api/characters/nope');
	assert.equal(nf.status, 404);
	assert.deepEqual(await nf.json(), { error: 'character not found' });
});

test('endpoints: patch updates fields, lowers marked values with their max, validates', async () => {
	const { ch } = await mkChar();
	await tracker(ch.id, 'hp', 5);
	await tracker(ch.id, 'stress', 3);
	await tracker(ch.id, 'armor', 3);
	let r = await send('PATCH', `/api/characters/${ch.id}`, { maxHp: 4, maxStress: 2, armorSlots: 1, notes: 'hi', name: 'Rex', level: 5 });
	assert.equal(r.status, 200);
	let c = await r.json();
	assert.deepEqual([c.hp, c.stress, c.armor], [{ marked: 4, max: 4 }, { marked: 2, max: 2 }, { marked: 1, max: 1 }]);
	assert.deepEqual([c.notes, c.name, c.level], ['hi', 'Rex', 5]);
	// raising a max keeps the marked value
	c = await (await send('PATCH', `/api/characters/${ch.id}`, { maxHp: 12 })).json();
	assert.deepEqual(c.hp, { marked: 4, max: 12 });
	// empty patch changes nothing
	r = await send('PATCH', `/api/characters/${ch.id}`, {});
	assert.deepEqual(await r.json(), c);
	// thresholds
	r = await send('PATCH', `/api/characters/${ch.id}`, { majorThreshold: 10 });
	assert.equal(r.status, 400);
	assert.deepEqual(await r.json(), { error: 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100' });
	c = await (await send('PATCH', `/api/characters/${ch.id}`, { majorThreshold: 9, severeThreshold: 20, evasion: 12 })).json();
	assert.deepEqual([c.majorThreshold, c.severeThreshold, c.evasion], [9, 20, 12]);
	// SRD fields
	r = await send('PATCH', `/api/characters/${ch.id}`, { class: 'Ranger', subclass: 'core_subclass_beastbound' });
	assert.equal(r.status, 200);
	assert.equal((await r.json()).subclass, 'core_subclass_beastbound');
	r = await send('PATCH', `/api/characters/${ch.id}`, { subclass: null });
	assert.equal((await r.json()).subclass, null);
	r = await send('PATCH', `/api/characters/${ch.id}`, { subclass: 'nope' });
	assert.equal(r.status, 400);
	assert.equal((await send('PATCH', '/api/characters/nope', { name: 'x' })).status, 404);
});

test('endpoints: hp, hope and armor trackers clamp at their bounds', async () => {
	const { ch } = await mkChar();
	assert.deepEqual((await tracker(ch.id, 'hp', -3)).hp, { marked: 0, max: 6 });
	assert.deepEqual((await tracker(ch.id, 'hp', 4)).hp, { marked: 4, max: 6 });
	let c = await tracker(ch.id, 'hp', 100);
	assert.deepEqual(c.hp, { marked: 6, max: 6 });
	assert.equal(c.down, true);
	assert.equal((await tracker(ch.id, 'hp', -Number.MAX_SAFE_INTEGER)).hp.marked, 0);
	assert.equal((await tracker(ch.id, 'hp', Number.MAX_SAFE_INTEGER)).hp.marked, 6);
	assert.equal((await tracker(ch.id, 'hope', -1)).hope, 1);
	assert.equal((await tracker(ch.id, 'hope', 2)).hope, 3);
	assert.equal((await tracker(ch.id, 'hope', 50)).hope, 6);
	assert.equal((await tracker(ch.id, 'hope', -50)).hope, 0);
	assert.equal((await tracker(ch.id, 'armor', -1)).armor.marked, 0);
	assert.equal((await tracker(ch.id, 'armor', 2)).armor.marked, 2);
	assert.equal((await tracker(ch.id, 'armor', 99)).armor.marked, 3);
	assert.equal((await tracker(ch.id, 'armor', -99)).armor.marked, 0);
});

test('endpoints: stress clamps, overflows into hp and toggles Vulnerable', async () => {
	const { ch } = await mkChar();
	let c = await tracker(ch.id, 'stress', -2);
	assert.equal(c.stress.marked, 0);
	assert.equal(c.conditions.vulnerable, false);
	c = await tracker(ch.id, 'stress', 3);
	assert.equal(c.stress.marked, 3);
	assert.equal(c.conditions.vulnerable, false);
	c = await tracker(ch.id, 'stress', 1);
	assert.equal(c.stress.marked, 4);
	assert.equal(c.conditions.vulnerable, true);
	assert.equal(c.hp.marked, 0);
	// overflow beyond the max marks hp
	c = await tracker(ch.id, 'stress', 2);
	assert.deepEqual([c.stress.marked, c.hp.marked, c.conditions.vulnerable], [4, 2, true]);
	// huge overflow clamps hp to its max
	c = await tracker(ch.id, 'stress', 100);
	assert.deepEqual([c.stress.marked, c.hp.marked], [4, 6]);
	// clearing stress from full clears Vulnerable; negative never touches hp
	c = await tracker(ch.id, 'stress', -1);
	assert.deepEqual([c.stress.marked, c.hp.marked, c.conditions.vulnerable], [3, 6, false]);
	c = await tracker(ch.id, 'stress', -100);
	assert.equal(c.stress.marked, 0);
	// other conditions untouched
	assert.equal(c.conditions.restrained, false);
});

test('endpoints: tracker errors', async () => {
	const { ch } = await mkChar();
	let r = await post(ch.id, 'luck', { delta: 1 });
	assert.deepEqual([r.status, r.body], [404, { error: 'not found' }]);
	r = await post(ch.id, 'hp', { delta: 1.5 });
	assert.deepEqual([r.status, r.body], [400, { error: 'delta must be an integer' }]);
	r = await post('nope', 'hp', { delta: 1 });
	assert.deepEqual([r.status, r.body], [404, { error: 'character not found' }]);
});

test('endpoints: damage with and without armor, thresholds, clamping', async () => {
	const { ch } = await mkChar();
	const dmg = (amount, useArmor) => post(ch.id, 'damage', { amount, useArmor });
	let r = await dmg(0, false);
	assert.equal(r.status, 200);
	assert.deepEqual(Object.keys(r.body), ['hpMarked', 'armorUsed', 'character']);
	assert.deepEqual([r.body.hpMarked, r.body.armorUsed, r.body.character.hp.marked, r.body.character.armor.marked], [0, false, 0, 0]);
	r = await dmg(3, false); // minor: 1 hp
	assert.deepEqual([r.body.hpMarked, r.body.armorUsed, r.body.character.hp.marked], [1, false, 1]);
	r = await dmg(5, false); // major: 2 hp
	assert.deepEqual([r.body.hpMarked, r.body.character.hp.marked], [2, 3]);
	r = await dmg(5, true); // major, armor absorbs one
	assert.deepEqual([r.body.hpMarked, r.body.armorUsed, r.body.character.hp.marked, r.body.character.armor.marked], [1, true, 4, 1]);
	r = await dmg(1, true); // minor fully absorbed
	assert.deepEqual([r.body.hpMarked, r.body.armorUsed, r.body.character.hp.marked, r.body.character.armor.marked], [0, true, 4, 2]);
	r = await dmg(10, true); // severe: 3 - 1
	assert.deepEqual([r.body.hpMarked, r.body.character.hp.marked, r.body.character.armor.marked], [2, 6, 3]);
	assert.equal(r.body.character.down, true);
	r = await dmg(10, true); // armor full: not used, hp already max
	assert.deepEqual([r.body.hpMarked, r.body.armorUsed, r.body.character.hp.marked, r.body.character.armor.marked], [3, false, 6, 3]);
	r = await dmg(-4, true);
	assert.deepEqual([r.body.hpMarked, r.body.armorUsed, r.body.character.hp.marked], [0, false, 6]);
	r = await post(ch.id, 'damage', { amount: 1, useArmor: 'yes' });
	assert.deepEqual([r.status, r.body], [400, { error: 'useArmor must be a boolean' }]);
	r = await post(ch.id, 'damage', { amount: 1.2, useArmor: true });
	assert.equal(r.status, 400);
	r = await post('nope', 'damage', { amount: 1, useArmor: true });
	assert.deepEqual([r.status, r.body], [404, { error: 'character not found' }]);
});

test('endpoints: gold normalizes and never goes below zero', async () => {
	const { ch } = await mkChar();
	let r = await post(ch.id, 'gold', { handfuls: 7 });
	assert.deepEqual([r.status, r.body.gold], [200, { handfuls: 7, bags: 0, chests: 0 }]);
	assert.deepEqual((await post(ch.id, 'gold', { handfuls: 8 })).body.gold, { handfuls: 5, bags: 1, chests: 0 });
	assert.deepEqual((await post(ch.id, 'gold', { handfuls: 95 })).body.gold, { handfuls: 0, bags: 1, chests: 1 });
	assert.deepEqual((await post(ch.id, 'gold', { handfuls: -1 })).body.gold, { handfuls: 9, bags: 0, chests: 1 });
	assert.deepEqual((await post(ch.id, 'gold', { handfuls: -99 })).body.gold, { handfuls: 0, bags: 1, chests: 0 });
	assert.deepEqual((await post(ch.id, 'gold', { handfuls: -10 })).body.gold, { handfuls: 0, bags: 0, chests: 0 });
	await post(ch.id, 'gold', { handfuls: 12 });
	r = await post(ch.id, 'gold', { handfuls: -13 });
	assert.deepEqual([r.status, r.body], [400, { error: 'not enough gold' }]);
	assert.deepEqual((await (await send('GET', `/api/characters/${ch.id}`)).json()).gold, { handfuls: 2, bags: 1, chests: 0 });
	assert.deepEqual((await post(ch.id, 'gold', { handfuls: -12 })).body.gold, { handfuls: 0, bags: 0, chests: 0 });
	r = await post(ch.id, 'gold', { handfuls: 1.5 });
	assert.deepEqual([r.status, r.body], [400, { error: 'handfuls must be an integer' }]);
	r = await post('nope', 'gold', { handfuls: 1 });
	assert.deepEqual([r.status, r.body], [404, { error: 'character not found' }]);
});

test('endpoints: conditions set only the supplied booleans', async () => {
	const { ch } = await mkChar();
	const put = (b) => send('PUT', `/api/characters/${ch.id}/conditions`, b);
	let r = await put({ restrained: true });
	assert.equal(r.status, 200);
	assert.deepEqual((await r.json()).conditions, { vulnerable: false, restrained: true, hidden: false });
	r = await put({ hidden: true, vulnerable: true, restrained: false });
	assert.deepEqual((await r.json()).conditions, { vulnerable: true, restrained: false, hidden: true });
	r = await put({});
	assert.deepEqual((await r.json()).conditions, { vulnerable: true, restrained: false, hidden: true });
	r = await put({ hidden: 'yes' });
	assert.deepEqual([r.status, await r.json()], [400, { error: 'hidden must be a boolean' }]);
	assert.equal((await put({}).then((x) => x.json())).id, ch.id);
	r = await send('PUT', '/api/characters/nope/conditions', { hidden: true });
	assert.deepEqual([r.status, await r.json()], [404, { error: 'character not found' }]);
});

test('endpoints: cards are added once, kept in order, and removed', async () => {
	const { ch } = await mkChar();
	const A = 'core_domain_card_a_soldiers_bond';
	const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/srd/core/domain-cards.json'), 'utf8'));
	const B = cards.find((c) => c.id !== A).id;
	const C = cards.find((c) => c.id !== A && c.id !== B).id;
	let r = await post(ch.id, 'cards', { cardId: A });
	assert.equal(r.status, 201);
	assert.deepEqual(r.body.cards, [A]);
	r = await post(ch.id, 'cards', { cardId: A });
	assert.deepEqual([r.status, r.body], [409, { error: 'card already held' }]);
	await post(ch.id, 'cards', { cardId: B });
	r = await post(ch.id, 'cards', { cardId: C });
	assert.deepEqual(r.body.cards, [A, B, C]);
	r = await send('DELETE', `/api/characters/${ch.id}/cards/${B}`);
	assert.equal(r.status, 204);
	assert.equal(await r.text(), '');
	assert.deepEqual((await (await send('GET', `/api/characters/${ch.id}`)).json()).cards, [A, C]);
	r = await send('DELETE', `/api/characters/${ch.id}/cards/${B}`);
	assert.deepEqual([r.status, await r.json()], [404, { error: 'card not held' }]);
	await send('DELETE', `/api/characters/${ch.id}/cards/${A}`);
	await send('DELETE', `/api/characters/${ch.id}/cards/${C}`);
	assert.deepEqual((await (await send('GET', `/api/characters/${ch.id}`)).json()).cards, []);
	r = await post(ch.id, 'cards', { cardId: 'nope' });
	assert.deepEqual([r.status, r.body], [400, { error: 'cardId must be an SRD domain card id' }]);
	r = await post('nope', 'cards', { cardId: A });
	assert.deepEqual([r.status, r.body], [404, { error: 'character not found' }]);
});

test('endpoints: items still appear in the character JSON in creation order', async () => {
	const { ch } = await mkChar();
	await post(ch.id, 'items', { name: 'Rope', quantity: 2 });
	await post(ch.id, 'items', { name: 'Torch' });
	const r = await post(ch.id, 'items', { name: ' rope ', quantity: 1 });
	assert.equal(r.status, 200);
	const c = await (await send('GET', `/api/characters/${ch.id}`)).json();
	assert.deepEqual(c.items.map((i) => [i.name, i.quantity, i.srdId]), [['Rope', 3, null], ['Torch', 1, null]]);
	assert.deepEqual(Object.keys(c.items[0]), ['id', 'name', 'quantity', 'srdId']);
	const t = await tracker(ch.id, 'hope', 1);
	assert.deepEqual(t.items, c.items);
	const d = await post(ch.id, 'damage', { amount: 1, useArmor: false });
	assert.deepEqual(d.body.character.items, c.items);
});

test('endpoints: delete returns 204, removes the character and its items', async () => {
	const { campaign, ch } = await mkChar();
	await post(ch.id, 'items', { name: 'Rope' });
	const r = await send('DELETE', `/api/characters/${ch.id}`);
	assert.equal(r.status, 204);
	assert.equal(await r.text(), '');
	assert.equal((await send('GET', `/api/characters/${ch.id}`)).status, 404);
	const d = await send('DELETE', `/api/characters/${ch.id}`);
	assert.deepEqual([d.status, await d.json()], [404, { error: 'character not found' }]);
	assert.deepEqual((await (await send('GET', `/api/campaigns/${campaign.id}`)).json()).characters, []);
});

test('endpoints: concurrent tracker and gold changes stay atomic', async () => {
	const { ch } = await mkChar({ maxHp: 12 });
	await Promise.all(Array.from({ length: 10 }, () => post(ch.id, 'hp', { delta: 1 })));
	await Promise.all(Array.from({ length: 10 }, () => post(ch.id, 'gold', { handfuls: 1 })));
	await post(ch.id, 'gold', { handfuls: 90 });
	const c = await (await send('GET', `/api/characters/${ch.id}`)).json();
	assert.equal(c.hp.marked, 10);
	assert.deepEqual(c.gold, { handfuls: 0, bags: 0, chests: 1 });
	const rs = await Promise.all(Array.from({ length: 4 }, () => post(ch.id, 'gold', { handfuls: -30 })));
	assert.deepEqual(rs.map((x) => x.status).sort(), [200, 200, 200, 400]);
});
