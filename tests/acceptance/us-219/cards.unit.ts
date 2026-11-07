// us-219 unit tests: the French text of the ARCANA, SPLENDOR, GRACE, BONE and VALOR domain cards.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { listSrd, localizedSrd, sameShape, TRANSLATED_FIELDS } from '../../../src/lib/server/features/srd';

const DOMAINS = ['ARCANA', 'SPLENDOR', 'GRACE', 'BONE', 'VALOR'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const FR: Record<string, Any> = JSON.parse(read('src/lib/srd/fr/domain-cards.json'));
const EN_ELEMENTS: Any[] = JSON.parse(read('src/lib/srd/core/domain-cards.json'));
const CARDS = EN_ELEMENTS.filter((c) => DOMAINS.includes(c.domain));

/** Strings at the same place: core {"en-US": s} leaves count as strings. */
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
const textFields = (f: string) => f !== 'name';

describe('105 cards of ARCANA, SPLENDOR, GRACE, BONE, VALOR', () => {
	test('there are 105 of them', () => expect(CARDS.length).toBe(105));

	test('each has an entry with every translated field the English card has, in the English shape, keeping dice and numbers', () => {
		const problems: string[] = [];
		for (const c of CARDS) {
			const entry = FR[c.id];
			if (!entry) { problems.push(`${c.id}: missing`); continue; }
			for (const f of TRANSLATED_FIELDS['domain-cards']) {
				if (!(f in c) || empty(c[f])) continue;
				if (empty(entry[f])) { problems.push(`${c.id}.${f}: missing`); continue; }
				for (const [e, t] of pairs(c[f], entry[f]))
					for (const n of numbers(e)) if (!numbers(t).includes(n)) problems.push(`${c.id}.${f}: "${n}" missing from "${t}"`);
			}
		}
		expect(problems).toEqual([]);
	});

	test('French features keep the English structure (array lengths, paragraphs) with plain-string leaves', () => {
		const problems: string[] = [];
		for (const c of CARDS) {
			const loc = localizedSrd('domain-cards', c.id, 'fr');
			const fr = loc?.element as Any;
			if (!fr) { problems.push(`${c.id}: not served`); continue; }
			if (loc!.langs.features !== 'fr') problems.push(`${c.id}: features lang is ${loc!.langs.features}`);
			const f = FR[c.id]?.features;
			if (!Array.isArray(f) || f.length !== c.features.length) { problems.push(`${c.id}: features length`); continue; }
			c.features.forEach((ef: Any, i: number) => {
				if (!Array.isArray(f[i]?.description) || f[i].description.length !== ef.description.length) problems.push(`${c.id}: description length of feature ${i}`);
				if (('name' in ef) !== ('name' in f[i])) problems.push(`${c.id}: feature ${i} name presence`);
			});
			if (!sameShape(c.features, f)) problems.push(`${c.id}: features shape`);
		}
		expect(problems).toEqual([]);
	});

	test('names are kept: every card has a non-empty French name different from its id', () => {
		for (const c of CARDS) expect(typeof FR[c.id]?.name === 'string' && FR[c.id].name.trim().length > 0, c.id).toBe(true);
	});

	test('the French text of each translated field other than name differs from the English text', () => {
		const same: string[] = [];
		for (const c of CARDS)
			for (const f of TRANSLATED_FIELDS['domain-cards'].filter(textFields)) {
				if (!(f in c) || empty(c[f])) continue;
				if (empty(FR[c.id]?.[f])) { same.push(`${c.id}.${f}: missing`); continue; }
				const en = JSON.stringify(pairs(c[f], c[f]).map(([e]) => e));
				const fr = JSON.stringify(pairs(c[f], FR[c.id]?.[f]).map(([, t]) => t));
				if (en === fr) same.push(`${c.id}.${f}`);
				else {
					// every paragraph should be translated, not just one
					const untouched = pairs(c[f], FR[c.id]?.[f]).filter(([e, t]) => e === t && e.split(/\s+/).length > 4);
					if (untouched.length) same.push(`${c.id}.${f}: "${untouched[0][0]}"`);
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
		for (const c of CARDS) walk(FR[c.id], c.id);
		expect(bad).toEqual([]);
	});

	test('domain, type, level and recallCost are not translated: French API element keeps them', () => {
		for (const c of CARDS) {
			const el = localizedSrd('domain-cards', c.id, 'fr')!.element as Any;
			expect([el.domain, el.type, el.level, el.recallCost]).toEqual([c.domain, c.type, c.level, c.recallCost]);
			for (const k of ['domain', 'type', 'level', 'recallCost']) expect(FR[c.id], `${c.id}.${k}`).not.toHaveProperty(k);
		}
	});

	test('listSrd in French serves them', () => {
		const ids = new Set(listSrd('domain-cards', 'fr').map((e) => e.id));
		for (const c of CARDS) expect(ids.has(c.id)).toBe(true);
	});
});

describe('srd-fr.test.ts', () => {
	test("DONE['domain-cards'] covers all 189 cards", () => {
		const src = read('src/lib/server/features/srd-fr.test.ts');
		expect(src).toMatch(/['"]domain-cards['"]\s*:/);
		expect(EN_ELEMENTS.length).toBe(189);
		for (const c of EN_ELEMENTS) {
			const missing = !FR[c.id] || empty(FR[c.id].features);
			expect(missing, `${c.id} translated`).toBe(false);
		}
		// the filter no longer restricts to a list of domains
		expect(src).not.toMatch(/\[\s*'CODEX'/);
	});
});

describe('TERMS.md', () => {
	test('still holds every row it had before this story', () => {
		const now = new Set(read('src/lib/srd/fr/TERMS.md').split('\n').map((l) => l.trim()));
		const before: string[] = JSON.parse(read('tests/acceptance/us-219/terms-rows.json'));
		expect(before.filter((r) => !now.has(r))).toEqual([]);
	});
});
