import { describe, it, expect } from 'vitest';
import * as mod from '../../../src/lib/server/features/encounters';

const m = mod as Record<string, any>;
const schema: any =
	m.generateRequestSchema ?? m.generationSchema ?? m.encounterRequestSchema ?? m.generateSchema ??
	m.requestSchema ?? m.encounterSchema ??
	Object.values(m).find((v: any) => v && typeof v === 'object' && typeof v.safeParse === 'function');
const adv = (...roles: string[]) => roles.map((role) => ({ role, count: 1 }));
const BRUISER = adv('Bruiser');
const msg = (v: unknown) => {
	const r = schema.safeParse(v);
	return r.success ? null : r.error.issues[0].message;
};

describe('budget', () => {
	it('party 4, no adjustment -> 14', () => {
		expect(mod.budgetFor(4, [], BRUISER)).toEqual({ budget: 14, automatic: [] });
	});
	it('harder -> 16', () => expect(mod.budgetFor(4, ['harder'], BRUISER).budget).toBe(16));
	it('easier + damageBoost -> 11', () =>
		expect(mod.budgetFor(4, ['easier', 'damageBoost'], BRUISER).budget).toBe(11));
	it('party 1 -> 5', () => expect(mod.budgetFor(1, [], BRUISER).budget).toBe(5));
});

describe('automatic adjustments', () => {
	it('twoSolos subtracts 2', () => {
		const r = mod.budgetFor(4, [], adv('Solo', 'Solo'));
		expect(r.budget).toBe(12);
		expect(r.automatic).toEqual(['twoSolos']);
	});
	it('one Solo is not twoSolos', () => {
		const r = mod.budgetFor(4, [], adv('Solo'));
		expect(r.budget).toBe(14);
		expect(r.automatic).toEqual([]);
	});
	it('noBigThreats adds 1 (lone Standard)', () => {
		const r = mod.budgetFor(4, [], adv('Standard'));
		expect(r.budget).toBe(15);
		expect(r.automatic).toEqual(['noBigThreats']);
	});
	it('noBigThreats on the empty list', () => {
		const r = mod.budgetFor(4, [], []);
		expect(r.budget).toBe(15);
		expect(r.automatic).toContain('noBigThreats');
	});
	it('Horde, Leader count as big threats', () => {
		expect(mod.budgetFor(4, [], adv('Horde')).automatic).toEqual([]);
		expect(mod.budgetFor(4, [], adv('Leader')).automatic).toEqual([]);
	});
	it('combines with manual adjustments', () => {
		expect(mod.budgetFor(4, ['harder'], adv('Standard')).budget).toBe(17);
	});
});

describe('costs', () => {
	it('single roles', () => {
		expect(mod.costOf('Solo', 1, 4)).toBe(5);
		expect(mod.costOf('Bruiser', 1, 4)).toBe(4);
		expect(mod.costOf('Leader', 1, 4)).toBe(3);
		expect(mod.costOf('Standard', 1, 4)).toBe(2);
		expect(mod.costOf('Support', 1, 4)).toBe(1);
	});
	it('Minions cost ceil(count / partySize)', () => {
		expect(mod.costOf('Minion', 4, 4)).toBe(1);
		expect(mod.costOf('Minion', 5, 4)).toBe(2);
		expect(mod.costOf('Minion', 9, 4)).toBe(3);
		expect(mod.costOf('Minion', 1, 4)).toBe(1);
	});
});

describe('partyDefaults', () => {
	it('empty -> size 1, tier 1', () => expect(mod.partyDefaults([])).toEqual({ partySize: 1, tier: 1 }));
	it('[1,5] -> size 2, tier 3', () => expect(mod.partyDefaults([1, 5])).toEqual({ partySize: 2, tier: 3 }));
	it('tier boundaries', () => {
		const t = (l: number) => mod.partyDefaults([l]).tier;
		expect([1, 2, 4, 5, 7, 8, 10].map(t)).toEqual([1, 2, 2, 3, 3, 4, 4]);
	});
});

describe('request schema', () => {
	it('accepts empty and valid bodies', () => {
		expect(schema.safeParse({}).success).toBe(true);
		expect(schema.safeParse({ partySize: 8, tier: 4, adjustments: ['easier', 'damageBoost', 'harder'], seed: 7 }).success).toBe(true);
		expect(schema.safeParse({ partySize: 1, tier: 1 }).success).toBe(true);
	});
	it('partySize message', () => {
		for (const v of [0, 9, 2.5, '3', null]) expect(msg({ partySize: v })).toBe('partySize must be an integer from 1 to 8');
	});
	it('tier message', () => {
		for (const v of [0, 5, 1.5, 'x']) expect(msg({ tier: v })).toBe('tier must be an integer from 1 to 4');
	});
	it('adjustments message', () => {
		for (const v of [['bogus'], 'easier', ['easier', 'nope'], 3]) expect(msg({ adjustments: v })).toBe('adjustments must be easier, damageBoost or harder');
	});
	it('seed must be an integer', () => {
		expect(msg({ seed: 1.5 })).not.toBeNull();
		expect(msg({ seed: 'a' })).not.toBeNull();
	});
});
