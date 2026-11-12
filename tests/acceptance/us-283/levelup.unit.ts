import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as levelup from '../../../src/lib/server/features/levelup';
import { armorStats, TRAITS } from '../../../src/lib/server/features/characters';
import { cardGroups, domainsOfClass, getSrd } from '../../../src/lib/server/features/srd';

const { SLOTS, SLOT_COST, slotsLeft, thresholdsAfter, eligibleCards, planLevelUp } = levelup as any;
const ROOT = path.resolve(__dirname, '../../..');

const KNOWLEDGE = 'core_subclass_school_of_knowledge';
const ARMOR = 'core_armor_gambeson_armor';

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
		proficiency: 1,
		advancements: [] as Adv[],
		markedTraits: [],
		experiences: [
			{ id: '00000000-0000-0000-0000-0000000000e1', name: 'Scholar', modifier: 1 },
			{ id: '00000000-0000-0000-0000-0000000000e2', name: 'Liar', modifier: 1 }
		],
		items: [],
		down: false,
		...over
	};
}

const plan = (c: any) => {
	const p = planLevelUp(c);
	expect(typeof p, `planLevelUp returned ${JSON.stringify(p)}`).toBe('object');
	return p;
};
const optionNames = (p: any) => p.options.map((o: any) => o.option);
const optionOf = (p: any, name: string) => p.options.find((o: any) => o.option === name);

const TABLE_ORDER = ['traits', 'hp', 'stress', 'experiences', 'card', 'evasion', 'subclass', 'proficiency'];

describe('SLOTS and SLOT_COST equal the table', () => {
	it('SLOTS gives the picks per tier for tiers 2, 3 and 4', () => {
		expect(SLOTS).toEqual({
			traits: [3, 3, 3],
			hp: [2, 2, 2],
			stress: [2, 2, 2],
			experiences: [1, 1, 1],
			card: [1, 1, 1],
			evasion: [1, 1, 1],
			subclass: [0, 1, 1],
			proficiency: [0, 1, 1]
		});
	});
	it('SLOT_COST is 2 for proficiency and 1 for every other option', () => {
		expect(SLOT_COST).toEqual({
			traits: 1,
			hp: 1,
			stress: 1,
			experiences: 1,
			card: 1,
			evasion: 1,
			subclass: 1,
			proficiency: 2
		});
	});
});

describe('slotsLeft counts free picks over tiers 2..T', () => {
	it('sums the table over tiers 2..T with no advancements', () => {
		const c = wizard({ level: 9 });
		expect(slotsLeft(c, 'traits', 2)).toBe(3);
		expect(slotsLeft(c, 'traits', 4)).toBe(9);
		expect(slotsLeft(c, 'subclass', 2)).toBe(0);
		expect(slotsLeft(c, 'subclass', 3)).toBe(1);
		expect(slotsLeft(c, 'proficiency', 4)).toBe(2);
	});
	it('subtracts used entries, a proficiency pick being two entries', () => {
		const c = wizard({
			level: 7,
			advancements: [
				{ level: 2, tier: 2, option: 'traits' },
				{ level: 3, tier: 2, option: 'traits' },
				{ level: 5, tier: 3, option: 'proficiency' },
				{ level: 5, tier: 3, option: 'proficiency' }
			]
		});
		expect(slotsLeft(c, 'traits', 4)).toBe(7);
		expect(slotsLeft(c, 'proficiency', 3)).toBe(0);
		expect(slotsLeft(c, 'proficiency', 4)).toBe(1);
	});
});

describe('level 1 SRD character: the plan to level 2', () => {
	it('gives levels, tier, achievements, exactly the six tier-2 options and specialization next', () => {
		const p = plan(wizard());
		expect(p.fromLevel).toBe(1);
		expect(p.toLevel).toBe(2);
		expect(p.tier).toBe(2);
		expect(p.achievements).toEqual({ experience: true, proficiency: true, clearTraits: false });
		expect(p.options).toEqual([
			{ option: 'traits', slotsLeft: 3, slots: 1 },
			{ option: 'hp', slotsLeft: 2, slots: 1 },
			{ option: 'stress', slotsLeft: 2, slots: 1 },
			{ option: 'experiences', slotsLeft: 1, slots: 1 },
			{ option: 'card', slotsLeft: 1, slots: 1 },
			{ option: 'evasion', slotsLeft: 1, slots: 1 }
		]);
		expect(optionNames(p)).not.toContain('subclass');
		expect(optionNames(p)).not.toContain('proficiency');
		expect(p.subclassNext).toBe('specialization');
	});
	it('achievements follow the new level: experience/proficiency at 2, 5, 8; clearTraits at 5, 8', () => {
		for (let level = 1; level <= 9; level++) {
			const to = level + 1;
			const p = plan(wizard({ level }));
			expect(p.fromLevel).toBe(level);
			expect(p.toLevel).toBe(to);
			expect(p.tier).toBe(to <= 4 ? 2 : to <= 7 ? 3 : 4);
			expect(p.achievements, `to level ${to}`).toEqual({
				experience: [2, 5, 8].includes(to),
				proficiency: [2, 5, 8].includes(to),
				clearTraits: [5, 8].includes(to)
			});
		}
	});
	it('lists options in the order of the table', () => {
		const names = optionNames(plan(wizard({ level: 4 })));
		const idx = names.map((n: string) => TABLE_ORDER.indexOf(n));
		expect(idx.every((i: number) => i >= 0)).toBe(true);
		expect(idx).toEqual([...idx].sort((a, b) => a - b));
	});
});

describe('subclass and proficiency appear from level 4 (to 5)', () => {
	it('levels 1 to 3 (to 2..4) never list subclass or proficiency', () => {
		for (const level of [1, 2, 3]) {
			const names = optionNames(plan(wizard({ level })));
			expect(names, `level ${level}`).not.toContain('subclass');
			expect(names, `level ${level}`).not.toContain('proficiency');
		}
	});
	it('level 4 (to 5) lists subclass and proficiency, proficiency with slots 2', () => {
		const p = plan(wizard({ level: 4 }));
		expect(optionOf(p, 'subclass')).toEqual({ option: 'subclass', slotsLeft: 1, slots: 1 });
		expect(optionOf(p, 'proficiency')).toEqual({ option: 'proficiency', slotsLeft: 1, slots: 2 });
	});
	it('levels 5 to 9 still list them with free slots', () => {
		for (const level of [5, 6, 7, 8, 9]) {
			const p = plan(wizard({ level }));
			expect(optionOf(p, 'subclass'), `level ${level}`).toBeTruthy();
			expect(optionOf(p, 'proficiency')?.slots, `level ${level}`).toBe(2);
		}
	});
	it('two proficiency entries in tier 3 use the tier-3 pick; tier 4 frees one', () => {
		const adv = [
			{ level: 5, tier: 3, option: 'proficiency' },
			{ level: 5, tier: 3, option: 'proficiency' }
		];
		expect(optionNames(plan(wizard({ level: 6, advancements: adv })))).not.toContain('proficiency');
		expect(optionOf(plan(wizard({ level: 7, advancements: adv })), 'proficiency')).toEqual({
			option: 'proficiency',
			slotsLeft: 1,
			slots: 2
		});
	});
});

describe('used slots carry over tiers', () => {
	const adv = [{ level: 2, tier: 2, option: 'evasion' }];
	it('one tier-2 evasion entry at level 3: evasion is absent', () => {
		expect(optionNames(plan(wizard({ level: 3, advancements: adv })))).not.toContain('evasion');
	});
	it('the same character at level 4 (to 5): evasion listed with slotsLeft 1', () => {
		expect(optionOf(plan(wizard({ level: 4, advancements: adv })), 'evasion')).toEqual({
			option: 'evasion',
			slotsLeft: 1,
			slots: 1
		});
	});
});

describe('hp and stress are hidden at their maximum of 12', () => {
	it('hp.max 12 hides hp; 11 keeps it', () => {
		expect(optionNames(plan(wizard({ hp: { marked: 0, max: 12 } })))).not.toContain('hp');
		expect(optionNames(plan(wizard({ hp: { marked: 0, max: 11 } })))).toContain('hp');
	});
	it('stress.max 12 hides stress; 11 keeps it', () => {
		expect(optionNames(plan(wizard({ stress: { marked: 0, max: 12 } })))).not.toContain('stress');
		expect(optionNames(plan(wizard({ stress: { marked: 0, max: 11 } })))).toContain('stress');
	});
});

describe('other options need an effect that can apply', () => {
	it('evasion 30 hides evasion; 29 keeps it', () => {
		expect(optionNames(plan(wizard({ evasion: 30 })))).not.toContain('evasion');
		expect(optionNames(plan(wizard({ evasion: 29 })))).toContain('evasion');
	});
	it('experiences needs two Experiences below +5', () => {
		const one = [{ id: '00000000-0000-0000-0000-0000000000e1', name: 'Scholar', modifier: 1 }];
		expect(optionNames(plan(wizard({ experiences: one })))).not.toContain('experiences');
		const capped = [
			{ id: '00000000-0000-0000-0000-0000000000e1', name: 'Scholar', modifier: 5 },
			{ id: '00000000-0000-0000-0000-0000000000e2', name: 'Liar', modifier: 4 }
		];
		expect(optionNames(plan(wizard({ experiences: capped })))).not.toContain('experiences');
	});
	it('traits needs two unmarked traits below +5', () => {
		const five = ['agility', 'strength', 'finesse', 'instinct', 'presence'];
		expect(optionNames(plan(wizard({ level: 3, markedTraits: five })))).not.toContain('traits');
		expect(optionNames(plan(wizard({ level: 3, markedTraits: five.slice(0, 4) })))).toContain('traits');
		const high = { agility: 5, strength: 5, finesse: 5, instinct: 5, presence: 5, knowledge: 1 };
		expect(optionNames(plan(wizard({ level: 3, traits: high })))).not.toContain('traits');
	});
	it('card needs at least one eligible card', () => {
		const held = cardGroups('Wizard', 'en')
			.filter((g) => ['CODEX', 'SPLENDOR'].includes(g.domain))
			.flatMap((g) => g.cards)
			.filter((c) => c.level <= 2)
			.map((c) => c.id);
		expect(held.length).toBeGreaterThan(0);
		const p = plan(wizard({ cards: held }));
		expect(optionNames(p)).not.toContain('card');
		expect(p.cards).toEqual([]);
	});
	it('subclass needs an SRD subclass: none means no option and subclassNext null', () => {
		const p = plan(wizard({ level: 4, subclass: null }));
		expect(optionNames(p)).not.toContain('subclass');
		expect(p.subclassNext).toBeNull();
	});
	it("one subclass entry: subclassNext 'mastery'; two: no option and null", () => {
		const one = [{ level: 5, tier: 3, option: 'subclass' }];
		const p1 = plan(wizard({ level: 7, advancements: one }));
		expect(p1.subclassNext).toBe('mastery');
		expect(optionOf(p1, 'subclass')).toEqual({ option: 'subclass', slotsLeft: 1, slots: 1 });
		const two = [...one, { level: 8, tier: 4, option: 'subclass' }];
		const p2 = plan(wizard({ level: 9, advancements: two }));
		expect(optionNames(p2)).not.toContain('subclass');
		expect(p2.subclassNext).toBeNull();
	});
});

describe('marked traits and the 5/8 clearing', () => {
	const marked = ['agility', 'strength'];
	it('at level 3, unmarkedTraits excludes the marked traits, in TRAITS order', () => {
		expect(plan(wizard({ level: 3, markedTraits: marked })).unmarkedTraits).toEqual([
			'finesse',
			'instinct',
			'presence',
			'knowledge'
		]);
	});
	it('at level 4 (to 5) and level 7 (to 8), all six traits are unmarked', () => {
		for (const level of [4, 7]) {
			expect(plan(wizard({ level, markedTraits: marked })).unmarkedTraits, `level ${level}`).toEqual([...TRAITS]);
		}
	});
	it('the clearing makes traits available again at level 4', () => {
		const five = ['agility', 'strength', 'finesse', 'instinct', 'presence'];
		expect(optionNames(plan(wizard({ level: 4, markedTraits: five })))).toContain('traits');
	});
});

describe('refusals', () => {
	it('level 10 gives the max-level message', () => {
		expect(planLevelUp(wizard({ level: 10 }))).toBe('character is already at the maximum level');
		expect(planLevelUp(wizard({ level: 10, class: 'Wizardish', domains: [] }))).toBe(
			'character is already at the maximum level'
		);
	});
	it("class 'Wizardish' (not SRD) gives the SRD class message", () => {
		expect(planLevelUp(wizard({ class: 'Wizardish', domains: [], subclass: null }))).toBe('class must be an SRD class');
	});
});

describe('thresholdsAfter', () => {
	it('with an SRD armor id, the thresholds of armorStats(id, newLevel)', () => {
		const s = armorStats(ARMOR, 5);
		expect(thresholdsAfter(wizard({ level: 4, armorId: ARMOR, majorThreshold: 9, severeThreshold: 20 }), 5)).toMatchObject({
			majorThreshold: s.majorThreshold,
			severeThreshold: s.severeThreshold
		});
	});
	it('unarmored at level 3 with 3/6: 4/8', () => {
		expect(thresholdsAfter(wizard({ level: 3, majorThreshold: 3, severeThreshold: 6 }), 4)).toMatchObject({
			majorThreshold: 4,
			severeThreshold: 8
		});
	});
	it('hand-entered 7/15: 8/16', () => {
		expect(thresholdsAfter(wizard({ level: 3, majorThreshold: 7, severeThreshold: 15 }), 4)).toMatchObject({
			majorThreshold: 8,
			severeThreshold: 16
		});
	});
	it('unarmored with only the major threshold equal to the level is hand-entered: both +1', () => {
		expect(thresholdsAfter(wizard({ level: 3, majorThreshold: 3, severeThreshold: 7 }), 4)).toMatchObject({
			majorThreshold: 4,
			severeThreshold: 8
		});
	});
});

describe('eligibleCards', () => {
	const domains = domainsOfClass('Wizard', 'en').map((d) => d.id);
	const all = cardGroups('Wizard', 'en')
		.filter((g) => domains.includes(g.domain))
		.flatMap((g) => g.cards);
	const held = all.find((c) => c.level === 1)!.id;
	const excluded = all.find((c) => c.level === 2)!.id;

	it('returns only class-domain cards up to newLevel, not held, not excluded, as {id, name, level, domain}', () => {
		const cards = eligibleCards(wizard({ level: 3, cards: [held] }), 4, [excluded]);
		const expected = all.filter((c) => c.level <= 4 && c.id !== held && c.id !== excluded).map((c) => c.id);
		expect(cards.map((c: any) => c.id).sort()).toEqual([...expected].sort());
		for (const c of cards) {
			const raw = getSrd('domain-cards', c.id, 'en')!;
			expect(typeof c.name).toBe('string');
			expect(c.level).toBe(Number(raw.level));
			expect(c.level).toBeLessThanOrEqual(4);
			expect(String(c.domain).toUpperCase()).toBe(String(raw.domain).toUpperCase());
			expect(domains).toContain(String(raw.domain));
		}
		expect(cards.map((c: any) => c.id)).not.toContain(held);
		expect(cards.map((c: any) => c.id)).not.toContain(excluded);
	});
	it('exclude defaults to none', () => {
		const ids = eligibleCards(wizard({ level: 1 }), 2).map((c: any) => c.id);
		expect(ids).toContain(excluded);
		expect(ids.sort()).toEqual(all.filter((c) => c.level <= 2).map((c) => c.id).sort());
	});
	it('planLevelUp cards equal eligibleCards(c, toLevel)', () => {
		const c = wizard({ level: 3, cards: [held] });
		expect(plan(c).cards.map((x: any) => x.id)).toEqual(eligibleCards(c, 4).map((x: any) => x.id));
	});
});

describe('module layout', () => {
	it('levelup.test.ts sits next to levelup.ts', () => {
		expect(fs.existsSync(path.join(ROOT, 'src/lib/server/features/levelup.test.ts'))).toBe(true);
	});
	it('characters.ts never imports levelup.ts', () => {
		const src = fs.readFileSync(path.join(ROOT, 'src/lib/server/features/characters.ts'), 'utf8');
		expect(src).not.toMatch(/from\s+['"][^'"]*levelup['"]/);
	});
	it('CLAUDE.md has a Layout row for src/lib/server/features/levelup.ts', () => {
		const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
		expect(md).toMatch(/^\|\s*`src\/lib\/server\/features\/levelup\.ts`\s*\|/m);
	});
});
