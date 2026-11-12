import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
	LEVELUP_STEPS,
	parseStep,
	readValues,
	levelUpBody,
	firstInvalid,
	stepOfField,
	fieldOfMessage,
	levelUpHref
} from '../../../src/routes/characters/[id]/level-up/flow';

const plan: any = {
	fromLevel: 4,
	toLevel: 5,
	tier: 3,
	achievements: { experience: false, proficiency: true, clearTraits: true },
	options: [
		{ option: 'traits', slotsLeft: 3, slots: 3 },
		{ option: 'hp', slotsLeft: 2, slots: 2 },
		{ option: 'experiences', slotsLeft: 1, slots: 1 },
		{ option: 'proficiency', slotsLeft: 1, slots: 1 },
		{ option: 'card', slotsLeft: 1, slots: 1 }
	],
	unmarkedTraits: ['agility', 'strength', 'knowledge', 'finesse', 'presence'],
	cards: [
		{ id: 'c1', name: 'One', level: 1, domain: 'blade' },
		{ id: 'c2', name: 'Two', level: 2, domain: 'blade' },
		{ id: 'c3', name: 'Three', level: 3, domain: 'bone' }
	],
	subclassNext: null
};
const milestone = { ...plan, achievements: { ...plan.achievements, experience: true } };

describe('LEVELUP_STEPS', () => {
	it('lists the five steps', () => {
		expect([...LEVELUP_STEPS]).toEqual(['achievements', 'advancements', 'details', 'card', 'review']);
	});
});

describe('parseStep', () => {
	it('parses 1..5, else 1', () => {
		expect(parseStep('3')).toBe(3);
		expect(parseStep('5')).toBe(5);
		expect(parseStep('9')).toBe(1);
		expect(parseStep('0')).toBe(1);
		expect(parseStep(null)).toBe(1);
		expect(parseStep('x')).toBe(1);
		expect(parseStep('2.5')).toBe(1);
	});
});

describe('readValues', () => {
	it('trims and defaults absent fields to empty', () => {
		const v: any = readValues(new URLSearchParams('newExperience=%20Brawl%20&pick1=hp'));
		expect(v.newExperience).toBe('Brawl');
		expect(v.pick1).toBe('hp');
		for (const k of ['pick2', 'p1trait1', 'p1trait2', 'p1exp1', 'p1exp2', 'p1card', 'p2trait1', 'p2trait2', 'p2exp1', 'p2exp2', 'p2card', 'domainCard'])
			expect(v[k]).toBe('');
	});
	it('reads FormData', () => {
		const fd = new FormData();
		fd.set('domainCard', '  c1 ');
		fd.set('p2card', 'c2');
		const v: any = readValues(fd);
		expect(v.domainCard).toBe('c1');
		expect(v.p2card).toBe('c2');
		expect(v.pick1).toBe('');
	});
});

const vals = (o: Record<string, string>) => readValues(new URLSearchParams(o)) as any;

describe('levelUpBody', () => {
	it('builds the body with two picks', () => {
		expect(
			levelUpBody(
				vals({ pick1: 'traits', p1trait1: 'agility', p1trait2: 'knowledge', pick2: 'experiences', p2exp1: 'a', p2exp2: 'b', domainCard: 'c1', newExperience: 'Tavern brawler' })
			)
		).toEqual({
			newExperience: 'Tavern brawler',
			advancements: [
				{ option: 'traits', traits: ['agility', 'knowledge'] },
				{ option: 'experiences', experiences: ['a', 'b'] }
			],
			domainCard: 'c1'
		});
	});
	it('proficiency alone, no newExperience key', () => {
		const b: any = levelUpBody(vals({ pick1: 'proficiency', domainCard: 'c1' }));
		expect(b.advancements).toEqual([{ option: 'proficiency' }]);
		expect('newExperience' in b).toBe(false);
		expect(b.domainCard).toBe('c1');
	});
	it('card pick uses cardId, bare options otherwise', () => {
		const b: any = levelUpBody(vals({ pick1: 'card', p1card: 'c2', pick2: 'hp', domainCard: 'c1' }));
		expect(b.advancements).toEqual([{ option: 'card', cardId: 'c2' }, { option: 'hp' }]);
	});
});

describe('firstInvalid step 1', () => {
	it('requires newExperience when the plan grants one', () => {
		expect(firstInvalid(vals({}), milestone, 1)).toEqual({ step: 1, field: 'newExperience' });
		expect(firstInvalid(vals({ newExperience: 'x'.repeat(101) }), milestone, 1)).toEqual({ step: 1, field: 'newExperience' });
		expect(firstInvalid(vals({ newExperience: 'x'.repeat(100) }), milestone, 1)).toBeNull();
		expect(firstInvalid(vals({ newExperience: 'Brawl' }), milestone, 1)).toBeNull();
	});
	it('must be empty otherwise', () => {
		expect(firstInvalid(vals({ newExperience: 'Brawl' }), plan, 1)).toEqual({ step: 1, field: 'newExperience' });
		expect(firstInvalid(vals({}), plan, 1)).toBeNull();
	});
});

describe('firstInvalid step 2', () => {
	it('proficiency needs an empty pick2', () => {
		expect(firstInvalid(vals({ pick1: 'proficiency', pick2: 'hp' }), plan, 2)).toEqual({ step: 2, field: 'pick2' });
		expect(firstInvalid(vals({ pick1: 'proficiency' }), plan, 2)).toBeNull();
	});
	it('other options need a pick2 other than proficiency', () => {
		expect(firstInvalid(vals({ pick1: 'hp' }), plan, 2)).toEqual({ step: 2, field: 'pick2' });
		expect(firstInvalid(vals({ pick1: 'hp', pick2: 'proficiency' }), plan, 2)).toEqual({ step: 2, field: 'pick2' });
		expect(firstInvalid(vals({ pick1: 'hp', pick2: 'traits' }), plan, 2)).toBeNull();
	});
	it('pick1 must be a plan option', () => {
		expect(firstInvalid(vals({ pick1: 'subclass', pick2: 'hp' }), plan, 2)).toEqual({ step: 2, field: 'pick1' });
		expect(firstInvalid(vals({}), plan, 2)).toEqual({ step: 2, field: 'pick1' });
	});
	it('the same option twice needs slotsLeft >= 2', () => {
		expect(firstInvalid(vals({ pick1: 'hp', pick2: 'hp' }), plan, 2)).toBeNull();
		expect(firstInvalid(vals({ pick1: 'experiences', pick2: 'experiences' }), plan, 2)).toEqual({ step: 2, field: 'pick2' });
	});
});

const base = { pick1: 'traits', pick2: 'traits' };
describe('firstInvalid step 3', () => {
	it('accepts valid details', () => {
		expect(
			firstInvalid(vals({ ...base, p1trait1: 'agility', p1trait2: 'strength', p2trait1: 'knowledge', p2trait2: 'finesse' }), plan, 3)
		).toBeNull();
	});
	it('traits outside unmarkedTraits', () => {
		expect(firstInvalid(vals({ ...base, p1trait1: 'agility', p1trait2: 'bogus', p2trait1: 'knowledge', p2trait2: 'finesse' }), plan, 3)).toEqual({ step: 3, field: 'p1trait1' });
		expect(firstInvalid(vals({ ...base, p1trait1: 'agility', p1trait2: 'agility', p2trait1: 'knowledge', p2trait2: 'finesse' }), plan, 3)).toEqual({ step: 3, field: 'p1trait1' });
	});
	it('traits repeated across picks give the p2 field', () => {
		expect(firstInvalid(vals({ ...base, p1trait1: 'agility', p1trait2: 'strength', p2trait1: 'agility', p2trait2: 'finesse' }), plan, 3)).toEqual({ step: 3, field: 'p2trait1' });
	});
	it('experiences must be two different ids', () => {
		expect(firstInvalid(vals({ pick1: 'experiences', pick2: 'hp', p1exp1: 'a', p1exp2: 'a' }), plan, 3)).toEqual({ step: 3, field: 'p1exp1' });
		expect(firstInvalid(vals({ pick1: 'experiences', pick2: 'hp', p1exp1: 'a' }), plan, 3)).toEqual({ step: 3, field: 'p1exp1' });
		expect(firstInvalid(vals({ pick1: 'experiences', pick2: 'hp', p1exp1: 'a', p1exp2: 'b' }), plan, 3)).toBeNull();
	});
	it('cards must be in plan.cards', () => {
		expect(firstInvalid(vals({ pick1: 'card', pick2: 'hp', p1card: 'nope' }), plan, 3)).toEqual({ step: 3, field: 'p1card' });
		expect(firstInvalid(vals({ pick1: 'card', pick2: 'hp', p1card: 'c2' }), plan, 3)).toBeNull();
	});
});

describe('firstInvalid step 4', () => {
	const v = { pick1: 'card', pick2: 'hp', p1card: 'c1' };
	it('domainCard differing from pNcard and in plan.cards', () => {
		expect(firstInvalid(vals({ ...v, domainCard: 'c1' }), plan, 4)).toEqual({ step: 4, field: 'domainCard' });
		expect(firstInvalid(vals({ ...v, domainCard: 'nope' }), plan, 4)).toEqual({ step: 4, field: 'domainCard' });
		expect(firstInvalid(vals({ ...v, domainCard: '' }), plan, 4)).toEqual({ step: 4, field: 'domainCard' });
		expect(firstInvalid(vals({ ...v, domainCard: 'c3' }), plan, 4)).toBeNull();
	});
	it('reports the earliest invalid step first', () => {
		expect(firstInvalid(vals({ domainCard: 'c3' }), milestone, 4)).toEqual({ step: 1, field: 'newExperience' });
	});
});

describe('stepOfField', () => {
	it('maps fields to steps', () => {
		expect(stepOfField('newExperience')).toBe(1);
		expect(stepOfField('pick1')).toBe(2);
		expect(stepOfField('pick2')).toBe(2);
		for (const f of ['p1trait1', 'p1exp1', 'p1card', 'p2trait1', 'p2exp1', 'p2card']) expect(stepOfField(f)).toBe(3);
		expect(stepOfField('domainCard')).toBe(4);
		expect(stepOfField('review')).toBe(5);
		expect(stepOfField('other')).toBe(5);
	});
});

describe('fieldOfMessage', () => {
	it('maps API messages', () => {
		for (const m of ['newExperience must be 1 to 100 characters', 'newExperience must be a string', 'newExperience is required at this level', 'newExperience is not allowed at this level', 'experience already exists', 'a character has at most 10 experiences'])
			expect(fieldOfMessage(m)).toBe('newExperience');
		expect(fieldOfMessage('advancements must spend exactly two slots')).toBe('pick1');
		expect(fieldOfMessage('advancement is not available: hp')).toBe('pick1');
		expect(fieldOfMessage('traits must be two different unmarked traits')).toBe('p1trait1');
		expect(fieldOfMessage('experiences must be two different experiences of this character')).toBe('p1exp1');
		expect(fieldOfMessage('cardId is not an eligible card')).toBe('p1card');
		expect(fieldOfMessage('domainCard is not an eligible card')).toBe('domainCard');
		expect(fieldOfMessage('domainCard must be a string')).toBe('domainCard');
		expect(fieldOfMessage('the two cards must be different')).toBe('domainCard');
		expect(fieldOfMessage('something else')).toBe('review');
	});
});

describe('levelUpHref', () => {
	it('builds the href', () => {
		expect(levelUpHref('x', 2, { pick1: 'hp' } as any, 'pick2')).toBe('/characters/x/level-up?step=2&pick1=hp&invalid=pick2');
		expect(levelUpHref('x', 3, vals({ pick1: 'hp' }))).toBe('/characters/x/level-up?step=3&pick1=hp');
		expect(levelUpHref('x', 1, vals({}))).toBe('/characters/x/level-up?step=1');
	});
});

describe('CLAUDE.md', () => {
	it('has a Layout row for the level-up route that exists', () => {
		const md = readFileSync('CLAUDE.md', 'utf8');
		expect(md).toContain('`src/routes/characters/[id]/level-up/`');
		expect(md).toContain('flow.ts');
		expect(existsSync('src/routes/characters/[id]/level-up/flow.ts')).toBe(true);
	});
});
