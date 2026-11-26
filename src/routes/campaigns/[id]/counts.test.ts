import { describe, it, expect } from 'vitest';
import { countsFrom, stepCount } from './counts';

describe('stepCount', () => {
	it.each([[3, 1, 4], [3, -1, 2], [1, -1, 1], [20, 1, 20], [19, 1, 20], [30, -1, 29], [30, 1, 30], [3, 0, 3]])('%i, %i -> %i', (c, d, r) => {
		expect(stepCount(c, d)).toBe(r);
	});
});

describe('countsFrom', () => {
	it('zips ids with counts', () => {
		const f = new FormData();
		f.append('id', 'a'); f.append('count', '2'); f.append('id', 'b'); f.append('count', '5');
		expect(countsFrom(f)).toEqual([{ id: 'a', count: 2 }, { id: 'b', count: 5 }]);
	});
});
