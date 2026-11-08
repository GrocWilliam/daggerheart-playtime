// Checks the French SRD overlays in src/lib/srd/fr/ against the English data.
import { describe, expect, it } from 'vitest';
import { frEntries, listSrd, localizedSrd, sameShape, SRD_KINDS, TRANSLATED_FIELDS, type SrdKind } from './srd';

/** Kinds (and ids, by filter) whose translation is complete. Translation stories fill it in. */
const DONE: Partial<Record<SrdKind, (id: string) => boolean>> = {
	classes: () => true,
	subclasses: () => true,
	ancestries: () => true,
	communities: () => true,
	'domain-cards': () => true,
	items: () => true,
	consumables: () => true,
	rules: () => true,
	adversaries: () => true,
	environments: (id) => { const tier = Number(english('environments', id)?.tier); return tier <= 2; },
};

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

	const done = DONE[kind];
	if (done) {
		it('translates every field of every done element, keeping dice and numbers', () => {
			const ids = listSrd(kind, 'en').map((e) => e.id).filter(done);
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
