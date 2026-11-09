import { describe, it, expect } from 'vitest';
import {
	budgetFor,
	costOf,
	partyDefaults,
	generateRequestSchema,
	generateEncounter,
	damageMarks,
	marksOf,
	resizeMarks,
	maxHp,
	battleDamageSchema,
	battleHpSchema,
	battleAddSchema,
	type Adjustment
} from './encounters';
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

describe('battle rules', () => {
	it('damageMarks with 8/15', () => {
		const cases: [number, number][] = [[0, 0], [-3, 0], [1, 1], [7, 1], [8, 2], [14, 2], [15, 3], [40, 3]];
		for (const [a, m] of cases) expect(damageMarks(a, '8/15'), String(a)).toBe(m);
	});
	it('damageMarks with 4/None', () => {
		const cases: [number, number][] = [[0, 0], [3, 1], [4, 2], [30, 2]];
		for (const [a, m] of cases) expect(damageMarks(a, '4/None'), String(a)).toBe(m);
	});
	it('damageMarks with None or anything else', () => {
		const cases: [number, number][] = [[0, 0], [1, 1], [50, 1]];
		for (const [a, m] of cases) expect(damageMarks(a, 'None'), String(a)).toBe(m);
		expect(damageMarks(5, '')).toBe(1);
	});
	it('marksOf', () => {
		const e = { id: 'adv_giant_rat', name: 'Giant Rat', role: 'Minion', count: 3, cost: 1 };
		expect(marksOf(e)).toEqual([0, 0, 0]);
		expect(marksOf({ ...e, hpMarked: [1, 0, 1] })).toEqual([1, 0, 1]);
	});
	it('resizeMarks', () => {
		expect(resizeMarks([1, 2, 3], 2)).toEqual([1, 2]);
		expect(resizeMarks([1], 3)).toEqual([1, 0, 0]);
		expect(resizeMarks(undefined, 4)).toBeUndefined();
	});
	it('maxHp reads the English SRD', () => {
		expect(maxHp('adv_acid_burrower')).toBe(8);
		expect(maxHp('adv_giant_rat')).toBe(1);
	});
	it('battleDamageSchema messages', () => {
		const m = (v: unknown) => battleDamageSchema.safeParse(v).error?.issues[0].message;
		const ok = { adversaryId: 'adv_giant_rat', index: 0, amount: 5 };
		expect(m(ok)).toBeUndefined();
		expect(m([])).toBe('body must be a JSON object');
		expect(m({ ...ok, adversaryId: 3 })).toBe('adversaryId must be a string');
		expect(m({ ...ok, index: -1 })).toBe('index must be a copy of that adversary');
		expect(m({ ...ok, index: 1.5 })).toBe('index must be a copy of that adversary');
		expect(m({ ...ok, index: '0' })).toBe('index must be a copy of that adversary');
		expect(m({ ...ok, amount: 0 })).toBe('amount must be an integer from 1 to 999');
		expect(m({ ...ok, amount: 1000 })).toBe('amount must be an integer from 1 to 999');
	});
	it('battleAddSchema messages', () => {
		const m = (v: unknown) => battleAddSchema.safeParse(v).error?.issues[0].message;
		expect(battleAddSchema.safeParse({ adversaryId: 'adv_giant_rat', count: 20 }).success).toBe(true);
		expect(m({ adversaryId: 'a', count: 0 })).toBe('count must be an integer from 1 to 20');
		expect(m({ adversaryId: 'a', count: 21 })).toBe('count must be an integer from 1 to 20');
		expect(m({ adversaryId: 1, count: 1 })).toBe('adversaryId must be a string');
		expect(m(null)).toBe('body must be a JSON object');
	});

	it('battleHpSchema messages', () => {
		const m = (v: unknown) => battleHpSchema.safeParse(v).error?.issues[0].message;
		const ok = { adversaryId: 'adv_giant_rat', index: 0, delta: -1 };
		expect(m(ok)).toBeUndefined();
		expect(m(null)).toBe('body must be a JSON object');
		expect(m({ ...ok, adversaryId: undefined })).toBe('adversaryId must be a string');
		expect(m({ ...ok, index: -2 })).toBe('index must be a copy of that adversary');
		expect(m({ ...ok, delta: 2 })).toBe('delta must be 1 or -1');
		expect(m({ ...ok, delta: 0 })).toBe('delta must be 1 or -1');
	});
});
