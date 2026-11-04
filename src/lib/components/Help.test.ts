import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '$lib/i18n/en.json';
import fr from '$lib/i18n/fr.json';
import glossary from '$lib/srd/glossary.json';

describe('help', () => {
	it('has a help label in both languages', () => {
		expect(en['help.label']).toBe('Help:');
		expect(fr['help.label']).toBe('Aide :');
	});
	it('has glossary text in both languages for every helper id used on the pages', () => {
		const ids = ['hp', 'stress', 'hope', 'fear', 'armor', 'evasion', 'thresholds', 'vulnerable', 'restrained', 'hidden', 'gold', 'level'];
		for (const id of ids) {
			const g = glossary.find((x) => x.id === id);
			expect(g?.en).toBeTruthy();
			expect(g?.fr).toBeTruthy();
		}
	});
	it('renders a details/summary with data-help and an aria-label', () => {
		const src = readFileSync(new URL('./Help.svelte', import.meta.url), 'utf8');
		expect(src).toContain('<details data-testid="help" data-help={id}');
		expect(src).toContain('aria-label=');
		expect(src).toContain('lang="en"');
	});
});
