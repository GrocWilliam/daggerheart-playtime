import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const send = (m, p, body) =>
	fetch(BASE + p, {
		method: m,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
const ok = async (r, status = 200) => {
	const text = await r.text();
	assert.equal(r.status, status, text);
	return JSON.parse(text);
};

let campaign;
async function create({ level = 1, cls = 'Guardian', experiences = ['Bodyguard', 'Blacksmith'] } = {}) {
	campaign ??= (await ok(await send('POST', '/api/campaigns', { name: 'US285' }), 201)).id;
	const c = await ok(
		await send('POST', `/api/campaigns/${campaign}/characters`, {
			name: 'Rook',
			class: cls,
			level,
			evasion: 9,
			majorThreshold: 5,
			severeThreshold: 10,
			maxHp: 7,
			armorSlots: 3,
			traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 }
		}),
		201
	);
	for (const name of experiences)
		await ok(await send('POST', `/api/characters/${c.id}/experiences`, { name, modifier: 2 }), 201);
	return getChar(c.id);
}
const getChar = async (id) => ok(await send('GET', `/api/characters/${id}`));
const plan = async (id) => ok(await send('GET', `/api/characters/${id}/level-up`));
const post = (id, body) => send('POST', `/api/characters/${id}/level-up`, body);
const levelUp = async (id, body) => (await ok(await post(id, body))).character;
const cardsAt = async (id) => (await plan(id)).cards.map((c) => c.id);
const expId = (c, name) => c.experiences.find((e) => e.name === name).id;
const sorted = (a) => [...a].sort();

const snapshot = (c) => ({
	level: c.level,
	proficiency: c.proficiency,
	traits: c.traits,
	markedTraits: c.markedTraits,
	advancements: c.advancements,
	experiences: c.experiences,
	cards: c.cards
});

/** POST answers 400 with exactly `message`, and a following GET shows the character unchanged. */
async function refused(c, body, message) {
	const r = await post(c.id, body);
	assert.equal(r.status, 400);
	assert.deepEqual(await r.json(), { error: message });
	assert.deepEqual(snapshot(await getChar(c.id)), snapshot(c));
}

test('GET plan of a level 1 SRD-class character with two Experiences', async () => {
	const c = await create();
	const p = await plan(c.id);
	assert.equal(p.fromLevel, 1);
	assert.equal(p.toLevel, 2);
	assert.equal(p.tier, 2);
	assert.ok(Array.isArray(p.options));
	assert.ok(!p.options.some((o) => o.option === 'proficiency'), 'no proficiency option at 1 to 2');
	assert.ok(p.options.some((o) => o.option === 'traits'));
});

test('POST 1 to 2 with newExperience, traits, experiences and a level-1 domain card', async () => {
	const c = await create();
	const id1 = expId(c, 'Bodyguard');
	const id2 = expId(c, 'Blacksmith');
	const card = (await plan(c.id)).cards.find((x) => x.level === 1);
	assert.ok(card, 'an eligible level-1 card');
	const r = await post(c.id, {
		newExperience: 'Tavern brawler',
		advancements: [
			{ option: 'traits', traits: ['agility', 'knowledge'] },
			{ option: 'experiences', experiences: [id1, id2] }
		],
		domainCard: card.id
	});
	const res = await ok(r);
	assert.ok(res.character, 'answers { character }');
	const check = (ch) => {
		assert.equal(ch.id, c.id);
		assert.equal(ch.level, 2);
		assert.equal(ch.proficiency, 2);
		assert.equal(ch.traits.agility, c.traits.agility + 1);
		assert.equal(ch.traits.knowledge, c.traits.knowledge + 1);
		for (const t of ['strength', 'finesse', 'instinct', 'presence']) assert.equal(ch.traits[t], c.traits[t]);
		assert.deepEqual(sorted(ch.markedTraits), ['agility', 'knowledge']);
		assert.equal(ch.experiences.find((e) => e.id === id1).modifier, 3);
		assert.equal(ch.experiences.find((e) => e.id === id2).modifier, 3);
		const tb = ch.experiences.filter((e) => e.name === 'Tavern brawler');
		assert.equal(tb.length, 1);
		assert.equal(tb[0].modifier, 2);
		assert.equal(ch.experiences.length, 3);
		assert.ok(ch.cards.includes(card.id));
		assert.equal(ch.advancements.length, 2);
		for (const a of ch.advancements) {
			assert.equal(a.level, 2);
			assert.equal(a.tier, 2);
		}
		assert.deepEqual(sorted(ch.advancements.map((a) => a.option)), ['experiences', 'traits']);
	};
	check(res.character);
	check(await getChar(c.id));
});

test('character is already at the maximum level (GET and POST)', async () => {
	const c = await create({ level: 10 });
	const g = await send('GET', `/api/characters/${c.id}/level-up`);
	assert.equal(g.status, 400);
	assert.deepEqual(await g.json(), { error: 'character is already at the maximum level' });
	await refused(c, { advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: 'x' },
		'character is already at the maximum level');
});

test('class must be an SRD class (GET and POST)', async () => {
	const c = await create({ cls: 'Kitchen wizard' });
	const g = await send('GET', `/api/characters/${c.id}/level-up`);
	assert.equal(g.status, 400);
	assert.deepEqual(await g.json(), { error: 'class must be an SRD class' });
	await refused(c, { newExperience: 'Cook', advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: 'x' },
		'class must be an SRD class');
});

test('newExperience is required at this level', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(c, { advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: card },
		'newExperience is required at this level');
});

test('newExperience is not allowed at this level', async () => {
	const c = await create({ level: 2 });
	const [card] = await cardsAt(c.id);
	await refused(c, { newExperience: 'Cook', advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: card },
		'newExperience is not allowed at this level');
});

test('advancements must spend exactly two slots', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(c, { newExperience: 'Cook', advancements: [{ option: 'hp' }], domainCard: card },
		'advancements must spend exactly two slots');
});

test('advancement is not available: <option>', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(c, { newExperience: 'Cook', advancements: [{ option: 'proficiency' }], domainCard: card },
		'advancement is not available: proficiency');
});

test('traits must be two different unmarked traits', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(
		c,
		{ newExperience: 'Cook', advancements: [{ option: 'traits', traits: ['agility', 'agility'] }, { option: 'hp' }], domainCard: card },
		'traits must be two different unmarked traits'
	);
});

test('experiences must be two different experiences of this character', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(
		c,
		{
			newExperience: 'Cook',
			advancements: [{ option: 'experiences', experiences: [expId(c, 'Bodyguard'), 'not-an-experience'] }, { option: 'hp' }],
			domainCard: card
		},
		'experiences must be two different experiences of this character'
	);
});

test('cardId is not an eligible card', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(
		c,
		{ newExperience: 'Cook', advancements: [{ option: 'card', cardId: 'not-a-card' }, { option: 'hp' }], domainCard: card },
		'cardId is not an eligible card'
	);
});

test('domainCard is not an eligible card', async () => {
	const c = await create();
	await refused(c, { newExperience: 'Cook', advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: 'not-a-card' },
		'domainCard is not an eligible card');
});

test('the two cards must be different', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(
		c,
		{ newExperience: 'Cook', advancements: [{ option: 'card', cardId: card }, { option: 'hp' }], domainCard: card },
		'the two cards must be different'
	);
});

test('experience already exists: a new Experience with a name the character has', async () => {
	const c = await create();
	const [card] = await cardsAt(c.id);
	await refused(c, { newExperience: 'Bodyguard', advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: card },
		'experience already exists');
});

test('a character has at most 10 experiences', async () => {
	const names = Array.from({ length: 10 }, (_, i) => `Experience ${i + 1}`);
	const c = await create({ experiences: names });
	assert.equal(c.experiences.length, 10);
	const [card] = await cardsAt(c.id);
	await refused(c, { newExperience: 'Cook', advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: card },
		'a character has at most 10 experiences');
});

/** Levels a fresh character 1 to 4: traits agility+knowledge at 2, strength+finesse at 4. */
async function toLevel4() {
	const c = await create();
	let [card] = await cardsAt(c.id);
	await levelUp(c.id, {
		newExperience: 'Tavern brawler',
		advancements: [
			{ option: 'traits', traits: ['agility', 'knowledge'] },
			{ option: 'experiences', experiences: [expId(c, 'Bodyguard'), expId(c, 'Blacksmith')] }
		],
		domainCard: card
	});
	[card] = await cardsAt(c.id);
	await levelUp(c.id, { advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: card });
	[card] = await cardsAt(c.id);
	const ch = await levelUp(c.id, {
		advancements: [{ option: 'traits', traits: ['strength', 'finesse'] }, { option: 'evasion' }],
		domainCard: card
	});
	assert.equal(ch.level, 4);
	assert.equal(ch.proficiency, 2);
	assert.deepEqual(sorted(ch.markedTraits), ['agility', 'finesse', 'knowledge', 'strength']);
	return ch;
}

test('4 to 5 accepts traits marked earlier; markedTraits then holds only the level-5 traits', async () => {
	const c = await toLevel4();
	const p = await plan(c.id);
	assert.equal(p.toLevel, 5);
	const [card] = p.cards.map((x) => x.id);
	const ch = await levelUp(c.id, {
		newExperience: 'Sailor',
		advancements: [{ option: 'traits', traits: ['agility', 'strength'] }, { option: 'hp' }],
		domainCard: card
	});
	assert.equal(ch.level, 5);
	assert.equal(ch.traits.agility, c.traits.agility + 1);
	assert.equal(ch.traits.strength, c.traits.strength + 1);
	assert.deepEqual(sorted(ch.markedTraits), ['agility', 'strength']);
	assert.deepEqual(sorted((await getChar(c.id)).markedTraits), ['agility', 'strength']);
});

test('4 to 5 with proficiency alone gives proficiency 4 and two {level:5, tier:3, option:proficiency} entries', async () => {
	const c = await toLevel4();
	const [card] = await cardsAt(c.id);
	const ch = await levelUp(c.id, { newExperience: 'Sailor', advancements: [{ option: 'proficiency' }], domainCard: card });
	const check = (x) => {
		assert.equal(x.level, 5);
		assert.equal(x.proficiency, 4);
		const entries = x.advancements.filter((a) => a.level === 5);
		assert.deepEqual(entries, [
			{ level: 5, tier: 3, option: 'proficiency' },
			{ level: 5, tier: 3, option: 'proficiency' }
		]);
	};
	check(ch);
	check(await getChar(c.id));
});

test('unknown id: GET and POST answer 404 character not found', async () => {
	const g = await send('GET', '/api/characters/no-such-character/level-up');
	assert.equal(g.status, 404);
	assert.deepEqual(await g.json(), { error: 'character not found' });
	const p = await post('no-such-character', {
		newExperience: 'Cook',
		advancements: [{ option: 'hp' }, { option: 'stress' }],
		domainCard: 'x'
	});
	assert.equal(p.status, 404);
	assert.deepEqual(await p.json(), { error: 'character not found' });
});
