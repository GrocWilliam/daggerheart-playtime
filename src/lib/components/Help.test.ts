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
	it('has a close label in both languages', () => {
		expect(en['help.close']).toBe('Close');
		expect(fr['help.close']).toBe('Fermer');
	});
	it('renders a help-open button and a native popover help-panel with help-close', () => {
		const src = readFileSync(new URL('./Help.svelte', import.meta.url), 'utf8');
		for (const s of [
			'data-testid="help" data-help={id}',
			'data-testid="help-open"',
			'data-testid="help-panel"',
			'data-testid="help-close"',
			'popover="auto"',
			'popovertarget={panelId}',
			'popovertargetaction="hide"',
			'$props.id()',
			'aria-label=',
			"{label ?? '?'}",
			'underline decoration-dotted',
			'btn-ghost',
			'btn-secondary',
			'lang={line.lang}'
		])
			expect(src).toContain(s);
		for (const s of ['<details', '<summary', 'onclick', '<div', 'lang="en"', '<style', ' style='])
			expect(src).not.toContain(s);
		// the name comes first in the panel, help-close last
		const panel = src.slice(src.indexOf('data-testid="help-panel"'));
		expect(panel.indexOf('<strong')).toBeLessThan(panel.indexOf('data-testid="help-close"'));
	});
});
