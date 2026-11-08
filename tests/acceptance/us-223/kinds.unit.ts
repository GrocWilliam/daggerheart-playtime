// us-223 unit tests: French text of items, consumables and rules.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { listSrd, localizedSrd, sameShape, TRANSLATED_FIELDS, type SrdKind } from '../../../src/lib/server/features/srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const KINDS = [['items', 60], ['consumables', 60], ['rules', 14]] as const;

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

for (const [kind, count] of KINDS) {
	const FR: Record<string, Any> = JSON.parse(read(`src/lib/srd/fr/${kind}.json`));
	const EN: Any[] = JSON.parse(read(`src/lib/srd/core/${kind}.json`));
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

		test('the French text of each translated field other than name differs from the English text', () => {
			const same: string[] = [];
			for (const e of EN)
				for (const f of fields.filter((x) => x !== 'name')) {
					if (!(f in e) || empty(e[f])) continue;
					if (empty(FR[e.id]?.[f])) { same.push(`${e.id}.${f}: missing`); continue; }
					const ps = pairs(e[f], FR[e.id][f]);
					if (ps.every(([a, b]) => a === b)) same.push(`${e.id}.${f}`);
					else {
						const untouched = ps.filter(([a, b]) => a === b && a.split(/\s+/).length > 4);
						if (untouched.length) same.push(`${e.id}.${f}: "${untouched[0][0]}"`);
					}
				}
			expect(same).toEqual([]);
		});

		test('no French value contains the whole words Hope, Fear, Spotlight, Countdown or Hit Points', () => {
			const bad: string[] = [];
			const re = /\b(Hope|Fear|Spotlight|Countdown|Hit Points)\b/;
			const walk = (v: Any, id: string) => {
				if (typeof v === 'string') { if (re.test(v)) bad.push(`${id}: ${v.match(re)![0]}`); }
				else if (Array.isArray(v)) v.forEach((x) => walk(x, id));
				else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, id));
			};
			for (const [id, v] of Object.entries(FR)) walk(v, id);
			expect(bad).toEqual([]);
		});

		test('listSrd in French serves them all', () => {
			const ids = new Set(listSrd(kind as SrdKind, 'fr').map((e) => e.id));
			for (const e of EN) expect(ids.has(e.id)).toBe(true);
		});
	});
}

describe('srd-fr.test.ts', () => {
	test('DONE.items, DONE.consumables and DONE.rules accept every id', () => {
		const src = read('src/lib/server/features/srd-fr.test.ts');
		for (const [kind] of KINDS) expect(src, kind).toMatch(new RegExp(`['"]?${kind}['"]?\\s*:\\s*\\(\\)\\s*=>\\s*true`));
	});
});

describe('TERMS.md', () => {
	test('still holds every row it had before this story', () => {
		const now = new Set(read('src/lib/srd/fr/TERMS.md').split('\n').map((l) => l.trim()));
		const before: string[] = JSON.parse(read('tests/acceptance/us-223/terms-rows.json'));
		expect(before.filter((r) => !now.has(r))).toEqual([]);
	});
});
