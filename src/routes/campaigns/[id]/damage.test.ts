import { describe, expect, it } from 'vitest';
import { splitDamage } from './damage';

describe('splitDamage', () => {
	it('splits physical and magical', () => {
		expect(splitDamage('1d12+2 phy')).toEqual({ dice: '1d12+2', type: 'PHYSICAL' });
		expect(splitDamage('2d6 mag')).toEqual({ dice: '2d6', type: 'MAGICAL' });
	});
	it('keeps both types of phy/mag', () => {
		expect(splitDamage('1d8+4 phy/mag')).toEqual({ dice: '1d8+4', type: 'PHYSICAL_OR_MAGICAL' });
	});
	it('leaves unknown text alone', () => {
		expect(splitDamage('special')).toEqual({ dice: 'special', type: null });
	});
});
