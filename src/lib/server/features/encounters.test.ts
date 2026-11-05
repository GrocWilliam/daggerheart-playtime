import { describe, it, expect } from 'vitest';
import { budgetFor, costOf, partyDefaults, generateRequestSchema, generateEncounter, type Adjustment } from './encounters';
import { adversariesByTier } from './srd';

const one = (...roles: string[]) => roles.map((role) => ({ role, count: 1 }));

describe('encounters', () => {
	it('budgets', () => {
		expect(budgetFor(4, [], one('Bruiser'))).toEqual({ budget: 14, automatic: [] });
		expect(budgetFor(4, ['easier', 'damageBoost'], one('Bruiser')).budget).toBe(11);
		expect(budgetFor(4, [], one('Solo', 'Solo'))).toEqual({ budget: 12, automatic: ['twoSolos'] });
		expect(budgetFor(4, [], [])).toEqual({ budget: 15, automatic: ['noBigThreats'] });
	});
	it('costs', () => {
		expect(costOf('Solo', 1, 4)).toBe(5);
		expect(costOf('Minion', 5, 4)).toBe(2);
	});
	it('party defaults', () => {
		expect(partyDefaults([])).toEqual({ partySize: 1, tier: 1 });
		expect(partyDefaults([1, 5])).toEqual({ partySize: 2, tier: 3 });
	});
	it('messages', () => {
		const m = (v: unknown) => generateRequestSchema.safeParse(v).error?.issues[0].message;
		expect(m({ partySize: 9 })).toBe('partySize must be an integer from 1 to 8');
		expect(m({ tier: 0 })).toBe('tier must be an integer from 1 to 4');
		expect(m({ adjustments: ['x'] })).toBe('adjustments must be easier, damageBoost or harder');
		expect(m({ adjustments: 'easier' })).toBe('adjustments must be easier, damageBoost or harder');
		expect(m({ seed: 1.5 })).toBe('seed must be an integer');
		expect(m({})).toBeUndefined();
	});
	it('generator invariants', () => {
		const combos: Adjustment[][] = [[], ['easier'], ['damageBoost', 'harder'], ['easier', 'damageBoost', 'harder']];
		for (let p = 1; p <= 8; p++)
			for (let tier = 1; tier <= 4; tier++) {
				const pool = adversariesByTier(tier, 'en');
				for (const adjustments of combos)
					for (let seed = 1; seed <= 20; seed++) {
						const e = generateEncounter({ partySize: p, tier, adjustments, seed }, pool);
						const m = JSON.stringify({ p, tier, adjustments, seed, e });
						expect(e.spent <= e.budget, m).toBe(true);
						expect(e.budget - e.spent <= 1, m).toBe(true);
						if (e.budget >= 4) expect(new Set(e.adversaries.map((a) => a.id)).size >= 2, m).toBe(true);
						for (const a of e.adversaries) {
							expect(pool.some((x) => x.id === a.id), m).toBe(true);
							expect(a.cost, m).toBe(costOf(a.role, a.count, p));
						}
						expect(generateEncounter({ partySize: p, tier, adjustments, seed }, pool)).toEqual(e);
					}
			}
	});
});
