import en from './en.json';
import fr from './fr.json';

export type Lang = 'en' | 'fr';
export const LANGS: readonly Lang[] = ['en', 'fr'];

const dictionaries: Record<Lang, Record<string, string>> = { en, fr };

export function isLang(v: unknown): v is Lang {
	return v === 'en' || v === 'fr';
}

/** Cookie first, then the first supported language of Accept-Language, then en. */
export function resolveLang(cookie: string | undefined | null, acceptLanguage: string | null): Lang {
	if (isLang(cookie)) return cookie;
	for (const part of (acceptLanguage ?? '').split(',')) {
		const primary = part.split(';')[0].trim().toLowerCase().split('-')[0];
		if (isLang(primary)) return primary;
	}
	return 'en';
}

/** Translates a key, falling back to English and then to the key itself. */
export function translate(lang: Lang, key: string): string {
	return dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
}
