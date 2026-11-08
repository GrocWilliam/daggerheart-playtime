// us-220 unit tests: the French text of the 18 ancestries and 9 communities.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { listSrd, localizedSrd, sameShape, TRANSLATED_FIELDS } from '../../../src/lib/server/features/srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const KINDS = ['ancestries', 'communities'] as const;
const FR: Record<string, Record<string, Any>> = {};
const EN: Record<string, Any[]> = {};
for (const k of KINDS) {
	FR[k] = JSON.parse(read(`src/lib/srd/fr/${k}.json`));
	EN[k] = JSON.parse(read(`src/lib/srd/core/${k}.json`));
}

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

describe('ancestries and communities', () => {
	test('there are 18 ancestries and 9 communities', () => {
		expect(EN.ancestries.length).toBe(18);
		expect(EN.communities.length).toBe(9);
	});

	for (const kind of KINDS) {
		test(`${kind}: every element has every translated field, in the English shape, keeping dice and numbers`, () => {
			const problems: string[] = [];
			for (const c of EN[kind]) {
				const entry = FR[kind][c.id];
				if (!entry) { problems.push(`${c.id}: missing`); continue; }
				for (const f of TRANSLATED_FIELDS[kind]) {
					if (!(f in c) || empty(c[f])) continue;
					if (empty(entry[f])) { problems.push(`${c.id}.${f}: missing`); continue; }
					if (Array.isArray(c[f]) && (!Array.isArray(entry[f]) || entry[f].length !== c[f].length)) problems.push(`${c.id}.${f}: length`);
					for (const [e, t] of pairs(c[f], entry[f]))
						for (const n of numbers(e)) if (!numbers(t).includes(n)) problems.push(`${c.id}.${f}: "${n}" missing from "${t}"`);
				}
			}
			expect(problems).toEqual([]);
		});

		test(`${kind}: names are kept (non-empty strings)`, () => {
			for (const c of EN[kind]) expect(typeof FR[kind][c.id]?.name === 'string' && FR[kind][c.id].name.trim().length > 0, c.id).toBe(true);
		});

		test(`${kind}: each translated field other than name differs from the English text`, () => {
			const same: string[] = [];
			for (const c of EN[kind])
				for (const f of TRANSLATED_FIELDS[kind].filter((x) => x !== 'name')) {
					if (!(f in c) || empty(c[f])) continue;
					if (empty(FR[kind][c.id]?.[f])) { same.push(`${c.id}.${f}: missing`); continue; }
					const ps = pairs(c[f], FR[kind][c.id]?.[f]);
					if (!ps.length || ps.every(([e, t]) => e === t)) { same.push(`${c.id}.${f}`); continue; }
					const untouched = ps.filter(([e, t]) => e === t && e.split(/\s+/).length > 4);
					if (untouched.length) same.push(`${c.id}.${f}: "${untouched[0][0]}"`);
				}
			expect(same).toEqual([]);
		});

		test(`${kind}: no French value contains the whole words Hope, Fear, Spotlight or Hit Points`, () => {
			const bad: string[] = [];
			const re = /\b(Hope|Fear|Spotlight|Hit Points)\b/;
			const walk = (v: Any, id: string) => {
				if (typeof v === 'string') { if (re.test(v)) bad.push(`${id}: ${v.match(re)![0]}`); }
				else if (Array.isArray(v)) v.forEach((x) => walk(x, id));
				else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, id));
			};
			walk(FR[kind], kind);
			expect(bad).toEqual([]);
		});

		test(`${kind}: served in French with plain-string leaves in the English shape`, () => {
			const problems: string[] = [];
			for (const c of EN[kind]) {
				const loc = localizedSrd(kind, c.id, 'fr');
				if (!loc) { problems.push(`${c.id}: not served`); continue; }
				for (const f of TRANSLATED_FIELDS[kind].filter((x) => x !== 'name'))
					if (f in c && !empty(c[f]) && loc.langs[f] !== 'fr') problems.push(`${c.id}.${f}: lang ${loc.langs[f]}`);
				if (!sameShape(c.features, FR[kind][c.id]?.features)) problems.push(`${c.id}: features shape`);
			}
			expect(problems).toEqual([]);
			const ids = new Set(listSrd(kind, 'fr').map((e) => e.id));
			for (const c of EN[kind]) expect(ids.has(c.id)).toBe(true);
		});
	}
});

describe('srd-fr.test.ts', () => {
	test('sets DONE.ancestries and DONE.communities', () => {
		const src = read('src/lib/server/features/srd-fr.test.ts');
		expect(src).toMatch(/\bancestries['"]?\s*:/);
		expect(src).toMatch(/\bcommunities['"]?\s*:/);
	});
});

describe('TERMS.md', () => {
	test('still holds every row it had before this story', () => {
		const now = new Set(read('src/lib/srd/fr/TERMS.md').split('\n').map((l) => l.trim()));
		const before: string[] = JSON.parse(read('tests/acceptance/us-220/terms-rows.json'));
		expect(before.length).toBeGreaterThan(30);
		expect(before.filter((r) => !now.has(r))).toEqual([]);
	});
});
