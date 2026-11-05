import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync('src/app.css', 'utf8');

it('defines the palette custom properties', () => {
	for (const [k, v] of Object.entries({
		bg: '#0f1a15', surface: '#1a2a22', text: '#efe4c8', muted: '#b9b08f', accent: '#d4a050', teal: '#6cc3b5', danger: '#ee8070'
	})) {
		expect(css).toContain(`--${k}: ${v};`);
	}
});
