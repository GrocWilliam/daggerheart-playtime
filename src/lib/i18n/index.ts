import * as z from 'zod';
import en from './en.json';
import fr from './fr.json';

export type Lang = 'en' | 'fr';
export const LANGS: readonly Lang[] = ['en', 'fr'];

const dictionaries: Record<Lang, Record<string, string>> = { en, fr };

/** A supported language code. */
export const LANG_ERROR = 'lang must be "en" or "fr"';
export const langSchema = z.enum(['en', 'fr'], { error: LANG_ERROR });

/** Cookie first, then the first supported language of Accept-Language, then en. */
export function resolveLang(cookie: string | undefined | null, acceptLanguage: string | null): Lang {
	const c = langSchema.safeParse(cookie);
	if (c.success) return c.data;
	for (const part of (acceptLanguage ?? '').split(',')) {
		const primary = part.split(';')[0].trim().toLowerCase().split('-')[0];
		const p = langSchema.safeParse(primary);
		if (p.success) return p.data;
	}
	return 'en';
}

export type Params = Record<string, string | number>;

/** Formats a number for a language (`fr` groups thousands with U+202F). */
export function formatNumber(lang: Lang, n: number): string {
	return new Intl.NumberFormat(lang).format(n);
}

function lookup(lang: Lang, key: string, count: number | undefined): string | undefined {
	const d = dictionaries[lang];
	if (count !== undefined) {
		const cat = new Intl.PluralRules(lang).select(count);
		return d[`${key}.${cat}`] ?? d[`${key}.other`] ?? d[key];
	}
	return d[key];
}

/**
 * Translates a key. `{name}` placeholders come from `params`; when `params.count` is a number,
 * `key.<plural category>` then `key.other` are tried before `key`. Falls back to English, then the key.
 */
export function translate(lang: Lang, key: string, params?: Params): string {
	const count = typeof params?.count === 'number' ? params.count : undefined;
	const text = lookup(lang, key, count) ?? lookup('en', key, count) ?? key;
	if (!params) return text;
	return text.replace(/\{(\w+)\}/g, (m, name: string) => {
		const v = params[name];
		if (v === undefined) return m;
		return typeof v === 'number' ? formatNumber(lang, v) : String(v);
	});
}
