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
	try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
	return { status: res.status, text, json };
}
const valid = { name: 'Rook', class: 'Ranger', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
async function newChar(over = {}) {
	const camp = await call('POST', '/api/campaigns', { name: 'C' });
	const r = await call('POST', `/api/campaigns/${camp.json.id}/characters`, { ...valid, ...over });
	assert.equal(r.status, 201, r.text);
	return r.json;
}
const patch = (id, body) => call('PATCH', `/api/characters/${id}`, body);
const get = async (id) => (await call('GET', `/api/characters/${id}`)).json;
const srd = (kind, id) => call('GET', `/api/srd/${kind}${id ? '/' + id : ''}`);

async function ids() {
	const sub = (await srd('subclasses')).json;
	const full = [];
	for (const s of sub) full.push((await srd('subclasses', s.id)).json);
	const anc = (await srd('ancestries')).json;
	const com = (await srd('communities')).json;
	return {
		rangerSub: full.find((s) => s.class === 'RANGER').id,
		bardSub: full.find((s) => s.class === 'BARD').id,
		anc: anc[0].id, anc2: anc[1].id, com: com[0].id
	};
}

test('a new character has subclass, ancestry, community null and cards []', async () => {
	const c = await newChar();
	for (const o of [c, await get(c.id), (await patch(c.id, { notes: 'x' })).json]) {
		assert.equal(o.subclass, null);
		assert.equal(o.ancestry, null);
		assert.equal(o.community, null);
		assert.deepEqual(o.cards, []);
	}
});

test('an item has srdId null (POST and character GET)', async () => {
	const c = await newChar();
	const r = await call('POST', `/api/characters/${c.id}/items`, { name: 'Torch' });
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.srdId, null);
	const items = (await get(c.id)).items;
	assert.equal(items.length, 1);
	assert.equal(items[0].srdId, null);
});

test('PATCH accepts a subclass of the character class, an ancestry and a community, and they persist', async () => {
	const x = await ids();
	const c = await newChar();
	const r = await patch(c.id, { subclass: x.rangerSub, ancestry: x.anc, community: x.com });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.subclass, x.rangerSub);
	assert.equal(r.json.ancestry, x.anc);
	assert.equal(r.json.community, x.com);
	const g = await get(c.id);
	assert.equal(g.subclass, x.rangerSub);
	assert.equal(g.ancestry, x.anc);
	assert.equal(g.community, x.com);
	// each field alone leaves the others untouched
	const r2 = await patch(c.id, { ancestry: x.anc2 });
	assert.equal(r2.status, 200, r2.text);
	assert.equal(r2.json.ancestry, x.anc2);
	assert.equal(r2.json.subclass, x.rangerSub);
	assert.equal(r2.json.community, x.com);
});

test('the class match is on the upper-cased class (any case)', async () => {
	const x = await ids();
	const c = await newChar({ class: 'ranger' });
	const r = await patch(c.id, { subclass: x.rangerSub });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.class, 'ranger');
});

test('PATCH with null resets subclass, ancestry and community', async () => {
	const x = await ids();
	const c = await newChar();
	await patch(c.id, { subclass: x.rangerSub, ancestry: x.anc, community: x.com });
	const r = await patch(c.id, { subclass: null, ancestry: null, community: null });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.subclass, null);
	assert.equal(r.json.ancestry, null);
	assert.equal(r.json.community, null);
	const g = await get(c.id);
	assert.equal(g.subclass, null);
	assert.equal(g.ancestry, null);
	assert.equal(g.community, null);
});

test('a subclass of another class -> 400 and nothing changes', async () => {
	const x = await ids();
	const c = await newChar();
	const r = await patch(c.id, { subclass: x.bardSub });
	assert.equal(r.status, 400, r.text);
	assert.equal(typeof r.json?.error, 'string');
	assert.equal((await get(c.id)).subclass, null);
	// a free-text class matches no subclass
	const w = await newChar({ class: 'Wanderer' });
	assert.equal((await patch(w.id, { subclass: x.rangerSub })).status, 400);
});

test('unknown ids, ids of another kind and non-strings -> 400, nothing changes', async () => {
	const x = await ids();
	const c = await newChar();
	await patch(c.id, { ancestry: x.anc });
	const bad = [
		{ subclass: 'core_subclass_nope' }, { ancestry: 'core_ancestry_nope' }, { community: 'core_community_nope' },
		{ ancestry: x.com }, { community: x.anc }, { subclass: x.anc }, { ancestry: x.rangerSub },
		{ ancestry: 5 }, { community: true }, { subclass: [] }, { ancestry: '' }
	];
	for (const b of bad) {
		const r = await patch(c.id, b);
		assert.equal(r.status, 400, JSON.stringify(b));
		assert.equal(typeof r.json?.error, 'string');
	}
	const g = await get(c.id);
	assert.equal(g.ancestry, x.anc);
	assert.equal(g.subclass, null);
	assert.equal(g.community, null);
	// an invalid field makes the whole PATCH fail
	const r = await patch(c.id, { notes: 'changed', community: 'core_community_nope' });
	assert.equal(r.status, 400);
	assert.equal((await get(c.id)).notes, '');
});

test('class stays a free string', async () => {
	const c = await newChar({ class: 'Homebrew Hero' });
	assert.equal(c.class, 'Homebrew Hero');
	const r = await patch(c.id, { class: 'Another' });
	assert.equal(r.status, 200, r.text);
	assert.equal(r.json.class, 'Another');
});
