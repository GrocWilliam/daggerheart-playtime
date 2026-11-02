import { describe, expect, it } from 'vitest';
import { helpLines, pickList, pickOf, subclassesOf } from './srd';

describe('SRD pick-lists', () => {
	it('lists the 9 classes, localized', () => {
		expect(pickList('classes', 'en')).toHaveLength(9);
		expect(pickList('classes', 'en')[0].name).toBe('Bard');
	});
	it('gives 2 subclasses per class, none for unknown classes', () => {
		expect(subclassesOf('Ranger', 'en')).toHaveLength(2);
		expect(subclassesOf('Homebrew Hero', 'en')).toEqual([]);
	});
	it('pickOf returns null for null/unknown ids', () => {
		expect(pickOf('ancestries', null, 'en')).toBeNull();
		expect(pickOf('ancestries', 'nope', 'en')).toBeNull();
	});
	it('subclass help lines contain "<feature>: <text>"', () => {
		const s = subclassesOf('Ranger', 'en')[0];
		expect(s.en.some((l) => l.startsWith('Companion: You have an animal companion'))).toBe(true);
	});
	it('formats weapons, armors and domain cards', () => {
		expect(helpLines('weapons', pickOfRaw('weapons'))[0]).toMatch(/ · .* · D\d+ .* · /);
		expect(helpLines('armors', { baseMajorThreshold: 5, baseSevereThreshold: 11, baseScore: 3 })[0]).toBe(
			'thresholds 5/11 · score 3'
		);
		expect(helpLines('domain-cards', { domain: 'BLADE', level: 2, recallCost: 1 })[0]).toBe('Blade · level 2 · recall cost 1');
	});
});

function pickOfRaw(kind: 'weapons') {
	return { trait: 'AGILITY', range: 'MELEE', damage: { dice: 'D8', type: 'PHYSICAL' }, burden: 'ONE_HANDED', kind };
}
