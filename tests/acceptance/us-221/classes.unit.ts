// us-221 unit tests: French text of the 9 classes and 18 subclasses.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { listSrd, localizedSrd, pickList, sameShape, subclassesOf, TRANSLATED_FIELDS } from '../../../src/lib/server/features/srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const KINDS = ['classes', 'subclasses'] as const;
const EN: Record<string, Any[]> = {
	classes: JSON.parse(read('src/lib/srd/core/classes.json')),
	subclasses: JSON.parse(read('src/lib/srd/core/subclasses.json'))
};
const FR: Record<string, Record<string, Any>> = {
	classes: JSON.parse(read('src/lib/srd/fr/classes.json')),
	subclasses: JSON.parse(read('src/lib/srd/fr/subclasses.json'))
};

function pairs(en: Any, fr: Any, out: [string, string][] = []): [string, string][] {
	if (typeof en === 'string') out.push([en, String(fr)]);
	else if (Array.isArray(en)) en.forEach((x, i) => pairs(x, fr?.[i], out));
	else if (en && typeof en === 'object') {
		if (typeof en['en-US'] === 'string' && Object.keys(en).length === 1) out.push([en['en-US'], String(fr)]);
		else for (const k of Object.keys(en)) pairs(en[k], fr?.[k], out);
	}
	return out;
}
const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
const numbers = (s: string): string[] => s.match(/\d+d\d+(\+\d+)?|\b\d+\b/g) ?? [];

test('there are 9 classes and 18 subclasses', () => {
	expect(EN.classes.length).toBe(9);
	expect(EN.subclasses.length).toBe(18);
});

describe.each(KINDS)('%s', (kind) => {
	test('every element has every translated field the English one has, in its shape, keeping dice and numbers', () => {
		const problems: string[] = [];
		for (const c of EN[kind]) {
			const entry = FR[kind][c.id];
			if (!entry) { problems.push(`${c.id}: missing`); continue; }
			for (const f of TRANSLATED_FIELDS[kind]) {
				if (!(f in c) || empty(c[f])) continue;
				if (empty(entry[f])) { problems.push(`${c.id}.${f}: missing`); continue; }
				if (f !== 'name' && !sameShape(c[f], entry[f])) problems.push(`${c.id}.${f}: shape`);
				if (f === 'name') continue;
				for (const [e, t] of pairs(c[f], entry[f]))
					for (const n of numbers(e)) if (!numbers(t).includes(n)) problems.push(`${c.id}.${f}: "${n}" missing from "${t}"`);
			}
		}
		expect(problems).toEqual([]);
	});

	test('names are kept: non-empty plain strings', () => {
		for (const c of EN[kind]) expect(typeof FR[kind][c.id]?.name === 'string' && FR[kind][c.id].name.trim() !== '', c.id).toBe(true);
	});

	test('each translated field other than name differs from the English text', () => {
		const same: string[] = [];
		for (const c of EN[kind])
			for (const f of TRANSLATED_FIELDS[kind].filter((x) => x !== 'name')) {
				if (!(f in c) || empty(c[f])) continue;
				if (empty(FR[kind][c.id]?.[f])) { same.push(`${c.id}.${f}: missing`); continue; }
				const ps = pairs(c[f], FR[kind][c.id][f]);
				if (JSON.stringify(ps.map((p) => p[0])) === JSON.stringify(ps.map((p) => p[1]))) same.push(`${c.id}.${f}`);
				else {
					const untouched = ps.filter(([e, t]) => e === t && e.split(/\s+/).length > 4);
					if (untouched.length) same.push(`${c.id}.${f}: "${untouched[0][0]}"`);
				}
			}
		expect(same).toEqual([]);
	});

	test('no French value contains the whole words Hope, Fear, Spotlight or Hit Points', () => {
		const bad: string[] = [];
		const re = /\b(Hope|Fear|Spotlight|Hit Points)\b/;
		const walk = (v: Any, id: string) => {
			if (typeof v === 'string') { if (re.test(v)) bad.push(`${id}: ${v.match(re)![0]}`); }
			else if (Array.isArray(v)) v.forEach((x) => walk(x, id));
			else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, id));
		};
		for (const [id, e] of Object.entries(FR[kind])) walk(e, id);
		expect(bad).toEqual([]);
	});

	test('served in French with all translated fields in French', () => {
		for (const c of EN[kind]) {
			const loc = localizedSrd(kind, c.id, 'fr')!;
			for (const f of TRANSLATED_FIELDS[kind].filter((x) => x !== 'name' && x in c && !empty(c[x]))) expect(loc.langs[f], `${c.id}.${f}`).toBe('fr');
		}
		expect(listSrd(kind, 'fr').length).toBe(EN[kind].length);
	});
});

test('class names are plain strings and unchanged', () => {
	const names: Record<string, string> = {
		core_class_bard: 'Barde', core_class_druid: 'Druide', core_class_guardian: 'Gardien', core_class_ranger: 'Rôdeur',
		core_class_rogue: 'Roublard', core_class_seraph: 'Séraphin', core_class_sorcerer: 'Ensorceleur', core_class_warrior: 'Guerrier'
	};
	for (const [id, n] of Object.entries(names)) expect(FR.classes[id].name).toBe(n);
});

test('French pick lists (tunnel): class and subclass help lines are all lang fr; values stay English', () => {
	const classes = pickList('classes', 'fr');
	expect(classes.length).toBe(9);
	for (const p of classes) {
		expect(p.lines.length, p.id).toBeGreaterThan(0);
		for (const l of p.lines) expect(l.lang, `${p.id}: ${l.text.slice(0, 40)}`).toBe('fr');
	}
	const subs = subclassesOf('Bard', 'fr');
	expect(subs.length).toBeGreaterThan(0);
	for (const p of subclassesOf('Bard', 'fr').concat(subclassesOf('Ranger', 'fr'), subclassesOf('Warrior', 'fr'))) {
		expect(p.lines.length, p.id).toBeGreaterThan(0);
		for (const l of p.lines) expect(l.lang, `${p.id}: ${l.text.slice(0, 40)}`).toBe('fr');
	}
});

describe('srd-fr.test.ts', () => {
	test('DONE.classes and DONE.subclasses accept every id (and the French files cover them)', () => {
		const src = read('src/lib/server/features/srd-fr.test.ts');
		expect(src).toMatch(/\bclasses\s*:\s*\(\s*\)\s*=>\s*true/);
		expect(src).toMatch(/\bsubclasses\s*:\s*\(\s*\)\s*=>\s*true/);
		for (const k of KINDS) for (const c of EN[k]) expect(FR[k][c.id], c.id).toBeTruthy();
	});
});

test('TERMS.md still holds every row it had before this story', () => {
	const now = new Set(read('src/lib/srd/fr/TERMS.md').split('\n').map((l) => l.trim()));
	const before: string[] = JSON.parse(read('tests/acceptance/us-221/terms-rows.json'));
	expect(before.length).toBeGreaterThan(10);
	expect(before.filter((r) => !now.has(r))).toEqual([]);
});
