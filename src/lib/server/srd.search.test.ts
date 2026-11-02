import { describe, it, expect } from 'vitest';
import { searchSrd } from './srd';

describe('searchSrd', () => {
	it('filters by kind and case-insensitive name', () => {
		const r = searchSrd('weapons', 'SWORD', 'en');
		expect(r).toHaveLength(1);
		expect(r[0].items.length).toBeGreaterThan(0);
		for (const i of r[0].items) expect(i.name.toLowerCase()).toContain('sword');
	});
	it('covers every kind without filter and gives English text', () => {
		const r = searchSrd(undefined, '', 'fr');
		expect(r).toHaveLength(11);
		for (const s of r) for (const i of s.items) expect(i.en.length).toBeGreaterThan(0);
	});
	it('matches nothing for gibberish', () => {
		expect(searchSrd(undefined, 'zzqqxx', 'en').every((s) => s.items.length === 0)).toBe(true);
	});
});
