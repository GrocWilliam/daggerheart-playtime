import { readFileSync } from 'node:fs';
import * as z from 'zod';
import type { Lang } from '$lib/i18n';

export const SRD_KINDS = [
	'classes',
	'subclasses',
	'ancestries',
	'communities',
	'domains',
	'domain-cards',
	'weapons',
	'armors',
	'consumables',
	'items',
	'rules'
] as const;
export type SrdKind = (typeof SRD_KINDS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
export type SrdElement = Raw & { id: string };

const FILES: Record<Exclude<SrdKind, 'domains'>, string> = {
	classes: 'classes.json',
	subclasses: 'subclasses.json',
	ancestries: 'ancestries.json',
	communities: 'communities.json',
	'domain-cards': 'domain-cards.json',
	weapons: 'weapons.json',
	armors: 'armors.json',
	consumables: 'consumables.json',
	items: 'items.json',
	rules: 'rules.json'
};

// Files are read once at startup. Located relative to the source in dev/tests
// and relative to the working directory (the repo root) in the built server.
function readSrdFile(file: string): string {
	const candidates = [
		new URL(`../srd/${file}`, import.meta.url),
		new URL(`file://${process.cwd()}/src/lib/srd/${file}`)
	];
	for (const url of candidates) {
		try {
			return readFileSync(url, 'utf8');
		} catch {
			/* try next */
		}
	}
	throw new Error(`SRD file not found: ${file}`);
}

function readCore(file: string): Raw[] {
	return JSON.parse(readSrdFile(`core/${file}`));
}

function englishName(kind: SrdKind, e: Raw): string {
	if (kind === 'classes') {
		const n = String(e.name);
		return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
	}
	return e.name['en-US'];
}

const data = new Map<SrdKind, { element: SrdElement; name: string }[]>();
for (const [kind, file] of Object.entries(FILES) as [SrdKind, string][]) {
	data.set(
		kind,
		readCore(file).map((e) => ({ element: e as SrdElement, name: englishName(kind, e) }))
	);
}
{
	const names = [
		...new Set(readCore('domain-cards.json').map((c) => String(c.domain)))
	].map((d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase());
	names.sort();
	data.set(
		'domains',
		names.map((name) => ({
			element: { id: `core_domain_${name.toLowerCase()}`, name: { 'en-US': name } },
			name
		}))
	);
}

/** The `[kind]` route param (404 on rejection). */
export const srdKindSchema = z.enum(SRD_KINDS, { error: 'unknown SRD kind' });

/** The `[id]` route param (404 on rejection; unknown ids are caught by the lookup). */
export const srdIdSchema = z.string({ error: 'unknown SRD element' }).min(1, { error: 'unknown SRD element' });

/** Reference page query: an unknown or missing `kind` means all kinds, a missing `q` is empty. */
export const srdSearchSchema = z.object({
	kind: srdKindSchema.optional().catch(undefined),
	q: z.string().catch('')
});

const fr: Record<string, string> = JSON.parse(readSrdFile('fr.json'));

function localize(id: string, name: string, lang: Lang): string {
	return lang === 'fr' ? (fr[id] ?? name) : name;
}

export function listSrd(kind: SrdKind, lang: Lang): { id: string; name: string }[] {
	return data.get(kind)!.map((d) => ({ id: d.element.id, name: localize(d.element.id, d.name, lang) }));
}

export function getSrd(kind: SrdKind, id: string, lang: Lang): (SrdElement & { nameLocalized: string }) | null {
	const d = data.get(kind)!.find((x) => x.element.id === id);
	return d ? { ...d.element, nameLocalized: localize(d.element.id, d.name, lang) } : null;
}

const domainsEn: Record<string, string> = Object.fromEntries(
	(JSON.parse(readSrdFile('domains.json')) as { id: string; en: string }[]).map((d) => [d.id, d.en])
);

// Collects the English SRD text of an element (descriptions, features), in order.
function collectText(node: unknown, out: string[]): void {
	if (Array.isArray(node)) node.forEach((n) => collectText(n, out));
	else if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node as Raw)) {
			if (k === 'en-US' && typeof v === 'string') out.push(v);
			else collectText(v, out);
		}
	}
}

function englishLines(kind: SrdKind, e: Raw): string[] {
	if (kind === 'domains') return [domainsEn[e.id] ?? String(e.name['en-US'])];
	const facts = Object.entries(e)
		.filter(([k, v]) => k !== 'id' && k !== 'name' && (typeof v === 'string' || typeof v === 'number'))
		.map(([k, v]) => `${k}: ${v}`);
	const out: string[] = [];
	if (facts.length) out.push(facts.join(' · '));
	collectText(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'name')), out);
	if (!out.length) out.push(String(e.name?.['en-US'] ?? e.name));
	return out;
}

export type RefItem = { kind: SrdKind; id: string; name: string; en: string[] };

/** Elements of `kind` (all kinds if undefined) whose English or French name contains `q`. */
export function searchSrd(kind: SrdKind | undefined, q: string, lang: Lang): { kind: SrdKind; items: RefItem[] }[] {
	const needle = q.trim().toLowerCase();
	return SRD_KINDS.filter((k) => !kind || k === kind).map((k) => ({
		kind: k,
		items: data
			.get(k)!
			.filter((d) => !needle || d.name.toLowerCase().includes(needle) || (fr[d.element.id] ?? '').toLowerCase().includes(needle))
			.map((d) => ({
				kind: k,
				id: d.element.id,
				name: localize(d.element.id, d.name, lang),
				en: englishLines(k, d.element)
			}))
	}));
}

const upper = (s: unknown) => String(s ?? '');
const cap = (s: unknown) => upper(s).charAt(0) + upper(s).slice(1).toLowerCase().replace(/_/g, ' ');

function paragraphs(desc: unknown): string[] {
	return Array.isArray(desc)
		? desc.map((d) => d?.paragraph?.['en-US']).filter((x): x is string => typeof x === 'string')
		: [];
}

/** English help lines of an SRD element: facts, description paragraphs, then "<feature>: <text>". */
export function helpLines(kind: SrdKind, e: Raw): string[] {
	const out: string[] = [];
	if (kind === 'weapons') {
		const dmg = e.damage ?? {};
		out.push(
			[cap(e.trait), cap(e.range), `${dmg.dice ?? ''} ${cap(dmg.type)}`.trim(), cap(e.burden)].join(' · ')
		);
	} else if (kind === 'armors') {
		out.push(`thresholds ${e.baseMajorThreshold}/${e.baseSevereThreshold} · score ${e.baseScore}`);
	} else if (kind === 'domain-cards') {
		out.push(`${cap(e.domain)} · level ${e.level} · recall cost ${e.recallCost}`);
	}
	out.push(...paragraphs(e.description));
	(function walk(n: unknown) {
		if (Array.isArray(n)) return n.forEach(walk);
		if (n && typeof n === 'object') {
			const o = n as Raw;
			if (Array.isArray(o.description) && (o.name?.['en-US'] || !o.name)) {
				const ps = paragraphs(o.description);
				const nm = o.name?.['en-US'];
				if (nm) out.push(`${nm}: ${ps[0] ?? ''}`.trim(), ...ps.slice(1));
				else out.push(...ps);
			} else {
				for (const [k, v] of Object.entries(o)) if (k !== 'description' && k !== 'name') walk(v);
			}
		}
	})(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'description' && k !== 'name')));
	return out;
}

export type Pick = { id: string; name: string; en: string[] };

function toPick(kind: SrdKind, d: { element: SrdElement; name: string }, lang: Lang): Pick {
	return { id: d.element.id, name: localize(d.element.id, d.name, lang), en: helpLines(kind, d.element) };
}

export function pickList(kind: SrdKind, lang: Lang): Pick[] {
	return data.get(kind)!.map((d) => toPick(kind, d, lang));
}

/** The id of the entry with this English name (e.g. "Clank"); null when empty or unknown. */
export function idByName(kind: SrdKind, name: string | null | undefined): string | null {
	return data.get(kind)!.find((d) => d.name === name)?.element.id ?? null;
}

/** The subclasses of a class given by its English name (e.g. "Ranger"); [] for unknown classes. */
export function subclassesOf(className: string, lang: Lang): Pick[] {
	const cls = className.toUpperCase();
	return data
		.get('subclasses')!
		.filter((d) => d.element.class === cls)
		.map((d) => toPick('subclasses', d, lang));
}

export function pickOf(kind: SrdKind, id: string | null | undefined, lang: Lang): Pick | null {
	const d = id ? data.get(kind)!.find((x) => x.element.id === id) : undefined;
	return d ? toPick(kind, d, lang) : null;
}

export type CardPick = Pick & { domain: string; domainName: string; level: number };

function toCardPick(d: { element: SrdElement; name: string }, lang: Lang): CardPick {
	const dom = String(d.element.domain);
	const domId = `core_domain_${dom.toLowerCase()}`;
	return {
		...toPick('domain-cards', d, lang),
		domain: dom,
		domainName: localize(domId, dom.charAt(0) + dom.slice(1).toLowerCase(), lang),
		level: Number(d.element.level)
	};
}

/** Domain cards by id, in the order given; unknown ids are skipped. */
export function cardsByIds(ids: string[], lang: Lang): CardPick[] {
	const all = data.get('domain-cards')!;
	return ids.flatMap((id) => {
		const d = all.find((x) => x.element.id === id);
		return d ? [toCardPick(d, lang)] : [];
	});
}

/** All domain cards grouped by domain; the domains of the class (English name) come first. */
export function cardGroups(className: string, lang: Lang): { domain: string; label: string; cards: CardPick[] }[] {
	const cls = data.get('classes')!.find((c) => c.element.name === className.toUpperCase());
	const first: string[] = cls ? (cls.element.domains as string[]) : [];
	const all = data.get('domain-cards')!.map((d) => toCardPick(d, lang));
	const domains = [...new Set(all.map((c) => c.domain))];
	const order = [...first.filter((d) => domains.includes(d)), ...domains.filter((d) => !first.includes(d))];
	return order.map((domain) => {
		const cards = all.filter((c) => c.domain === domain);
		return { domain, label: cards[0].domainName, cards };
	});
}

const ITEM_PICK_KINDS = ['weapons', 'armors', 'consumables', 'items'] as const;

/** Weapons, armors, consumables and items as pick-list groups (kind = SRD kind). */
export function itemGroups(lang: Lang): { kind: SrdKind; picks: Pick[] }[] {
	return ITEM_PICK_KINDS.map((kind) => ({ kind, picks: pickList(kind, lang) }));
}

/** Helper data of held SRD items, by SRD id; unknown ids are skipped. */
export function itemPicks(ids: string[], lang: Lang): Record<string, Pick> {
	const out: Record<string, Pick> = {};
	for (const id of ids) {
		for (const kind of ITEM_PICK_KINDS) {
			const p = pickOf(kind, id, lang);
			if (p) {
				out[id] = p;
				break;
			}
		}
	}
	return out;
}
