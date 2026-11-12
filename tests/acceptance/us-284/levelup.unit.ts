import { describe, expect, it } from 'vitest';
import * as levelup from '../../../src/lib/server/features/levelup';
import { armorStats } from '../../../src/lib/server/features/characters';
import { cardGroups, domainsOfClass } from '../../../src/lib/server/features/srd';

const { levelUpBodySchema, checkLevelUp, applyLevelUp, eligibleCards } = levelup as any;

const KNOWLEDGE = 'core_subclass_school_of_knowledge';
const ARMOR = 'core_armor_gambeson_armor';
const E1 = '00000000-0000-0000-0000-0000000000e1';
const E2 = '00000000-0000-0000-0000-0000000000e2';
const OTHER = '00000000-0000-0000-0000-0000000000f9';

type Adv = { level: number; tier: number; option: string };

/** A CharacterJson-shaped Wizard: SRD class and subclass, two Experiences at +1, Evasion 10, HP 6, Stress 6. */
function wizard(over: Record<string, any> = {}): any {
	const level = over.level ?? 1;
	return {
		id: '00000000-0000-0000-0000-000000000001',
		campaignId: '00000000-0000-0000-0000-000000000002',
		name: 'Ana',
		class: 'Wizard',
		domains: ['CODEX', 'SPLENDOR'],
		level,
		evasion: 10,
		majorThreshold: level,
		severeThreshold: 2 * level,
		hp: { marked: 0, max: 6 },
		stress: { marked: 0, max: 6 },
		hope: 2,
		armor: { marked: 0, max: 0 },
		conditions: { vulnerable: false, restrained: false, hidden: false },
		notes: '',
		gold: { handfuls: 0, bags: 0, chests: 0 },
		subclass: KNOWLEDGE,
		ancestry: null,
		community: null,
		cards: [],
		traits: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
		primaryWeapon: null,
		secondaryWeapon: null,
		armorId: null,
		proficiency: level >= 8 ? 4 : level >= 5 ? 3 : level >= 2 ? 2 : 1,
		advancements: [] as Adv[],
		markedTraits: [],
		experiences: [
			{ id: E1, name: 'Scholar', modifier: 1 },
			{ id: E2, name: 'Liar', modifier: 1 }
		],
		items: [],
		down: false,
		...over
	};
}

const MILESTONES = [2, 5, 8];

/** An eligible domain card id for `c` at its next level, not in `exclude`. */
function card(c: any, exclude: string[] = []): string {
	const list = eligibleCards(c, c.level + 1, exclude);
	expect(list.length, 'an eligible card exists').toBeGreaterThan(0);
	return list[0].id;
}

/** A body for `c` with the given picks; newExperience only at new levels 2, 5 and 8. */
function body(c: any, advancements: any[], extra: Record<string, any> = {}): any {
	const b: any = { advancements, domainCard: card(c, advancements.map((a) => a.cardId).filter(Boolean)) };
	if (MILESTONES.includes(c.level + 1)) b.newExperience = 'Sailor';
	return { ...b, ...extra };
}

/** checkLevelUp must pass; returns applyLevelUp's result. */
function applied(c: any, b: any) {
	expect(checkLevelUp(c, b)).toBeNull();
	return applyLevelUp(c, b);
}

/** A `set` column, under its Drizzle property name or its SQL column name. */
function col(set: any, camel: string, snake: string) {
	return camel in set ? set[camel] : set[snake];
}
/** A trait value in `set`: a column per trait, or a traits object. */
function setTrait(set: any, t: string) {
	return t in set ? set[t] : set.traits?.[t];
}
/** The advancement entries a level-up appended. */
function newEntries(c: any, r: any): Adv[] {
	const all = r.set.advancements as Adv[];
	expect(all.slice(0, c.advancements.length)).toEqual(c.advancements);
	return all.slice(c.advancements.length);
}
const sortAdv = (a: Adv[]) => [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));

function schemaError(input: any): string | null {
	const r = levelUpBodySchema.safeParse(input);
	return r.success ? null : r.error.issues[0].message;
}

describe('levelUpBodySchema', () => {
	it('accepts a valid body', () => {
		expect(
			schemaError({
				newExperience: 'Sailor',
				advancements: [{ option: 'traits', traits: ['agility', 'strength'] }, { option: 'card', cardId: 'x' }],
				domainCard: 'y'
			})
		).toBeNull();
		expect(schemaError({ advancements: [{ option: 'proficiency' }], domainCard: 'y' })).toBeNull();
		expect(schemaError({ advancements: [{ option: 'experiences', experiences: [E1, E2] }, { option: 'hp' }], domainCard: 'y' })).toBeNull();
	});
	it('newExperience is a strField of 1 to 100 characters', () => {
		const base = { advancements: [{ option: 'hp' }, { option: 'stress' }], domainCard: 'y' };
		expect(schemaError({ ...base, newExperience: '' })).toBe('newExperience must be 1 to 100 characters');
		expect(schemaError({ ...base, newExperience: '   ' })).toBe('newExperience must be 1 to 100 characters');
		expect(schemaError({ ...base, newExperience: 'a'.repeat(101) })).toBe('newExperience must be 1 to 100 characters');
		expect(schemaError({ ...base, newExperience: 'a'.repeat(100) })).toBeNull();
		expect(schemaError({ ...base, newExperience: 3 })).toBe('newExperience must be a string');
	});
	it('wrong array lengths: advancements must spend exactly two slots', () => {
		expect(schemaError({ advancements: [], domainCard: 'y' })).toBe('advancements must spend exactly two slots');
		expect(schemaError({ advancements: [{ option: 'hp' }, { option: 'hp' }, { option: 'hp' }], domainCard: 'y' })).toBe(
			'advancements must spend exactly two slots'
		);
	});
	it('an unknown option multiclass: advancement is not available: multiclass', () => {
		expect(schemaError({ advancements: [{ option: 'multiclass' }, { option: 'hp' }], domainCard: 'y' })).toBe(
			'advancement is not available: multiclass'
		);
	});
});

describe('1 to 2 with newExperience and two valid one-slot picks', () => {
	const c = wizard();
	const b = () => body(c, [{ option: 'hp' }, { option: 'evasion' }]);
	it('checkLevelUp is null', () => {
		expect(checkLevelUp(c, b())).toBeNull();
	});
	it('applyLevelUp gives level 2, proficiency 2, newExperience modifier 2', () => {
		const r = applyLevelUp(c, b());
		expect(r.set.level).toBe(2);
		expect(r.set.proficiency).toBe(2);
		expect(r.newExperience).toEqual({ name: 'Sailor', modifier: 2 });
		expect(r.bumpExperiences).toEqual([]);
	});
	it('applies the picks to set and records them in tier 2', () => {
		const bb = b();
		const r = applyLevelUp(c, bb);
		expect(col(r.set, 'hpMax', 'hp_max')).toBe(7);
		expect(r.set.evasion).toBe(11);
		expect(r.set.cards).toEqual([bb.domainCard]);
		expect(sortAdv(newEntries(c, r))).toEqual(
			sortAdv([
				{ level: 2, tier: 2, option: 'hp' },
				{ level: 2, tier: 2, option: 'evasion' }
			])
		);
	});
	it('before and after Stats', () => {
		const r = applyLevelUp(c, b());
		expect(r.before).toMatchObject({
			level: 1,
			proficiency: 1,
			hpMax: 6,
			stressMax: 6,
			evasion: 10,
			majorThreshold: 1,
			severeThreshold: 2,
			traits: c.traits
		});
		expect(r.after).toMatchObject({
			level: 2,
			proficiency: 2,
			hpMax: 7,
			stressMax: 6,
			evasion: 11,
			majorThreshold: 2,
			severeThreshold: 4,
			traits: c.traits
		});
	});
	it('does not mutate the character', () => {
		const copy = structuredClone(c);
		applyLevelUp(c, b());
		expect(c).toEqual(copy);
	});
});

describe('newExperience at the achievement levels only', () => {
	it('1 to 2 without newExperience: newExperience is required at this level', () => {
		const c = wizard();
		const b = body(c, [{ option: 'hp' }, { option: 'evasion' }]);
		delete b.newExperience;
		expect(checkLevelUp(c, b)).toBe('newExperience is required at this level');
	});
	it('4 to 5 and 7 to 8 without newExperience: required too', () => {
		for (const level of [4, 7]) {
			const c = wizard({ level });
			const b = body(c, [{ option: 'hp' }, { option: 'stress' }]);
			delete b.newExperience;
			expect(checkLevelUp(c, b), `level ${level}`).toBe('newExperience is required at this level');
		}
	});
	it('2 to 3 with newExperience: newExperience is not allowed at this level', () => {
		const c = wizard({ level: 2 });
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'evasion' }], { newExperience: 'Sailor' }))).toBe(
			'newExperience is not allowed at this level'
		);
	});
	it('2 to 3 without it passes; proficiency stays and no newExperience', () => {
		const c = wizard({ level: 2 });
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'stress' }]));
		expect(r.set.level).toBe(3);
		expect(r.set.proficiency).toBe(2);
		expect(r.newExperience).toBeUndefined();
		expect(col(r.set, 'stressMax', 'stress_max')).toBe(7);
		expect(r.after.stressMax).toBe(7);
	});
});

describe('marked traits are cleared at 5 and 8', () => {
	for (const level of [4, 7]) {
		it(`${level} to ${level + 1}: agility and strength marked, a traits pick of both passes`, () => {
			const c = wizard({ level, markedTraits: ['agility', 'strength'] });
			const r = applied(c, body(c, [{ option: 'traits', traits: ['agility', 'strength'] }, { option: 'hp' }]));
			expect([...col(r.set, 'markedTraits', 'marked_traits')].sort()).toEqual(['agility', 'strength']);
			expect(setTrait(r.set, 'agility')).toBe(3);
			expect(setTrait(r.set, 'strength')).toBe(2);
			expect(r.after.traits).toMatchObject({ agility: 3, strength: 2, finesse: 1 });
			expect(r.before.traits).toMatchObject({ agility: 2, strength: 1 });
		});
	}
	it('4 to 5 with no traits pick: marked traits become empty', () => {
		const c = wizard({ level: 4, markedTraits: ['agility', 'strength'] });
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'stress' }]));
		expect(col(r.set, 'markedTraits', 'marked_traits')).toEqual([]);
	});
	it('2 to 3: picked traits are added to the marked ones', () => {
		const c = wizard({ level: 2, markedTraits: ['agility'] });
		const r = applied(c, body(c, [{ option: 'traits', traits: ['finesse', 'instinct'] }, { option: 'hp' }]));
		expect([...col(r.set, 'markedTraits', 'marked_traits')].sort()).toEqual(['agility', 'finesse', 'instinct']);
		expect(setTrait(r.set, 'finesse')).toBe(2);
		expect(setTrait(r.set, 'instinct')).toBe(1);
		expect(setTrait(r.set, 'agility')).toBe(2);
	});
	it('two traits picks with four different traits raise all four', () => {
		const c = wizard({ level: 2 });
		const r = applied(
			c,
			body(c, [
				{ option: 'traits', traits: ['agility', 'strength'] },
				{ option: 'traits', traits: ['presence', 'knowledge'] }
			])
		);
		expect(r.after.traits).toEqual({ agility: 3, strength: 2, finesse: 1, instinct: 0, presence: 1, knowledge: 0 });
		expect([...col(r.set, 'markedTraits', 'marked_traits')].sort()).toEqual(['agility', 'knowledge', 'presence', 'strength']);
	});
});

describe('slots and proficiency', () => {
	it('a single one-slot pick: advancements must spend exactly two slots', () => {
		const c = wizard({ level: 2 });
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }]))).toBe('advancements must spend exactly two slots');
	});
	it('proficiency plus another pick: advancements must spend exactly two slots', () => {
		const c = wizard({ level: 4 });
		expect(checkLevelUp(c, body(c, [{ option: 'proficiency' }, { option: 'hp' }]))).toBe(
			'advancements must spend exactly two slots'
		);
	});
	it('proficiency at 1 to 2: advancement is not available: proficiency', () => {
		const c = wizard();
		expect(checkLevelUp(c, body(c, [{ option: 'proficiency' }]))).toBe('advancement is not available: proficiency');
	});
	it('proficiency alone at 4 to 5 passes, writes two tier-3 entries, proficiency 2 to 4', () => {
		const c = wizard({ level: 4 });
		expect(c.proficiency).toBe(2);
		const r = applied(c, body(c, [{ option: 'proficiency' }]));
		expect(newEntries(c, r)).toEqual([
			{ level: 5, tier: 3, option: 'proficiency' },
			{ level: 5, tier: 3, option: 'proficiency' }
		]);
		expect(r.set.proficiency).toBe(4);
		expect(r.before.proficiency).toBe(2);
		expect(r.after.proficiency).toBe(4);
	});
	it('proficiency at 5 to 6 (no achievement) adds 1 only', () => {
		const c = wizard({ level: 5 });
		const r = applied(c, body(c, [{ option: 'proficiency' }]));
		expect(r.set.proficiency).toBe(4);
	});
	it('a second pick is checked against the first: two evasion picks are refused', () => {
		const c = wizard();
		expect(checkLevelUp(c, body(c, [{ option: 'evasion' }, { option: 'evasion' }]))).toBe(
			'advancement is not available: evasion'
		);
	});
});

describe('used slots carry over tiers', () => {
	const adv = [{ level: 2, tier: 2, option: 'evasion' }];
	it('evasion at 3 to 4 with a tier-2 evasion entry: advancement is not available: evasion', () => {
		const c = wizard({ level: 3, evasion: 11, advancements: adv });
		expect(checkLevelUp(c, body(c, [{ option: 'evasion' }, { option: 'hp' }]))).toBe(
			'advancement is not available: evasion'
		);
	});
	it('at 4 to 5 it passes and is recorded with tier 3', () => {
		const c = wizard({ level: 4, evasion: 11, advancements: adv });
		const r = applied(c, body(c, [{ option: 'evasion' }, { option: 'stress' }]));
		expect(newEntries(c, r)).toContainEqual({ level: 5, tier: 3, option: 'evasion' });
		expect(r.set.evasion).toBe(12);
	});
});

describe('lowest tier first', () => {
	it('4 to 5 with no earlier hp entries: two hp picks are both recorded with tier 2', () => {
		const c = wizard({ level: 4 });
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'hp' }]));
		expect(newEntries(c, r)).toEqual([
			{ level: 5, tier: 2, option: 'hp' },
			{ level: 5, tier: 2, option: 'hp' }
		]);
		expect(col(r.set, 'hpMax', 'hp_max')).toBe(8);
		expect(r.after.hpMax).toBe(8);
	});
	it('4 to 5 with one tier-2 hp entry: the two hp picks go to tier 2 then tier 3', () => {
		const c = wizard({ level: 4, hp: { marked: 0, max: 7 }, advancements: [{ level: 2, tier: 2, option: 'hp' }] });
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'hp' }]));
		expect(sortAdv(newEntries(c, r))).toEqual(
			sortAdv([
				{ level: 5, tier: 2, option: 'hp' },
				{ level: 5, tier: 3, option: 'hp' }
			])
		);
	});
});

describe('trackers stay at most 12, evasion below 30, subclass needs an SRD subclass', () => {
	it('hp.max 12: an hp pick is refused', () => {
		const c = wizard({ hp: { marked: 0, max: 12 } });
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'evasion' }]))).toBe('advancement is not available: hp');
	});
	it('hp.max 11: two hp picks are refused, one passes', () => {
		const c = wizard({ hp: { marked: 0, max: 11 } });
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'hp' }]))).toBe('advancement is not available: hp');
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'evasion' }]));
		expect(col(r.set, 'hpMax', 'hp_max')).toBe(12);
	});
	it('hp.max 10: two hp picks pass', () => {
		const c = wizard({ hp: { marked: 0, max: 10 } });
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'hp' }]))).toBeNull();
	});
	it('stress.max 12: a stress pick is refused; 11: two are refused', () => {
		const c12 = wizard({ stress: { marked: 0, max: 12 } });
		expect(checkLevelUp(c12, body(c12, [{ option: 'stress' }, { option: 'hp' }]))).toBe(
			'advancement is not available: stress'
		);
		const c11 = wizard({ stress: { marked: 0, max: 11 } });
		expect(checkLevelUp(c11, body(c11, [{ option: 'stress' }, { option: 'stress' }]))).toBe(
			'advancement is not available: stress'
		);
	});
	it('evasion 30: an evasion pick is refused', () => {
		const c = wizard({ evasion: 30 });
		expect(checkLevelUp(c, body(c, [{ option: 'evasion' }, { option: 'hp' }]))).toBe(
			'advancement is not available: evasion'
		);
	});
	it('subclass at 4 to 5: passes with an SRD subclass, recorded in tier 3', () => {
		const c = wizard({ level: 4 });
		const r = applied(c, body(c, [{ option: 'subclass' }, { option: 'hp' }]));
		expect(newEntries(c, r)).toContainEqual({ level: 5, tier: 3, option: 'subclass' });
	});
	it('subclass without an SRD subclass, or with two subclass entries: refused', () => {
		const none = wizard({ level: 4, subclass: null });
		expect(checkLevelUp(none, body(none, [{ option: 'subclass' }, { option: 'hp' }]))).toBe(
			'advancement is not available: subclass'
		);
		const two = wizard({
			level: 9,
			advancements: [
				{ level: 5, tier: 3, option: 'subclass' },
				{ level: 8, tier: 4, option: 'subclass' }
			]
		});
		expect(checkLevelUp(two, body(two, [{ option: 'subclass' }, { option: 'hp' }]))).toBe(
			'advancement is not available: subclass'
		);
	});
});

describe('traits must be two different unmarked traits', () => {
	const MSG = 'traits must be two different unmarked traits';
	it('two traits picks sharing a trait', () => {
		const c = wizard({ level: 2 });
		expect(
			checkLevelUp(
				c,
				body(c, [
					{ option: 'traits', traits: ['agility', 'strength'] },
					{ option: 'traits', traits: ['strength', 'finesse'] }
				])
			)
		).toBe(MSG);
	});
	it('a marked trait', () => {
		const c = wizard({ level: 2, markedTraits: ['agility'] });
		expect(checkLevelUp(c, body(c, [{ option: 'traits', traits: ['agility', 'finesse'] }, { option: 'hp' }]))).toBe(MSG);
	});
	it('the same trait twice', () => {
		const c = wizard({ level: 2 });
		expect(checkLevelUp(c, body(c, [{ option: 'traits', traits: ['finesse', 'finesse'] }, { option: 'hp' }]))).toBe(MSG);
	});
	it('a trait at +5, a name that is not a trait, or a missing list', () => {
		const c = wizard({ level: 2, traits: { agility: 5, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 } });
		expect(checkLevelUp(c, body(c, [{ option: 'traits', traits: ['agility', 'finesse'] }, { option: 'hp' }]))).toBe(MSG);
		expect(checkLevelUp(c, body(c, [{ option: 'traits', traits: ['charm', 'finesse'] }, { option: 'hp' }]))).toBe(MSG);
		expect(checkLevelUp(c, body(c, [{ option: 'traits' }, { option: 'hp' }]))).toBe(MSG);
	});
});

describe('experiences must be two different experiences of this character', () => {
	const MSG = 'experiences must be two different experiences of this character';
	it('an experience id of another character', () => {
		const c = wizard({ level: 2 });
		expect(checkLevelUp(c, body(c, [{ option: 'experiences', experiences: [E1, OTHER] }, { option: 'hp' }]))).toBe(MSG);
	});
	it('the same id twice', () => {
		const c = wizard({ level: 2 });
		expect(checkLevelUp(c, body(c, [{ option: 'experiences', experiences: [E1, E1] }, { option: 'hp' }]))).toBe(MSG);
	});
	it('an experience at +5', () => {
		const c = wizard({
			level: 2,
			experiences: [
				{ id: E1, name: 'Scholar', modifier: 5 },
				{ id: E2, name: 'Liar', modifier: 1 }
			]
		});
		expect(checkLevelUp(c, body(c, [{ option: 'experiences', experiences: [E1, E2] }, { option: 'hp' }]))).toBe(MSG);
	});
	it('two different own experiences pass and are bumped', () => {
		const c = wizard({ level: 2 });
		const r = applied(c, body(c, [{ option: 'experiences', experiences: [E1, E2] }, { option: 'hp' }]));
		expect([...r.bumpExperiences].sort()).toEqual([E1, E2].sort());
	});
});

describe('cards must be eligible and different', () => {
	const domains = domainsOfClass('Wizard', 'en').map((d) => d.id);
	const all = cardGroups('Wizard', 'en').flatMap((g) => g.cards);
	const outside = all.find((x) => !domains.includes(x.domain) && x.level === 1)!.id;
	const above = all.find((x) => domains.includes(x.domain) && x.level === 3)!.id;
	const low = all.filter((x) => domains.includes(x.domain) && x.level === 1).map((x) => x.id);

	it('a card outside the class domains', () => {
		const c = wizard();
		expect(checkLevelUp(c, body(c, [{ option: 'card', cardId: outside }, { option: 'hp' }]))).toBe(
			'cardId is not an eligible card'
		);
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'evasion' }], { domainCard: outside }))).toBe(
			'domainCard is not an eligible card'
		);
	});
	it('a card above the new level', () => {
		const c = wizard();
		expect(checkLevelUp(c, body(c, [{ option: 'card', cardId: above }, { option: 'hp' }]))).toBe(
			'cardId is not an eligible card'
		);
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'evasion' }], { domainCard: above }))).toBe(
			'domainCard is not an eligible card'
		);
	});
	it('a card already held', () => {
		const c = wizard({ cards: [low[0]] });
		expect(checkLevelUp(c, body(c, [{ option: 'card', cardId: low[0] }, { option: 'hp' }]))).toBe(
			'cardId is not an eligible card'
		);
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }, { option: 'evasion' }], { domainCard: low[0] }))).toBe(
			'domainCard is not an eligible card'
		);
	});
	it('cardId equal to domainCard: the two cards must be different', () => {
		const c = wizard();
		expect(checkLevelUp(c, body(c, [{ option: 'card', cardId: low[0] }, { option: 'hp' }], { domainCard: low[0] }))).toBe(
			'the two cards must be different'
		);
	});
	it('a card pick then domainCard are appended to cards', () => {
		const c = wizard({ cards: [low[0]] });
		const r = applied(c, body(c, [{ option: 'card', cardId: low[1] }, { option: 'hp' }], { domainCard: low[2] }));
		expect(r.set.cards).toEqual([low[0], low[1], low[2]]);
	});
});

describe('checks run in the stated order', () => {
	it('level 10 comes first', () => {
		const c = wizard({ level: 10, class: 'Wizardish' });
		expect(checkLevelUp(c, { advancements: [{ option: 'hp' }], domainCard: 'nope' })).toBe(
			'character is already at the maximum level'
		);
	});
	it('a non-SRD class comes next', () => {
		const c = wizard({ class: 'Wizardish', domains: [], subclass: null });
		expect(checkLevelUp(c, { advancements: [{ option: 'hp' }], domainCard: 'nope' })).toBe('class must be an SRD class');
	});
	it('newExperience before slots, slots before availability, availability before traits and cards', () => {
		const c = wizard();
		expect(checkLevelUp(c, { advancements: [{ option: 'hp' }], domainCard: 'nope' })).toBe(
			'newExperience is required at this level'
		);
		expect(checkLevelUp(c, { newExperience: 'Sailor', advancements: [{ option: 'hp' }], domainCard: 'nope' })).toBe(
			'advancements must spend exactly two slots'
		);
		expect(
			checkLevelUp(c, {
				newExperience: 'Sailor',
				advancements: [{ option: 'proficiency' }],
				domainCard: 'nope'
			})
		).toBe('advancement is not available: proficiency');
		expect(
			checkLevelUp(c, {
				newExperience: 'Sailor',
				advancements: [{ option: 'traits', traits: ['agility', 'agility'] }, { option: 'card', cardId: 'nope' }],
				domainCard: 'nope'
			})
		).toBe('traits must be two different unmarked traits');
		expect(
			checkLevelUp(c, {
				newExperience: 'Sailor',
				advancements: [{ option: 'card', cardId: 'nope' }, { option: 'hp' }],
				domainCard: 'nope'
			})
		).toBe('cardId is not an eligible card');
	});
});

describe('thresholds after', () => {
	it('armored: the values of armorStats', () => {
		const c = wizard({ level: 4, armorId: ARMOR, majorThreshold: 9, severeThreshold: 20 });
		const s = armorStats(ARMOR, 5);
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'stress' }]));
		expect(r.after).toMatchObject({ majorThreshold: s.majorThreshold, severeThreshold: s.severeThreshold });
		expect(col(r.set, 'majorThreshold', 'major_threshold')).toBe(s.majorThreshold);
		expect(col(r.set, 'severeThreshold', 'severe_threshold')).toBe(s.severeThreshold);
		expect(r.before).toMatchObject({ majorThreshold: 9, severeThreshold: 20 });
	});
	it('unarmored 2/4 at level 2 gives 3/6', () => {
		const c = wizard({ level: 2 });
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'stress' }]));
		expect(r.after).toMatchObject({ majorThreshold: 3, severeThreshold: 6 });
		expect(col(r.set, 'majorThreshold', 'major_threshold')).toBe(3);
		expect(col(r.set, 'severeThreshold', 'severe_threshold')).toBe(6);
	});
	it('hand-entered 7/15 gives 8/16', () => {
		const c = wizard({ level: 2, majorThreshold: 7, severeThreshold: 15 });
		const r = applied(c, body(c, [{ option: 'hp' }, { option: 'stress' }]));
		expect(r.after).toMatchObject({ majorThreshold: 8, severeThreshold: 16 });
		expect(col(r.set, 'majorThreshold', 'major_threshold')).toBe(8);
		expect(col(r.set, 'severeThreshold', 'severe_threshold')).toBe(16);
	});
});
