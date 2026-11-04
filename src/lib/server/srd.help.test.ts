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

import { cardGroups, cardsByIds } from './srd';
describe('domain card pick-lists', () => {
	it('groups all 189 cards by domain, class domains first', () => {
		const g = cardGroups('Bard', 'en');
		expect(g.map((x) => x.domain).slice(0, 2)).toEqual(['GRACE', 'CODEX']);
		expect(g).toHaveLength(9);
		expect(g.reduce((n, x) => n + x.cards.length, 0)).toBe(189);
	});
	it('resolves held cards in order and skips unknown ids', () => {
		const ids = cardGroups('Bard', 'fr')[0].cards.slice(0, 2).map((c) => c.id);
		expect(cardsByIds(['nope', ...ids.reverse()], 'fr').map((c) => c.id)).toEqual(ids);
	});
});

describe('idByName', () => {
	it('maps English names to ids, null otherwise', async () => {
		const { idByName } = await import('./srd');
		expect(idByName('ancestries', 'Clank')).toBe('core_ancestry_clank');
		expect(idByName('ancestries', '')).toBeNull();
		expect(idByName('communities', 'Nope')).toBeNull();
	});
});
