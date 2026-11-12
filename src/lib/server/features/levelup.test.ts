import { describe, expect, it } from 'vitest';
import { armorStats, TRAITS, type CharacterJson } from './characters';
import { cardGroups } from './srd';
import {
	SLOTS,
	SLOT_COST,
	applyLevelUp,
	checkLevelUp,
	eligibleCards,
	levelUpBodySchema,
	planLevelUp,
	slotsLeft,
	thresholdsAfter,
	type LevelUpBody,
	type LevelUpPlan
} from './levelup';

function hero(over: Partial<CharacterJson> = {}): CharacterJson {
	const level = over.level ?? 1;
	return {
		id: 'x',
		campaignId: 'y',
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
		subclass: 'core_subclass_school_of_knowledge',
		ancestry: null,
		community: null,
		cards: [],
		traits: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
		primaryWeapon: null,
		secondaryWeapon: null,
		armorId: null,
		proficiency: 1,
		advancements: [],
		markedTraits: [],
		experiences: [
			{ id: 'e1', name: 'Scholar', modifier: 1 },
			{ id: 'e2', name: 'Liar', modifier: 1 }
		],
		items: [],
		down: false,
		...over
	} as CharacterJson;
}

const plan = (c: CharacterJson) => planLevelUp(c) as LevelUpPlan;
const names = (c: CharacterJson) => plan(c).options.map((o) => o.option);

describe('tables', () => {
	it('SLOTS and SLOT_COST', () => {
		expect(SLOTS.subclass).toEqual([0, 1, 1]);
		expect(SLOTS.traits).toEqual([3, 3, 3]);
		expect(SLOT_COST.proficiency).toBe(2);
		expect(SLOT_COST.hp).toBe(1);
	});
	it('slotsLeft subtracts used picks (proficiency counts two entries per pick)', () => {
		const c = hero({
			advancements: [
				{ level: 5, tier: 3, option: 'proficiency' },
				{ level: 5, tier: 3, option: 'proficiency' },
				{ level: 2, tier: 2, option: 'hp' }
			]
		});
		expect(slotsLeft(c, 'proficiency', 4)).toBe(1);
		expect(slotsLeft(c, 'hp', 2)).toBe(1);
		expect(slotsLeft(c, 'hp', 3)).toBe(3);
	});
});

describe('planLevelUp', () => {
	it('level 1 to 2', () => {
		const p = plan(hero());
		expect(p).toMatchObject({ fromLevel: 1, toLevel: 2, tier: 2, subclassNext: 'specialization' });
		expect(p.achievements).toEqual({ experience: true, proficiency: true, clearTraits: false });
		expect(p.options.map((o) => [o.option, o.slotsLeft, o.slots])).toEqual([
			['traits', 3, 1],
			['hp', 2, 1],
			['stress', 2, 1],
			['experiences', 1, 1],
			['card', 1, 1],
			['evasion', 1, 1]
		]);
	});
	it('subclass and proficiency from level 4', () => {
		expect(names(hero({ level: 3 }))).not.toContain('proficiency');
		const p = plan(hero({ level: 4 }));
		expect(p.options.find((o) => o.option === 'proficiency')).toEqual({ option: 'proficiency', slotsLeft: 1, slots: 2 });
		expect(p.options.find((o) => o.option === 'subclass')).toBeTruthy();
	});
	it('hides options whose effect cannot apply', () => {
		expect(names(hero({ hp: { marked: 0, max: 12 } }))).not.toContain('hp');
		expect(names(hero({ stress: { marked: 0, max: 12 } }))).not.toContain('stress');
		expect(names(hero({ evasion: 30 }))).not.toContain('evasion');
		expect(names(hero({ experiences: [{ id: 'e', name: 'A', modifier: 1 }] }))).not.toContain('experiences');
		expect(names(hero({ level: 3, markedTraits: ['agility', 'strength', 'finesse', 'instinct', 'presence'] }))).not.toContain(
			'traits'
		);
	});
	it('clears marked traits at 5 and 8 only', () => {
		const marked = ['agility', 'strength'] as CharacterJson['markedTraits'];
		expect(plan(hero({ level: 3, markedTraits: marked })).unmarkedTraits).toEqual(['finesse', 'instinct', 'presence', 'knowledge']);
		expect(plan(hero({ level: 7, markedTraits: marked })).unmarkedTraits).toEqual([...TRAITS]);
	});
	it('subclassNext follows subclass entries', () => {
		const one = [{ level: 5, tier: 3, option: 'subclass' as const }];
		expect(plan(hero({ level: 6, advancements: one })).subclassNext).toBe('mastery');
		expect(plan(hero({ subclass: null })).subclassNext).toBeNull();
	});
	it('refusals', () => {
		expect(planLevelUp(hero({ level: 10 }))).toBe('character is already at the maximum level');
		expect(planLevelUp(hero({ class: 'Wizardish' }))).toBe('class must be an SRD class');
	});
});

describe('thresholdsAfter', () => {
	it('armor, unarmored defaults and hand-entered values', () => {
		const id = 'core_armor_gambeson_armor';
		const s = armorStats(id, 5);
		expect(thresholdsAfter(hero({ level: 4, armorId: id }), 5)).toEqual({
			majorThreshold: s.majorThreshold,
			severeThreshold: s.severeThreshold
		});
		expect(thresholdsAfter(hero({ level: 3 }), 4)).toEqual({ majorThreshold: 4, severeThreshold: 8 });
		expect(thresholdsAfter(hero({ level: 3, majorThreshold: 7, severeThreshold: 15 }), 4)).toEqual({
			majorThreshold: 8,
			severeThreshold: 16
		});
	});
});

describe('eligibleCards', () => {
	it('class domains only, up to the level, not held, not excluded', () => {
		const all = cardGroups('Wizard', 'en')
			.filter((g) => ['CODEX', 'SPLENDOR'].includes(g.domain))
			.flatMap((g) => g.cards);
		const held = all.find((c) => c.level === 1)!.id;
		const excluded = all.find((c) => c.level === 2)!.id;
		const cards = eligibleCards(hero({ cards: [held] }), 3, [excluded]);
		expect(cards.length).toBeGreaterThan(0);
		for (const c of cards) {
			expect(['CODEX', 'SPLENDOR']).toContain(c.domain);
			expect(c.level).toBeLessThanOrEqual(3);
			expect(Object.keys(c).sort()).toEqual(['domain', 'id', 'level', 'name']);
		}
		expect(cards.map((c) => c.id)).not.toContain(held);
		expect(cards.map((c) => c.id)).not.toContain(excluded);
	});
});

describe('levelUpBodySchema', () => {
	const msg = (v: unknown) => {
		const r = levelUpBodySchema.safeParse(v);
		return r.success ? null : r.error.issues[0].message;
	};
	it('gives the contract messages', () => {
		expect(msg({ advancements: [{ option: 'proficiency' }], domainCard: 'y' })).toBeNull();
		expect(msg({ advancements: [], domainCard: 'y' })).toBe('advancements must spend exactly two slots');
		expect(msg({ advancements: 'hp', domainCard: 'y' })).toBe('advancements must spend exactly two slots');
		expect(msg({ advancements: [{ option: 'multiclass' }], domainCard: 'y' })).toBe(
			'advancement is not available: multiclass'
		);
		expect(
			msg({
				newExperience: ' ',
				advancements: [{ option: 'hp' }],
				domainCard: 'y'
			})
		).toBe('newExperience must be 1 to 100 characters');
	});
});

describe('checkLevelUp and applyLevelUp', () => {
	const domainCard = (c: CharacterJson, exclude: string[] = []) => eligibleCards(c, c.level + 1, exclude)[0].id;
	const body = (c: CharacterJson, advancements: LevelUpBody['advancements'], extra: Partial<LevelUpBody> = {}) => ({
		advancements,
		domainCard: domainCard(c),
		...([2, 5, 8].includes(c.level + 1) ? { newExperience: 'Sailor' } : {}),
		...extra
	});

	it('refuses in the stated order', () => {
		expect(checkLevelUp(hero({ level: 10 }), body(hero(), [{ option: 'hp' }]))).toBe(
			'character is already at the maximum level'
		);
		expect(
			checkLevelUp(hero({ class: 'Nope' }), {
				advancements: [],
				domainCard: 'x'
			})
		).toBe('class must be an SRD class');
		const c = hero();
		expect(
			checkLevelUp(c, {
				advancements: [{ option: 'hp' }, { option: 'hp' }],
				domainCard: 'x'
			})
		).toBe('newExperience is required at this level');
		expect(checkLevelUp(hero({ level: 2 }), body(hero({ level: 2 }), [{ option: 'hp' }], { newExperience: 'A' }))).toBe(
			'newExperience is not allowed at this level'
		);
		expect(checkLevelUp(c, body(c, [{ option: 'hp' }]))).toBe('advancements must spend exactly two slots');
		expect(checkLevelUp(c, body(c, [{ option: 'subclass' }, { option: 'hp' }]))).toBe(
			'advancement is not available: subclass'
		);
	});

	it('checks each pick against the state after the earlier one', () => {
		const c = hero({ stress: { marked: 0, max: 11 } });
		expect(checkLevelUp(c, body(c, [{ option: 'stress' }, { option: 'stress' }]))).toBe(
			'advancement is not available: stress'
		);
		const t = hero({ level: 2 });
		expect(
			checkLevelUp(
				t,
				body(t, [
					{ option: 'traits', traits: ['agility', 'strength'] },
					{ option: 'traits', traits: ['agility', 'finesse'] }
				])
			)
		).toBe('traits must be two different unmarked traits');
		const f = hero({ level: 4 });
		expect(
			checkLevelUp(
				f,
				body(f, [
					{ option: 'experiences', experiences: ['e1', 'e2'] },
					{ option: 'experiences', experiences: ['e1', 'e2'] }
				])
			)
		).toBe('experiences must be two different experiences of this character');
	});

	it('refuses ineligible or duplicated cards', () => {
		const c = hero();
		const id = domainCard(c);
		expect(checkLevelUp(c, body(c, [{ option: 'card' }, { option: 'hp' }]))).toBe('cardId is not an eligible card');
		expect(
			checkLevelUp(
				c,
				body(c, [{ option: 'hp' }, { option: 'stress' }], {
					domainCard: 'nope'
				})
			)
		).toBe('domainCard is not an eligible card');
		expect(
			checkLevelUp(
				c,
				body(c, [{ option: 'card', cardId: id }, { option: 'hp' }], {
					domainCard: id
				})
			)
		).toBe('the two cards must be different');
	});

	it('applies every effect at 4 to 5 and records the lowest free tier', () => {
		const c = hero({
			level: 4,
			proficiency: 2,
			markedTraits: ['agility'],
			advancements: [{ level: 2, tier: 2, option: 'evasion' }]
		});
		const b = body(c, [{ option: 'evasion' }, { option: 'experiences', experiences: ['e1', 'e2'] }]);
		expect(checkLevelUp(c, b)).toBeNull();
		const r = applyLevelUp(c, b);
		expect(r.set).toMatchObject({
			level: 5,
			proficiency: 3,
			evasion: 11,
			markedTraits: [],
			majorThreshold: 5,
			severeThreshold: 10
		});
		expect(r.set.cards).toEqual([b.domainCard]);
		expect(r.set.advancements.slice(1)).toEqual([
			{ level: 5, tier: 3, option: 'evasion' },
			{ level: 5, tier: 2, option: 'experiences' }
		]);
		expect(r.newExperience).toEqual({ name: 'Sailor', modifier: 2 });
		expect(r.bumpExperiences).toEqual(['e1', 'e2']);
		expect(r.before.experiences.map((e) => e.modifier)).toEqual([1, 1]);
		expect(r.after.experiences.map((e) => e.modifier)).toEqual([2, 2]);
		expect(c.advancements).toHaveLength(1);
	});
});
