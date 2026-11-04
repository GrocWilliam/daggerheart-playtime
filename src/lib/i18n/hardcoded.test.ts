import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'svelte/compiler';
import en from './en.json';
import fr from './fr.json';

const ROOT = path.resolve(__dirname, '../../..');
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((f) => {
		const p = path.join(dir, f);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
const sources = [...walk(path.join(ROOT, 'src/routes')), ...walk(path.join(ROOT, 'src/lib'))].filter(
	(f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.test.ts')
);
const svelteFiles = sources.filter((f) => f.endsWith('.svelte'));
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Static user-visible text of a .svelte source: text nodes and literal aria-label/title/placeholder/alt. */
export function hardCoded(source: string): string[] {
	const out: string[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const visit = (n: any): void => {
		if (!n || typeof n !== 'object') return;
		if (n.type === 'Text' && hasLetters(n.data ?? '')) out.push(`text: ${n.data.trim()}`);
		if (n.type === 'Attribute' && ATTRS.includes(n.name) && n.value !== true) {
			for (const p of Array.isArray(n.value) ? n.value : [n.value])
				if (p?.type === 'Text' && hasLetters(p.data)) out.push(`${n.name}: ${p.data}`);
		}
		for (const k of ['fragment', 'nodes', 'attributes', 'children', 'consequent', 'alternate', 'body', 'fallback', 'pending', 'then', 'catch']) {
			const c = n[k];
			if (Array.isArray(c)) c.forEach(visit);
			else visit(c);
		}
	};
	visit(parse(source, { modern: true }).fragment);
	return out;
}

describe('hard-coded text scanner', () => {
	it('flags a hard-coded button, attribute values, and accepts expressions', () => {
		expect(hardCoded('<button>Save</button>')).toHaveLength(1);
		expect(hardCoded('<input placeholder="Name" aria-label="x1" />')).toHaveLength(2);
		expect(hardCoded('<button title={t("a")}>{t("b")} 12 ×</button>')).toEqual([]);
	});
	it('finds nothing in src/routes and src/lib', () => {
		const bad = svelteFiles.flatMap((f) => hardCoded(readFileSync(f, 'utf8')).map((o) => `${path.relative(ROOT, f)} -> ${o}`));
		expect(bad).toEqual([]);
	});
});

describe('catalog keys', () => {
	const cat = { en, fr } as Record<string, Record<string, string>>;
	const text = sources.map((f) => readFileSync(f, 'utf8')).join('\n');
	const used = new Set<string>();
	const prefixes: string[] = [];
	for (const m of text.matchAll(/\b(?:t|translate)\(\s*(?:[\w.]+,\s*)?(?:(['"])([^'"]*)\1|(`)([^`]*)`)/g)) {
		const k = m[2] ?? m[4];
		if (m[3] && k.includes('${')) prefixes.push(k.slice(0, k.indexOf('${')));
		else used.add(k);
	}
	// keys passed around as plain string literals (tables of keys, server-side error keys)
	const known = new Set(Object.keys(en).map((k) => k.replace(/\.(one|other|zero|two|few|many)$/, '')));
	for (const m of text.matchAll(/(['"`])([\w][\w.\-]*)\1/g)) if (known.has(m[2])) used.add(m[2]);
	const base = (k: string) => k.replace(/\.(one|other|zero|two|few|many)$/, '');
	const isUsed = (k: string) => used.has(k) || used.has(base(k)) || prefixes.some((p) => k.startsWith(p));

	it('every static key exists in both catalogs', () => {
		const missing = [...used].filter((k) => !known.has(k) && /^[a-z]+\.[\w.\-]+$/.test(k) && text.match(new RegExp(`\\b(?:t|translate)\\([^)]*['"]${k.replace(/\./g, '\\.')}['"]`)));
		expect(missing).toEqual([]);
		for (const l of ['en', 'fr']) for (const k of used) if (known.has(k)) expect(k in cat[l] || `${k}.other` in cat[l], `${l}:${k}`).toBe(true);
	});
	it('both catalogs have the same keys', () => {
		expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
	});
	it('no catalog key is unused', () => {
		expect(Object.keys(en).filter((k) => !isUsed(k))).toEqual([]);
	});
});
