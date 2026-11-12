import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const send = (m, p, body) =>
	fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const body = (level) => ({ name: 'Rook', class: 'Guardian', level, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 });
let campaign;
const create = async (level) => {
	campaign ??= (await (await send('POST', '/api/campaigns', { name: 'US282' })).json()).id;
	const r = await send('POST', `/api/campaigns/${campaign}/characters`, body(level));
	assert.equal(r.status, 201);
	return (await r.json()).id;
};
const get = async (id) => (await send('GET', `/api/characters/${id}`)).json();

for (const level of [1, 5, 10]) {
	test(`a level ${level} character answers proficiency 1, advancements [] and markedTraits []`, async () => {
		const id = await create(level);
		const c = await get(id);
		assert.equal(c.level, level);
		assert.equal(c.proficiency, 1);
		assert.deepEqual(c.advancements, []);
		assert.deepEqual(c.markedTraits, []);
	});
}

test('the create response carries the three fields too', async () => {
	campaign ??= (await (await send('POST', '/api/campaigns', { name: 'US282' })).json()).id;
	const c = await (await send('POST', `/api/campaigns/${campaign}/characters`, body(3))).json();
	assert.equal(c.proficiency, 1);
	assert.deepEqual(c.advancements, []);
	assert.deepEqual(c.markedTraits, []);
});

test('PATCH cannot write proficiency, advancements or markedTraits', async () => {
	const id = await create(2);
	const r = await send('PATCH', `/api/characters/${id}`, {
		proficiency: 4,
		advancements: [{ level: 2, tier: 2, option: 'hp' }],
		markedTraits: ['agility']
	});
	assert.ok(r.status < 500);
	const c = await get(id);
	assert.equal(c.proficiency, 1);
	assert.deepEqual(c.advancements, []);
	assert.deepEqual(c.markedTraits, []);
});

test('PATCH of a real field next to them still works and leaves them unchanged', async () => {
	const id = await create(2);
	await send('PATCH', `/api/characters/${id}`, { name: 'Renamed', proficiency: 3, markedTraits: ['agility'] });
	const c = await get(id);
	assert.equal(c.proficiency, 1);
	assert.deepEqual(c.markedTraits, []);
});
