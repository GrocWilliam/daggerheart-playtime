import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
async function call(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : {},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	let json;
	try { json = text ? JSON.parse(text) : undefined; } catch {}
	return { status: res.status, text, json };
}

async function newChar() {
	const c = await call('POST', '/api/campaigns', { name: 'C' });
	assert.equal(c.status, 201, c.text);
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, {
		name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5,
		severeThreshold: 10, maxHp: 6, armorSlots: 3
	});
	assert.equal(r.status, 201, r.text);
	return r.json.id;
}
const addItem = (cid, body) => call('POST', `/api/characters/${cid}/items`, body);
const listItems = async (cid) => (await call('GET', `/api/characters/${cid}`)).json.items;

test('POST {"name":"Torch"} -> 201 {id,name:"Torch",quantity:1}', async () => {
	const cid = await newChar();
	const r = await addItem(cid, { name: 'Torch' });
	assert.equal(r.status, 201, r.text);
	for (const k of ['id', 'name', 'quantity', 'srdId']) assert.ok(k in r.json, `missing key ${k}`);
	assert.equal(typeof r.json.id, 'string');
	assert.equal(r.json.name, 'Torch');
	assert.equal(r.json.quantity, 1);
});

test('POST " torch " qty 2 merges -> 200, same id, quantity 3, name "Torch"', async () => {
	const cid = await newChar();
	const a = await addItem(cid, { name: 'Torch' });
	assert.equal(a.status, 201, a.text);
	const r = await addItem(cid, { name: ' torch ', quantity: 2 });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.id, a.json.id);
	assert.equal(r.json.quantity, 3);
	assert.equal(r.json.name, 'Torch');
	const items = await listItems(cid);
	assert.equal(items.length, 1);
	assert.equal(items[0].quantity, 3);
});

test('POST {"name":"Rope","quantity":0} -> 400 and POST {"name":""} -> 400', async () => {
	const cid = await newChar();
	assert.equal((await addItem(cid, { name: 'Rope', quantity: 0 })).status, 400);
	assert.equal((await addItem(cid, { name: '' })).status, 400);
	assert.equal((await addItem(cid, {})).status, 400);
	assert.equal((await addItem(cid, { name: 'Rope', quantity: 1.5 })).status, 400);
	assert.deepEqual(await listItems(cid), []);
});

test('PATCH {"quantity":5} -> 200 {id,name,quantity:5}', async () => {
	const cid = await newChar();
	const a = await addItem(cid, { name: 'Torch' });
	const r = await call('PATCH', `/api/items/${a.json.id}`, { quantity: 5 });
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(r.json, { id: a.json.id, name: 'Torch', quantity: 5, srdId: null });
});

test('PATCH {"quantity":0} -> 204 empty, item gone from character GET', async () => {
	const cid = await newChar();
	const a = await addItem(cid, { name: 'Torch' });
	const r = await call('PATCH', `/api/items/${a.json.id}`, { quantity: 0 });
	assert.equal(r.status, 204, r.text);
	assert.equal(r.text, '');
	const items = await listItems(cid);
	assert.ok(!items.some((i) => i.id === a.json.id));
});

test('PATCH {"quantity":-1} -> 400', async () => {
	const cid = await newChar();
	const a = await addItem(cid, { name: 'Torch' });
	const r = await call('PATCH', `/api/items/${a.json.id}`, { quantity: -1 });
	assert.equal(r.status, 400);
	assert.equal((await call('PATCH', `/api/items/${a.json.id}`, { quantity: 1.5 })).status, 400);
});

test('DELETE existing -> 204, DELETE again -> 404', async () => {
	const cid = await newChar();
	const a = await addItem(cid, { name: 'Torch' });
	const r = await call('DELETE', `/api/items/${a.json.id}`);
	assert.equal(r.status, 204, r.text);
	assert.equal(r.text, '');
	assert.equal((await call('DELETE', `/api/items/${a.json.id}`)).status, 404);
	assert.equal((await call('PATCH', `/api/items/${a.json.id}`, { quantity: 2 })).status, 404);
});

test('POST items under unknown character id -> 404', async () => {
	const r = await addItem('00000000-0000-0000-0000-000000000000', { name: 'Torch' });
	assert.equal(r.status, 404);
});
