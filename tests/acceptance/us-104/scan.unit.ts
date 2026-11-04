import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'svelte/compiler';
import en from '../../../src/lib/i18n/en.json';
import fr from '../../../src/lib/i18n/fr.json';

const ROOT = path.resolve(__dirname, '../../..');
function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = path.join(dir, f);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}
const files = [...walk(path.join(ROOT, 'src/routes')), ...readdirSync(path.join(ROOT, 'src/lib')).map((f) => path.join(ROOT, 'src/lib', f))].filter((f) => f.endsWith('.svelte'));
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
const hasLetters = (s: string) => /\p{L}/u.test(s);

// Independent re-implementation of the story's scan (static text only; {...} is exempt).
function offenders(source: string): string[] {
	const out: string[] = [];
	const ast = parse(source, { modern: true }) as any;
	const visit = (n: any) => {
		if (!n || typeof n !== 'object') return;
		if (n.type === 'Text' && hasLetters(n.data ?? '')) out.push(`text: ${n.data.trim()}`);
		if (n.type === 'Attribute' && ATTRS.includes(n.name)) {
			const v = n.value;
			if (v === true) return;
			const parts = Array.isArray(v) ? v : [v];
			for (const p of parts) if (p?.type === 'Text' && hasLetters(p.data)) out.push(`${n.name}: ${p.data}`);
		}
		for (const k of ['fragment', 'nodes', 'attributes', 'children', 'consequent', 'alternate', 'body', 'fallback', 'pending', 'then', 'catch']) {
			const c = n[k];
			if (Array.isArray(c)) c.forEach(visit);
			else if (c) visit(c);
		}
	};
	visit(ast.fragment);
	return out;
}

describe('hard-coded UI text', () => {
	it('the scan itself flags <button>Save</button>', () => {
		expect(offenders('<button>Save</button>').length).toBe(1);
		expect(offenders('<img alt="Logo" />').length).toBe(1);
		expect(offenders('<button>{t("a")}</button>').length).toBe(0);
	});
	it('no .svelte file under src/routes or src/lib has hard-coded text', () => {
		const bad = files.flatMap((f) => offenders(readFileSync(f, 'utf8')).map((o) => `${path.relative(ROOT, f)} -> ${o}`));
		expect(bad).toEqual([]);
	});
});

describe('story deliverables', () => {
	it('src/lib/i18n/hardcoded.test.ts exists and has the Save fixture', () => {
		const p = path.join(ROOT, 'src/lib/i18n/hardcoded.test.ts');
		expect(existsSync(p)).toBe(true);
		expect(readFileSync(p, 'utf8')).toMatch(/<button>Save<\/button>/);
	});
	it('every static t(...)/translate(...) key exists in both catalogs', () => {
		const re = /\b(?:t|translate)\(\s*(?:[a-zA-Z.]+,\s*)?(['"])([\w.\-]+)\1/g;
		const missing: string[] = [];
		const srcs = [...files, ...walk(path.join(ROOT, 'src/routes')).filter((f) => f.endsWith('.ts'))];
		for (const f of srcs) {
			const text = readFileSync(f, 'utf8');
			for (const m of text.matchAll(re)) {
				const k = m[2];
				for (const [n, d] of [['en', en], ['fr', fr]] as const) {
					const dd = d as Record<string, string>;
					if (!(k in dd) && !(`${k}.other` in dd)) missing.push(`${n}:${k} (${path.relative(ROOT, f)})`);
				}
			}
		}
		expect(missing).toEqual([]);
	});
	it('catalogs have the same keys', () => {
		expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
	});
	it('French values differ from English for the new keys (a real translation)', () => {
		const oldKeys = new Set(Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'tests/acceptance/us-104/old-keys.json'), 'utf8'))));
		const same = Object.keys(en).filter((k) => !oldKeys.has(k) && (en as any)[k] === (fr as any)[k] && /\p{L}{4,}/u.test((en as any)[k]));
		// a few cognates are fine (e.g. "Actions"); wholesale copies are not
		expect(same.length).toBeLessThanOrEqual(3);
	});
});
