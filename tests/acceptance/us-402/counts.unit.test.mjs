// Pure helpers of src/routes/campaigns/[id]/counts.ts (node runs it: no $lib imports there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepCount, countsFrom } from '../../../src/routes/campaigns/[id]/counts.ts';

test('stepCount adds or subtracts one within 1..20 and leaves other values alone', () => {
	assert.equal(stepCount(3, 1), 4);
	assert.equal(stepCount(3, -1), 2);
	assert.equal(stepCount(1, -1), 1);
	assert.equal(stepCount(20, 1), 20);
	assert.equal(stepCount(19, 1), 20);
	assert.equal(stepCount(30, -1), 29);
	assert.equal(stepCount(30, 1), 30);
	assert.equal(stepCount(3, 0), 3);
});

test('countsFrom zips the id and count fields of a FormData', () => {
	const f = new FormData();
	f.append('id', 'a'); f.append('count', '2');
	f.append('id', 'b'); f.append('count', '5');
	assert.deepEqual(countsFrom(f), [{ id: 'a', count: 2 }, { id: 'b', count: 5 }]);
});
