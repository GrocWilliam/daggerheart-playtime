// Pure helpers of src/lib/forms/damage.ts (needs relative imports there: node runs it without the $lib alias).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageText, parseDamageQuery, damageResult } from '../../../src/lib/forms/damage.ts';

const q = (s) => new URL('http://x/characters/1?' + s);
const M = '−';

test('damageText en: hit, armor, zero', () => {
	assert.equal(damageText('en', { name: 'Lyra', hpHit: 2, armorUsed: false }), `Lyra: ${M}2 HP`);
	assert.equal(damageText('en', { name: 'Lyra', hpHit: 1, armorUsed: true }), `Lyra: ${M}1 HP, 1 armor slot used`);
	assert.equal(damageText('en', { name: 'Lyra', hpHit: 0, armorUsed: false }), `Lyra: ${M}0 HP`);
});
test('damageText fr', () => {
	assert.equal(damageText('fr', { name: 'Lyra', hpHit: 2, armorUsed: false }), `Lyra : ${M}2 PV`);
	assert.equal(damageText('fr', { name: 'Lyra', hpHit: 1, armorUsed: true }), `Lyra : ${M}1 PV, 1 emplacement d'armure utilisé`);
});
test('parseDamageQuery: hit and armor', () => {
	assert.deepEqual(parseDamageQuery(q('tab=play&hit=2&armor=1'), 'Lyra'), { name: 'Lyra', hpHit: 2, armorUsed: true });
	assert.deepEqual(parseDamageQuery(q('tab=play&hit=2'), 'Lyra'), { name: 'Lyra', hpHit: 2, armorUsed: false });
	assert.equal(parseDamageQuery(q('hit=0'), 'Lyra')?.hpHit, 0);
	assert.equal(parseDamageQuery(q('hit=3'), 'Lyra')?.hpHit, 3);
});
test('parseDamageQuery: missing or invalid hit gives null', () => {
	for (const s of ['tab=play', 'tab=play&armor=1', 'hit=4', 'hit=-1', 'hit=1.5', 'hit=x', 'hit=']) {
		assert.equal(parseDamageQuery(q(s), 'Lyra'), null, s);
	}
});
test('damageResult reads hpMarked and character.name', () => {
	const r = damageResult({ hpMarked: 2, armorUsed: true, character: { name: 'Lyra' } });
	assert.deepEqual(r, { name: 'Lyra', hpHit: 2, armorUsed: true });
	assert.equal(damageResult({ hpMarked: 1, armorUsed: false, character: { name: 'Lyra' } })?.armorUsed, false);
});
