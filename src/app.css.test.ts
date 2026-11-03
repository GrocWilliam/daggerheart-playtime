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

describe('trackers', () => {
	it('keeps controls on one centred, non-wrapping line', () => {
		expect(css).toMatch(/\.tracker\s*\{[^}]*display: flex[^}]*flex-wrap: nowrap[^}]*align-items: center/);
	});
});

describe('pips', () => {
	it('draws filled and empty pips in the tracker colour', () => {
		expect(css).toMatch(/\.pip\s*\{[^}]*border: 1px solid var\(--pip\)/);
		expect(css).toMatch(/\.pip\.filled\s*\{\s*background-color: var\(--pip\)/);
		expect(css).toMatch(/\[data-testid='hp-pips'\][^{]*\{\s*--pip: var\(--danger\)/);
	});
});

describe('form cards and validation', () => {
	it('styles non-tracker forms as surface cards', () => {
		expect(css).toMatch(/form:not\(\.tracker\)\s*\{[^}]*var\(--surface\)[^}]*border-radius: 0\.5rem[^}]*padding: 0\.75rem/);
	});
	it('marks user-invalid controls and alerts with --danger', () => {
		expect(css).toMatch(/input:user-invalid[^{]*\{[^}]*border-color: var\(--danger\)/);
		expect(css).toMatch(/\[role='alert'\]\s*\{[^}]*border-left: 3px solid var\(--danger\)/);
	});
});

describe('form-grid', () => {
	it('is a one column grid, two columns on wide screens', () => {
		expect(css).toMatch(/\.form-grid\s*\{[^}]*display: grid/);
		expect(css).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
	});
});

describe('inventory table', () => {
	it('is full width, collapsed, with muted headers and row dividers', () => {
		expect(css).toMatch(/table\s*\{[^}]*width: 100%[^}]*border-collapse: collapse/);
		expect(css).toMatch(/th\s*\{[^}]*color: var\(--muted\)[^}]*border-bottom: 1px solid var\(--accent\)/);
		expect(css).toMatch(/tbody tr\s*\{[^}]*border-bottom: 1px solid var\(--muted\)/);
	});
	it('stacks rows on phones and restores table layout from 600px', () => {
		expect(css).toMatch(/table,\s*tbody,\s*tr,\s*td\s*\{[^}]*display: block/);
		expect(css).toContain('@media (min-width: 600px)');
	});
});

describe('tailwind setup', () => {
	const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const theme = noComments.match(/@theme[^{]*\{([^}]*)\}/)?.[1] ?? '';
	it('imports tailwindcss first', () => {
		expect(noComments.trimStart()).toMatch(/^@import "tailwindcss";/);
	});
	it('keeps the seven palette variables on html', () => {
		const html = noComments.match(/\nhtml \{([^}]*)\}/)?.[1] ?? '';
		for (const k of ['bg', 'surface', 'text', 'muted', 'accent', 'teal', 'danger']) {
			expect(html).toMatch(new RegExp(`--${k}: #[0-9a-f]{6};`));
		}
	});
	it('has @theme tokens that only use var(...) and the escaped calm token', () => {
		const colours = theme.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--color-'));
		expect(colours.length).toBe(7);
		for (const d of colours) expect(d).toMatch(/^--color-[\w-]+:\s*var\(--[\w\\-]+\)$/);
		expect(theme).toContain('--color-calm: var(--tea\\6c)');
		expect(theme).not.toMatch(/teal/i);
		expect(theme).toMatch(/--font-[\w-]+:[^;]*Cinzel/);
		expect(theme).toMatch(/--font-[\w-]+:[^;]*EB Garamond/);
	});
	it('has no colour literal outside the palette definitions', () => {
		const lines = noComments.split('\n').filter((l) => !/^\s*--(bg|surface|text|muted|accent|teal|danger):/.test(l));
		expect(lines.join('\n')).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch)\(/i);
	});
	it('restores preflight in @layer base', () => {
		expect(noComments).toMatch(/@layer base \{[\s\S]*min-height: 2\.75rem[\s\S]*var\(--tea\\6c\)/);
	});
});
