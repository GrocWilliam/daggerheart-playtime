import { describe, expect, it } from 'vitest';
import { damageBody } from './damage';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('damageBody', () => {
	it('quick wins over amount', () => {
		expect(damageBody(fd({ quick: '7', amount: '2', useArmor: 'on' }))).toEqual({ amount: 7, useArmor: true });
	});
	it('uses amount alone', () => {
		expect(damageBody(fd({ amount: '3' }))).toEqual({ amount: 3, useArmor: false });
	});
	it('keeps empty and non-numeric values as strings', () => {
		expect(damageBody(fd({ quick: '', amount: '' })).amount).toBe('');
		expect(damageBody(fd({ amount: 'x' })).amount).toBe('x');
	});
});

import { damageText, parseDamageQuery, damageResult } from './damage';

describe('damage result', () => {
	it('formats', () => {
		expect(damageText('en', { name: 'Lyra', hpHit: 2, armorUsed: false })).toBe('Lyra: −2 HP');
		expect(damageText('en', { name: 'Lyra', hpHit: 1, armorUsed: true })).toBe('Lyra: −1 HP, 1 armor slot used');
		expect(damageText('fr', { name: 'Lyra', hpHit: 2, armorUsed: false })).toBe('Lyra : −2 PV');
		expect(damageText('fr', { name: 'Lyra', hpHit: 1, armorUsed: true })).toBe("Lyra : −1 PV, 1 emplacement d'armure utilisé");
	});
	it('parses the query', () => {
		const u = (q: string) => new URL(`http://x/c?${q}`);
		expect(parseDamageQuery(u('tab=play&hit=2&armor=1'), 'Lyra')).toEqual({ name: 'Lyra', hpHit: 2, armorUsed: true });
		expect(parseDamageQuery(u('hit=2'), 'Lyra')?.armorUsed).toBe(false);
		for (const q of ['', 'hit=4', 'hit=-1', 'hit=1.5', 'hit=x']) expect(parseDamageQuery(u(q), 'Lyra')).toBeNull();
	});
	it('reads the API answer', () => {
		expect(damageResult({ hpMarked: 2, armorUsed: true, character: { name: 'L' } })).toEqual({ name: 'L', hpHit: 2, armorUsed: true });
		expect(damageResult(null)).toBeNull();
	});
});
