import { afterAll, describe, expect, it } from 'vitest';
import * as m from './characters';
import { createCampaign } from './campaigns';
import { getDb } from '../db';
import { eligibleCards, levelUp, newExperienceError, type LevelUpBody } from './levelup';

afterAll(async () => {
	await (await getDb()).close?.();
});

async function make(names = ['Bodyguard', 'Blacksmith']) {
	const camp = await createCampaign({ name: 'c' });
	const c = await m.insertCharacter(camp.id, {
		name: 'n', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10,
		maxHp: 6, maxStress: 6, armorSlots: 2
	} as m.CreateCharacter);
	for (const name of names) await m.addExperience(c.id, { name, modifier: 2 });
	return (await m.getCharacter(c.id))!;
}

const snap = (c: m.CharacterJson) => ({ level: c.level, traits: c.traits, markedTraits: c.markedTraits, advancements: c.advancements, experiences: c.experiences, cards: c.cards, proficiency: c.proficiency });

function body(c: m.CharacterJson, over: Partial<LevelUpBody> = {}): LevelUpBody {
	return {
		newExperience: 'Tavern brawler',
		advancements: [
			{ option: 'traits', traits: ['agility', 'knowledge'] },
			{ option: 'experiences', experiences: c.experiences.map((e: { id: string }) => e.id).slice(0, 2) }
		],
		domainCard: eligibleCards(c, 2).find((x) => x.level === 1)!.id,
		...over
	};
}

describe('newExperienceError', () => {
	it('refuses a full list and duplicate names ignoring case and spaces', () => {
		expect(newExperienceError([{ name: 'A' }], undefined)).toBeNull();
		expect(newExperienceError(Array.from({ length: 10 }, (_, i) => ({ name: `e${i}` })), 'x')).toBe('a character has at most 10 experiences');
		expect(newExperienceError([{ name: 'Tavern Brawler' }], '  tavern brawler ')).toBe('experience already exists');
		expect(newExperienceError([{ name: 'A' }], 'B')).toBeNull();
	});
});

describe('levelUp on PGlite', () => {
	it('applies every effect in one transaction', async () => {
		const c = await make();
		const b = body(c);
		const r = await levelUp(c.id, b);
		expect(r.status).toBe('ok');
		if (r.status !== 'ok') return;
		const ch = r.character;
		expect(ch.level).toBe(2);
		expect(ch.proficiency).toBe(2);
		expect(ch.traits.agility).toBe(c.traits.agility + 1);
		expect(ch.markedTraits).toEqual(['agility', 'knowledge']);
		expect(ch.experiences.map((e: { name: string; modifier: number }) => [e.name, e.modifier])).toEqual([
			['Bodyguard', 3], ['Blacksmith', 3], ['Tavern brawler', 2]
		]);
		expect(ch.cards).toEqual([b.domainCard]);
		expect(ch.advancements).toHaveLength(2);
		expect(await m.getCharacter(c.id)).toEqual(ch);
	});

	it('saves nothing on a refusal', async () => {
		const c = await make();
		expect(await levelUp(c.id, body(c, { newExperience: 'bodyguard' }))).toEqual({ status: 'invalid', error: 'experience already exists' });
		expect(await levelUp(c.id, body(c, { domainCard: 'nope' }))).toEqual({ status: 'invalid', error: 'domainCard is not an eligible card' });
		expect(snap((await m.getCharacter(c.id))!)).toEqual(snap(c));
		const full = await make(Array.from({ length: 10 }, (_, i) => `e${i}`));
		expect(await levelUp(full.id, body(full))).toEqual({ status: 'invalid', error: 'a character has at most 10 experiences' });
		expect(snap((await m.getCharacter(full.id))!)).toEqual(snap(full));
	});

	it('answers not-found for an unknown id', async () => {
		expect(await levelUp('nope', { advancements: [{ option: 'hp' }], domainCard: 'x' })).toEqual({ status: 'not-found' });
	});
});
