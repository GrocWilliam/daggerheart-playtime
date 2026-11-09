// Checks the French SRD overlays in src/lib/srd/fr/ against the English data.
import { describe, expect, it } from 'vitest';
import { frEntries, listSrd, localizedSrd, sameShape, SRD_KINDS, TRANSLATED_FIELDS, type SrdKind } from './srd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const english = (kind: SrdKind, id: string): Record<string, any> | undefined => localizedSrd(kind, id, 'en')?.element;

/** Pairs of (English string, French string) found at the same place of two same-shape values. */
function pairs(en: unknown, fr: unknown, out: [string, string][] = []): [string, string][] {
	if (typeof en === 'string') out.push([en, String(fr)]);
	else if (Array.isArray(en)) en.forEach((x, i) => pairs(x, (fr as unknown[])[i], out));
	else if (en && typeof en === 'object') {
		const o = en as Record<string, unknown>;
		if (typeof o['en-US'] === 'string' && Object.keys(o).length === 1) out.push([o['en-US'] as string, String(fr)]);
		else for (const k of Object.keys(o)) pairs(o[k], (fr as Record<string, unknown>)[k], out);
	}
	return out;
}

const empty = (v: unknown): boolean =>
	v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

/** Dice expressions and standalone integers of a text. */
const numbers = (s: string): string[] => s.match(/\d+d\d+(\+\d+)?|\b\d+\b/g) ?? [];

// Every kind, every id is accepted (no allow-list):
// adversaries: () => true
// environments: () => true
// 'domain-cards': () => true
// domains: () => true
// rules: () => true
// consumables: () => true
// items: () => true
// armors: () => true
// weapons: () => true
// subclasses: () => true
// classes: () => true
// communities: () => true
// ancestries: () => true
describe.each(SRD_KINDS)('French overlay %s', (kind) => {
	const fr = frEntries(kind);
	it('is a JSON object', () => {
		expect(fr && typeof fr === 'object' && !Array.isArray(fr)).toBe(true);
	});
	it('has only English ids', () => {
		expect(Object.keys(fr).filter((id) => !english(kind, id))).toEqual([]);
	});
	it('has only translated fields', () => {
		const bad = Object.entries(fr).flatMap(([id, e]) => Object.keys(e).filter((f) => !TRANSLATED_FIELDS[kind].includes(f)).map((f) => `${id}.${f}`));
		expect(bad).toEqual([]);
	});
	it('gives every field the English shape', () => {
		const bad = Object.entries(fr).flatMap(([id, e]) => {
			const en = english(kind, id);
			return en ? Object.keys(e).filter((f) => !(f in en) || !sameShape(en[f], e[f])).map((f) => `${id}.${f}`) : [];
		});
		expect(bad).toEqual([]);
	});

	{
		it('translates every field of every element, keeping dice and numbers', () => {
			const ids = listSrd(kind, 'en').map((e) => e.id);
			const problems: string[] = [];
			for (const id of ids) {
				const entry = fr[id];
				if (!entry) {
					problems.push(`${id}: missing`);
					continue;
				}
				const en = english(kind, id)!;
				for (const f of TRANSLATED_FIELDS[kind]) {
					if (!(f in en) || empty(en[f])) continue;
					if (empty(entry[f])) {
						problems.push(`${id}.${f}: missing`);
						continue;
					}
					for (const [e, t] of pairs(en[f], entry[f]))
						for (const n of numbers(e)) if (!numbers(t).includes(n)) problems.push(`${id}.${f}: "${n}" missing from "${t}"`);
				}
			}
			expect(problems).toEqual([]);
		});
	}
});

describe('French weapons and armors', () => {
	const kinds = ['weapons', 'armors'] as const;
	const feats = kinds.flatMap((k) =>
		Object.entries(frEntries(k)).flatMap(([id, e]) => {
			const en = english(k, id)?.features as { name: { 'en-US': string } }[] | undefined;
			const fe = (e.features ?? []) as { name: string; description: { paragraph: string }[] }[];
			return fe.map((f, i) => ({ id, en: en![i].name['en-US'], fr: f.name, text: f.description.map((d) => d.paragraph).join(' ') }));
		})
	);
	it('uses one French name per English feature name', () => {
		const names = new Map<string, Set<string>>();
		for (const f of feats) names.set(f.en, (names.get(f.en) ?? new Set()).add(f.fr));
		expect([...names].filter(([, s]) => s.size > 1).map(([n]) => n)).toEqual([]);
	});
	it('keeps the English terms out of the French values', () => {
		const bad = feats.filter((f) => /\b(Hope|Fear|Armor Slot|Hit Points)\b/.test(`${f.fr} ${f.text}`)).map((f) => f.id);
		expect(bad).toEqual([]);
	});
});
