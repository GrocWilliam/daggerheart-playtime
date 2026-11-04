import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync('src/app.css', 'utf8');

it('defines the palette custom properties', () => {
	for (const [k, v] of Object.entries({
		bg: '#1a1714', surface: '#26211c', text: '#e8dcc0', muted: '#b8a88a', accent: '#d4a24c', teal: '#3fa7a0', danger: '#e06c66'
	})) {
		expect(css).toContain(`--${k}: ${v};`);
	}
});
