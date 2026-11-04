import { describe, expect, it, vi } from 'vitest';

// Replace the catalogs with small ones so the tests control every key.
vi.mock('../../../src/lib/i18n/en.json', () => ({
	default: {
		greet: 'Hi {name}',
		two: '{a} and {b}',
		'apple.one': '{count} apple',
		'apple.other': '{count} apples',
		'pear.other': '{count} pears',
		'plum.one': 'one plum',
		'plum.other': 'many plums',
		plain: 'Plain',
		'onlyen.one': 'x',
		'onlyen.other': 'xs',
		'enonly': 'English only'
	}
}));
vi.mock('../../../src/lib/i18n/fr.json', () => ({
	default: {
		greet: 'Salut {name}',
		'apple.one': '{count} pomme',
		'apple.other': '{count} pommes',
		'pear.other': '{count} poires',
		'plum.one': 'une prune',
		'plum.other': 'des prunes',
		plain: 'Simple'
	}
}));

import { translate, formatNumber } from '../../../src/lib/i18n';

describe('translate placeholders', () => {
	it('replaces {name} from params', () => {
		expect(translate('en', 'greet', { name: 'A' })).toBe('Hi A');
		expect(translate('fr', 'greet', { name: 'A' })).toBe('Salut A');
		expect(translate('en', 'two', { a: 1, b: 'z' })).toBe('1 and z');
	});
	it('leaves a placeholder untouched when its param is missing', () => {
		expect(translate('en', 'greet', {})).toBe('Hi {name}');
		expect(translate('en', 'greet')).toBe('Hi {name}');
		expect(translate('en', 'two', { a: 'x' })).toBe('x and {b}');
	});
	it('keeps existing calls working', () => {
		expect(translate('fr', 'plain')).toBe('Simple');
		expect(translate('en', 'plain')).toBe('Plain');
	});
});

describe('translate plurals', () => {
	it('en: count 1 is one, count 2 is other (and 0 is other)', () => {
		expect(translate('en', 'apple', { count: 1 })).toBe('1 apple');
		expect(translate('en', 'apple', { count: 2 })).toBe('2 apples');
		expect(translate('en', 'apple', { count: 0 })).toBe('0 apples');
	});
	it('fr: count 1 is one, count 2 is other, 0 is one', () => {
		expect(translate('fr', 'apple', { count: 1 })).toBe('1 pomme');
		expect(translate('fr', 'apple', { count: 2 })).toBe('2 pommes');
		expect(translate('fr', 'apple', { count: 0 })).toBe('0 pomme');
		expect(translate('fr', 'plum', { count: 0 })).toBe('une prune');
	});
	it('falls back to key.other when the category entry is missing', () => {
		expect(translate('en', 'pear', { count: 1 })).toBe('1 pears');
		expect(translate('fr', 'pear', { count: 1 })).toBe('1 poires');
	});
	it('uses the plain key when count is not a number', () => {
		expect(translate('en', 'plain', { count: 1 })).toBe('Plain');
		expect(translate('en', 'apple', { count: '1' as unknown as number })).not.toBe('1 apple');
	});
});

describe('translate fallbacks', () => {
	it('a key missing in fr falls back to English', () => {
		expect(translate('fr', 'enonly')).toBe('English only');
	});
	it('a key missing everywhere returns the key', () => {
		expect(translate('fr', 'nope.nothing')).toBe('nope.nothing');
		expect(translate('en', 'nope.nothing', { count: 3 })).toBe('nope.nothing');
	});
});

describe('formatNumber', () => {
	it('en groups with commas', () => {
		expect(formatNumber('en', 1234567)).toBe('1,234,567');
		expect(formatNumber('en', 999)).toBe('999');
		expect(formatNumber('en', 0)).toBe('0');
	});
	it('fr has no comma and groups with U+202F', () => {
		const s = formatNumber('fr', 1234567);
		expect(s).not.toContain(',');
		expect(s).toBe('1 234 567');
		expect(formatNumber('fr', 999)).toBe('999');
	});
});
