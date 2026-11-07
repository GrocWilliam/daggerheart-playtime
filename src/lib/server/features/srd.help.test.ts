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
		expect(s.lines.some((l) => l.text.startsWith('Companion: You have an animal companion'))).toBe(true);
	});
	it('formats weapons, armors and domain cards in the page lang', () => {
		expect(helpLines('weapons', pickOfRaw('weapons'), {}, 'en')[0]).toEqual({ text: 'Agility · Melee · D8 physical · One-handed', lang: 'en' });
		expect(helpLines('armors', { baseMajorThreshold: 5, baseSevereThreshold: 11, baseScore: 3 }, {}, 'en')[0]).toEqual({
			text: 'thresholds 5/11 · score 3',
			lang: 'en'
		});
		expect(helpLines('armors', { baseMajorThreshold: 5, baseSevereThreshold: 11, baseScore: 3 }, {}, 'fr')[0]).toEqual({
			text: 'seuils 5/11 · score 3',
			lang: 'fr'
		});
		expect(helpLines('domain-cards', { domain: 'BLADE', level: 2, recallCost: 1 }, {}, 'en')[0]).toEqual({
			text: 'Blade · level 2 · recall cost 1',
			lang: 'en'
		});
	});
	it('text lines carry the lang of their field', () => {
		const lines = helpLines('classes', { id: 'x', description: [{ paragraph: { 'en-US': 'Hello' } }] }, { description: 'fr' }, 'en');
		expect(lines).toEqual([{ text: 'Hello', lang: 'fr' }]);
	});
	it('adversary facts use catalog labels and role, text fields get a label', () => {
		const lines = helpLines('adversaries', { tier: 1, type: 'Solo', difficulty: 14, motives_and_tactics: 'Burrow' }, {}, 'fr');
		expect(lines[0]).toEqual({ text: expect.stringContaining('Solo'), lang: 'fr' });
		expect(lines[1]).toMatchObject({ text: 'Burrow', lang: 'en' });
		expect(lines[1].label).not.toContain('_');
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
