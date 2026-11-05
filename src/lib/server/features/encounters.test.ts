import { describe, it, expect } from 'vitest';
import { budgetFor, costOf, partyDefaults, generateRequestSchema } from './encounters';

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
});
