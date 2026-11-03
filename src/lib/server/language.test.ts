import { describe, expect, it } from 'vitest';
import { langSchema, resolveLang } from '$lib/i18n';
import { parse } from './campaigns';
import { languageBodySchema } from './language';

const MSG = 'lang must be "en" or "fr"';
const msg = (v: unknown) => languageBodySchema.safeParse(v).error?.issues[0].message;

describe('langSchema', () => {
	it('accepts en and fr only', () => {
		expect(langSchema.parse('en')).toBe('en');
		expect(langSchema.parse('fr')).toBe('fr');
		for (const v of ['EN', 'de', '', 'en-US', null, undefined, 1]) {
			expect(langSchema.safeParse(v).error?.issues[0].message).toBe(MSG);
		}
	});
	it('resolveLang falls back to en on a bad cookie', () => {
		expect(resolveLang('xx', null)).toBe('en');
		expect(resolveLang('xx', 'fr-CA,en')).toBe('fr');
	});
});

describe('languageBodySchema', () => {
	it('accepts a valid body', () => {
		expect(parse(languageBodySchema, { lang: 'fr', extra: 1 })).toEqual({ lang: 'fr' });
	});
	it('rejects bad bodies with the legacy message', () => {
		for (const v of [{}, { lang: 'de' }, { lang: null }, null, [], 'fr', 5]) expect(msg(v)).toBe(MSG);
	});
});
