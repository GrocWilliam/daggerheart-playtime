// us-222 unit tests: French text of weapons and armors.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { listSrd, localizedSrd, sameShape, TRANSLATED_FIELDS, type SrdKind } from '../../../src/lib/server/features/srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const KINDS = [['weapons', 192], ['armors', 34]] as const;

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
const FRS: Record<string, Record<string, Any>> = {};
const ENS: Record<string, Any[]> = {};
for (const [kind] of KINDS) {
	FRS[kind] = JSON.parse(read(`src/lib/srd/fr/${kind}.json`));
	ENS[kind] = JSON.parse(read(`src/lib/srd/core/${kind}.json`));
}

for (const [kind, count] of KINDS) {
	const FR = FRS[kind];
	const EN = ENS[kind];
	const fields = TRANSLATED_FIELDS[kind as SrdKind];

	describe(kind, () => {
		test(`there are ${count} of them`, () => expect(EN.length).toBe(count));

		test('each has every translated field the English element has, in the English shape, keeping dice and numbers', () => {
			const problems: string[] = [];
			for (const e of EN) {
				const entry = FR[e.id];
				if (!entry) { problems.push(`${e.id}: missing`); continue; }
				for (const f of fields) {
					if (!(f in e) || empty(e[f])) continue;
					if (empty(entry[f])) { problems.push(`${e.id}.${f}: missing`); continue; }
					for (const [en, t] of pairs(e[f], entry[f]))
						for (const n of numbers(en)) if (!numbers(t).includes(n)) problems.push(`${e.id}.${f}: "${n}" missing from "${t}"`);
				}
			}
			expect(problems).toEqual([]);
		});

		test('French elements are served with plain-string leaves and the English shape', () => {
			const problems: string[] = [];
			for (const e of EN) {
				const loc = localizedSrd(kind as SrdKind, e.id, 'fr');
				if (!loc) { problems.push(`${e.id}: not served`); continue; }
				for (const f of fields) {
					if (!(f in e) || empty(e[f]) || f === 'name') continue;
					if (loc.langs[f] !== 'fr') problems.push(`${e.id}: ${f} lang is ${loc.langs[f]}`);
					if (!sameShape(e[f], FR[e.id]?.[f])) problems.push(`${e.id}.${f}: shape`);
				}
			}
			expect(problems).toEqual([]);
		});

		test('names are kept: every element has a non-empty French name', () => {
			for (const e of EN) expect(typeof FR[e.id]?.name === 'string' && FR[e.id].name.trim().length > 0, e.id).toBe(true);
		});

		test('listSrd in French serves them all', () => {
			const ids = new Set(listSrd(kind as SrdKind, 'fr').map((e) => e.id));
			for (const e of EN) expect(ids.has(e.id)).toBe(true);
		});

		test('no French value contains the whole words Hope, Fear, Armor Slot or Hit Points', () => {
			const bad: string[] = [];
			const re = /\b(Hope|Fear|Armor Slot|Hit Points)\b/;
			const walk = (v: Any, id: string) => {
				if (typeof v === 'string') { if (re.test(v)) bad.push(`${id}: ${v.match(re)![0]}`); }
				else if (Array.isArray(v)) v.forEach((x) => walk(x, id));
				else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, id));
			};
			for (const [id, v] of Object.entries(FR)) walk(v, id);
			expect(bad).toEqual([]);
		});
	});
}

describe('recurring features', () => {
	test('every English feature name that appears on several weapons or armors has a single French translation across both files', () => {
		const byName = new Map<string, Map<string, string[]>>();
		for (const [kind] of KINDS)
			for (const e of ENS[kind]) {
				(e.features ?? []).forEach((f: Any, i: number) => {
					const name = f.name['en-US'];
					const fr = FRS[kind][e.id]?.features?.[i]?.name;
					const frName = typeof fr === 'string' ? fr : fr?.['en-US'];
					const m = byName.get(name) ?? new Map<string, string[]>();
					m.set(String(frName), [...(m.get(String(frName)) ?? []), e.id]);
					byName.set(name, m);
				});
			}
		const recurring = [...byName].filter(([, m]) => [...m.values()].flat().length > 1);
		expect(recurring.length).toBeGreaterThan(10);
		const bad = recurring.filter(([, m]) => m.size !== 1).map(([n, m]) => `${n}: ${[...m.keys()].join(' / ')}`);
		expect(bad).toEqual([]);
		expect(recurring.filter(([, m]) => m.has('undefined')).map(([n]) => n)).toEqual([]);
	});
});

describe('srd-fr.test.ts', () => {
	test('DONE.weapons and DONE.armors accept every id', () => {
		const src = read('src/lib/server/features/srd-fr.test.ts');
		for (const [kind] of KINDS) expect(src, kind).toMatch(new RegExp(`['"]?${kind}['"]?\\s*:\\s*\\(\\)\\s*=>\\s*true`));
	});
});

describe('TERMS.md', () => {
	test('still holds every row it had before this story', () => {
		const now = new Set(read('src/lib/srd/fr/TERMS.md').split('\n').map((l) => l.trim()));
		const before: string[] = JSON.parse(read('tests/acceptance/us-222/terms-rows.json'));
		expect(before.filter((r) => !now.has(r))).toEqual([]);
	});
});
