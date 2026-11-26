import { describe, expect, it } from 'vitest';
import { fold, matches } from './search';

describe('fold', () => {
	it('strips accents and lowercases', () => {
		expect(fold('Élégant Épée')).toBe('elegant epee');
		expect(fold('BARD')).toBe('bard');
	});
});

describe('matches', () => {
	it('matches name, text and label', () => {
		expect(matches('', 'Bard', [])).toBe(true);
		expect(matches('bard', 'Bard', [])).toBe(true);
		expect(matches('epee', 'Épée longue', [])).toBe(true);
		expect(matches('grimoire', 'Bard', [{ label: 'Domains', text: 'Grace & Codex — grimoire' }])).toBe(true);
		expect(matches('domains', 'Bard', [{ label: 'Domains', text: 'x' }])).toBe(true);
		expect(matches('zzz', 'Bard', [{ label: 'x', text: 'y' }])).toBe(false);
	});
});
