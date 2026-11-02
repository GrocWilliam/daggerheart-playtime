import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

describe('mobile base', () => {
	it('declares the viewport meta tag', () => {
		expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
	});
	it('keeps form controls at 16px', () => {
		expect(css).toMatch(/textarea,\s*button\s*\{[^}]*font-size: 16px/);
	});
	it('widens the layout with min-width queries only', () => {
		expect(css).toContain('@media (min-width: 768px)');
		expect(css).not.toMatch(/@media[^{]*max-width/);
	});
});

describe('touch targets', () => {
	it('sizes links, inputs and checkbox labels to 2.75rem (44px)', () => {
		expect(css).toMatch(/\ba\s*\{[^}]*min-height: 2\.75rem/);
		expect(css).toMatch(/textarea\s*\{[^}]*min-height: 2\.75rem/);
		expect(css).toMatch(/label:has\(input\[type='checkbox'\]\)\s*\{[^}]*min-height: 2\.75rem/);
	});
});

describe('party grid', () => {
	it('is 1 column by default, 2 from 600px, 3 from 1024px', () => {
		expect(css).toMatch(/\.party\s*\{[^}]*minmax\(0, 1fr\)/);
		expect(css).toMatch(/min-width: 600px\)\s*\{\s*\.party\s*\{[^}]*repeat\(2,/);
		expect(css).toMatch(/min-width: 1024px\)[\s\S]*\.party\s*\{[^}]*repeat\(3,/);
	});
});
