import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageBody } from '../../../src/lib/forms/damage.ts';

const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

test('damageBody: quick wins over amount, useArmor on', () => {
	assert.deepEqual(damageBody(fd({ quick: '7', amount: '2', useArmor: 'on' })), { amount: 7, useArmor: true });
});
test('damageBody: only amount', () => {
	assert.deepEqual(damageBody(fd({ amount: '3' })), { amount: 3, useArmor: false });
});
test('damageBody: empty quick and empty amount give a string amount', () => {
	assert.equal(typeof damageBody(fd({ quick: '', amount: '' })).amount, 'string');
	assert.equal(typeof damageBody(fd({ amount: 'abc' })).amount, 'string');
});
