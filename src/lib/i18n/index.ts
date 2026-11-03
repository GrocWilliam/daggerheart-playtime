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

/** Translates a key, falling back to English and then to the key itself. */
export function translate(lang: Lang, key: string): string {
	return dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
}
