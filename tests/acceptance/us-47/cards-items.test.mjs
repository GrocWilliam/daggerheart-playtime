import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
async function call(method, path, body, headers = {}) {
	const res = await fetch(BASE + path, {
		method,
		headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	let json;
	try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
	return { status: res.status, text, json };
}
const valid = { name: 'Rook', class: 'Ranger', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
async function newChar() {
	const camp = await call('POST', '/api/campaigns', { name: 'C' });
	const r = await call('POST', `/api/campaigns/${camp.json.id}/characters`, valid);
	assert.equal(r.status, 201, r.text);
	return r.json;
}
const get = async (id) => (await call('GET', `/api/characters/${id}`)).json;
const addCard = (id, cardId) => call('POST', `/api/characters/${id}/cards`, { cardId });
const addItem = (id, body, h) => call('POST', `/api/characters/${id}/items`, body, h);
const nameEn = (e) => e.name['en-US'] ?? e.name;
async function srdList(kind) {
	const r = await call('GET', `/api/srd/${kind}`);
	assert.equal(r.status, 200, r.text);
	return r.json;
}
async function srdOne(kind, id) {
	const r = await call('GET', `/api/srd/${kind}/${id}`);
	assert.equal(r.status, 200, r.text);
	return r.json;
}
// English name of an SRD element, read through the SRD API (English by default).
async function enName(kind, id) {
	const e = await srdOne(kind, id);
	return typeof e.name === 'string' ? e.name : e.name['en-US'];
}

test('a new character has cards [] (POST, GET, PATCH)', async () => {
	const c = await newChar();
	for (const o of [c, await get(c.id), (await call('PATCH', `/api/characters/${c.id}`, { notes: 'x' })).json]) {
		assert.deepEqual(o.cards, []);
	}
});

test('POST /cards with a known card -> 201 and the character; GET lists cards in the order added', async () => {
	const c = await newChar();
	const cards = await srdList('domain-cards');
	const [a, b, d] = [cards[5].id, cards[0].id, cards[9].id];
	const r = await addCard(c.id, a);
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.id, c.id);
	assert.deepEqual(r.json.cards, [a]);
	assert.equal((await addCard(c.id, b)).status, 201);
	const last = await addCard(c.id, d);
	assert.deepEqual(last.json.cards, [a, b, d]);
	assert.deepEqual((await get(c.id)).cards, [a, b, d]);
});

test('POST /cards with an unknown card or an id of another kind -> 400, nothing changed', async () => {
	const c = await newChar();
	const weapon = (await srdList('weapons'))[0].id;
	for (const id of ['nope', weapon, '']) {
		const r = await addCard(c.id, id);
		assert.equal(r.status, 400, `${id}: ${r.text}`);
	}
	for (const body of [{}, { cardId: 5 }, { cardId: null }]) {
		const r = await call('POST', `/api/characters/${c.id}/cards`, body);
		assert.equal(r.status, 400, JSON.stringify(body));
	}
	assert.deepEqual((await get(c.id)).cards, []);
});

test('POST /cards for a card already held -> 409 and no duplicate', async () => {
	const c = await newChar();
	const id = (await srdList('domain-cards'))[2].id;
	assert.equal((await addCard(c.id, id)).status, 201);
	assert.equal((await addCard(c.id, id)).status, 409);
	assert.deepEqual((await get(c.id)).cards, [id]);
});

test('POST /cards for an unknown character -> 404', async () => {
	const id = (await srdList('domain-cards'))[0].id;
	const r = await addCard('00000000-0000-0000-0000-000000000000', id);
	assert.equal(r.status, 404, r.text);
});

test('DELETE /cards/<cardId> -> 204 and the card is removed, others keep their order', async () => {
	const c = await newChar();
	const cards = (await srdList('domain-cards')).slice(0, 3).map((x) => x.id);
	for (const id of cards) await addCard(c.id, id);
	const r = await call('DELETE', `/api/characters/${c.id}/cards/${cards[1]}`);
	assert.equal(r.status, 204);
	assert.equal(r.text, '');
	assert.deepEqual((await get(c.id)).cards, [cards[0], cards[2]]);
	// can be added again, at the end
	assert.equal((await addCard(c.id, cards[1])).status, 201);
	assert.deepEqual((await get(c.id)).cards, [cards[0], cards[2], cards[1]]);
});

test('DELETE /cards/<cardId> for a card not held -> 404', async () => {
	const c = await newChar();
	const [a, b] = (await srdList('domain-cards')).map((x) => x.id);
	await addCard(c.id, a);
	assert.equal((await call('DELETE', `/api/characters/${c.id}/cards/${b}`)).status, 404);
	assert.equal((await call('DELETE', `/api/characters/${c.id}/cards/nope`)).status, 404);
	assert.deepEqual((await get(c.id)).cards, [a]);
});

test('POST /items {srdId} -> 201, name is the SRD English name, srdId is set, quantity defaults to 1', async () => {
	const c = await newChar();
	const w = (await srdList('weapons'))[0].id;
	const r = await addItem(c.id, { srdId: w });
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.name, await enName('weapons', w));
	assert.equal(r.json.srdId, w);
	assert.equal(r.json.quantity, 1);
	const items = (await get(c.id)).items;
	assert.equal(items.length, 1);
	assert.equal(items[0].srdId, w);
	assert.equal(items[0].name, r.json.name);
});

test('POST /items {srdId, quantity} accepts weapons, armors, consumables and items', async () => {
	const c = await newChar();
	for (const kind of ['weapons', 'armors', 'consumables', 'items']) {
		const id = (await srdList(kind))[0].id;
		const r = await addItem(c.id, { srdId: id, quantity: 3 });
		assert.equal(r.status, 201, `${kind}: ${r.text}`);
		assert.equal(r.json.name, await enName(kind, id));
		assert.equal(r.json.srdId, id);
		assert.equal(r.json.quantity, 3);
	}
	assert.equal((await get(c.id)).items.length, 4);
});

test('POST /items with an unknown srdId (or one of another kind) -> 400, nothing added', async () => {
	const c = await newChar();
	const card = (await srdList('domain-cards'))[0].id;
	for (const srdId of ['nope', card, 5, '']) {
		const r = await addItem(c.id, { srdId });
		assert.equal(r.status, 400, `${srdId}: ${r.text}`);
	}
	assert.deepEqual((await get(c.id)).items, []);
});

test('merging by name: the same srdId twice sums the quantities', async () => {
	const c = await newChar();
	const id = (await srdList('consumables'))[0].id;
	const a = await addItem(c.id, { srdId: id, quantity: 2 });
	assert.equal(a.status, 201);
	const b = await addItem(c.id, { srdId: id, quantity: 3 });
	assert.equal(b.status, 200, b.text);
	assert.equal(b.json.id, a.json.id);
	assert.equal(b.json.quantity, 5);
	assert.equal((await get(c.id)).items.length, 1);
});

test('merging by name: an SRD item merges with a free-text item of the same name', async () => {
	const c = await newChar();
	const id = (await srdList('items'))[0].id;
	const name = await enName('items', id);
	const a = await addItem(c.id, { name, quantity: 1 });
	assert.equal(a.status, 201);
	const b = await addItem(c.id, { srdId: id, quantity: 2 });
	assert.equal(b.status, 200, b.text);
	assert.equal(b.json.id, a.json.id);
	assert.equal(b.json.quantity, 3);
	assert.equal((await get(c.id)).items.length, 1);
});

test('the SRD name is stored in English even with Cookie: lang=fr', async () => {
	const c = await newChar();
	const id = (await srdList('armors'))[0].id;
	const r = await addItem(c.id, { srdId: id }, { Cookie: 'lang=fr' });
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.name, await enName('armors', id));
	const g = await call('GET', `/api/characters/${c.id}`, undefined, { Cookie: 'lang=fr' });
	assert.equal(g.json.items[0].name, r.json.name);
});
