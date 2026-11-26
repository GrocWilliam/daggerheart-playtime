import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { translate } from '$lib/i18n';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('SrdLines', () => {
	it('uses inline-level markup only', () => {
		const s = src('./SrdLines.svelte');
		for (const tag of ['div', 'p', 'ul', 'li', 'details', 'section', 'h2']) expect(s).not.toMatch(new RegExp(`<${tag}[\\s>]`));
	});
	it('is the body of Help and of the Reference entries, which no longer use Help', () => {
		expect(src('./Help.svelte')).toMatch(/import SrdLines from '\.\/SrdLines\.svelte'/);
		const ref = src('../../routes/reference/+page.svelte');
		expect(ref).toMatch(/<SrdLines /);
		expect(ref).not.toMatch(/<Help[\s/>]/);
	});
});

describe('reference.count', () => {
	it('pluralises and formats the count per language', () => {
		expect(translate('en', 'reference.count', { count: 1 })).toBe('1 entry');
		expect(translate('en', 'reference.count', { count: 1234 })).toBe('1,234 entries');
		expect(translate('fr', 'reference.count', { count: 1234 })).toBe('1 234 entrées');
		expect(translate('fr', 'reference.count', { count: 9 })).not.toBe(translate('en', 'reference.count', { count: 9 }));
	});
});
