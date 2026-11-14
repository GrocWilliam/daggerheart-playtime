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

it('defines --border as the accent at 35% without a colour function, and the border token', () => {
	expect(css).toContain('--border: --alpha(var(--accent) / 35%);');
	expect(css).toContain('--color-border: var(--border);');
	expect(css).not.toContain(['color', 'mix('].join('-'));
});

it('has the four button variants in @layer components, each on one line', () => {
	const layer = css.slice(css.indexOf('@layer components {'));
	for (const v of ['primary', 'secondary', 'ghost', 'danger']) expect(layer).toMatch(new RegExp(`^\\s*\\.btn-${v} \\{[^\\n]*\\}$`, 'm'));
	expect(layer).toMatch(/\[aria-pressed='true'\]\.btn-secondary \{ background-color: var\(--accent\); color: var\(--bg\); \}/);
});

it('keeps the button and a rules in @layer base only', () => {
	const unlayered = css.slice(css.indexOf('/* Unlayered'));
	expect(unlayered).not.toMatch(/^button \{/m);
	expect(unlayered).not.toMatch(/^a \{/m);
	expect(css.split('\n').length).toBeLessThan(150);
});
