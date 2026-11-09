// US-254 pure rules, without a database: damageMarks, marksOf, resizeMarks.
import { describe, it, expect } from 'vitest';
import * as mod from '../../../src/lib/server/features/encounters';

const m = mod as Record<string, any>;
const fn = (name: string) => {
	expect(typeof m[name], `encounters.ts must export ${name}`).toBe('function');
	return m[name];
};

describe('damageMarks with thresholds 8/15', () => {
	const cases: [number, number][] = [[0, 0], [-3, 0], [1, 1], [7, 1], [8, 2], [14, 2], [15, 3], [40, 3]];
	for (const [amount, marks] of cases)
		it(`${amount} -> ${marks}`, () => expect(fn('damageMarks')(amount, '8/15')).toBe(marks));
});

describe('damageMarks with thresholds 4/None', () => {
	const cases: [number, number][] = [[0, 0], [3, 1], [4, 2], [30, 2]];
	for (const [amount, marks] of cases)
		it(`${amount} -> ${marks}`, () => expect(fn('damageMarks')(amount, '4/None')).toBe(marks));
});

describe('damageMarks with thresholds None (Minions)', () => {
	const cases: [number, number][] = [[0, 0], [1, 1], [50, 1]];
	for (const [amount, marks] of cases)
		it(`${amount} -> ${marks}`, () => expect(fn('damageMarks')(amount, 'None')).toBe(marks));
});

describe('marksOf', () => {
	it('an entry with count 3 and no hpMarked gives [0,0,0]', () => {
		expect(fn('marksOf')({ id: 'adv_giant_rat', name: 'Giant Rat', role: 'Minion', count: 3, cost: 1 })).toEqual([0, 0, 0]);
	});
});

describe('resizeMarks', () => {
	it('[1,2,3] to 2 gives [1,2]', () => expect(fn('resizeMarks')([1, 2, 3], 2)).toEqual([1, 2]));
	it('[1] to 3 gives [1,0,0]', () => expect(fn('resizeMarks')([1], 3)).toEqual([1, 0, 0]));
	it('undefined to 4 stays undefined', () => expect(fn('resizeMarks')(undefined, 4)).toBeUndefined());
});
