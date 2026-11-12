import { readFileSync } from 'node:fs';
import * as z from 'zod';
import type { Lang } from '$lib/i18n';
// Relative: acceptance vitest configs import this file without the $lib alias.
import { translate } from '../../i18n';

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
	'rules',
	'adversaries',
	'environments'
] as const;
export type SrdKind = (typeof SRD_KINDS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
export type SrdElement = Raw & { id: string };

const FILES: Record<Exclude<SrdKind, 'domains' | 'adversaries' | 'environments'>, string> = {
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
		new URL(`../../srd/${file}`, import.meta.url),
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

/** Strips a leading UTF-8 byte order mark. */
export function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** `adv_<slug>` / `env_<slug>` id part: lowercase, runs of non-alphanumerics become one '_'. */
export function slug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Adversary role: the type without its parenthesis ('Horde (3/HP)' -> 'Horde'). */
export function roleOf(type: string): string {
	return type.replace(/\s*\(.*$/, '').trim();
}

function readFlat(file: string, prefix: string, adversary: boolean): { element: SrdElement; name: string }[] {
	const rows: Raw[] = JSON.parse(stripBom(readSrdFile(file)));
	return rows.map((r) => {
		const element: SrdElement = { ...r, id: `${prefix}_${slug(String(r.name))}`, tier: Number(r.tier) };
		if (adversary) element.role = roleOf(String(r.type));
		return { element, name: String(r.name) };
	});
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
data.set('adversaries', readFlat('adversaries.json', 'adv', true));
data.set('environments', readFlat('environments.json', 'env', false));
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

/** Fields a French overlay may translate, per kind (core kinds: top-level keys holding an `en-US` leaf). */
export const TRANSLATED_FIELDS: Record<SrdKind, readonly string[]> = {
	classes: ['name', 'description', 'classItems', 'hopeFeature', 'classFeatures'],
	subclasses: ['name', 'foundation', 'specialization', 'mastery'],
	ancestries: ['name', 'description', 'features'],
	communities: ['name', 'description', 'personalities', 'features'],
	domains: ['name'],
	'domain-cards': ['name', 'features'],
	weapons: ['name', 'features'],
	armors: ['name', 'features'],
	consumables: ['name', 'features'],
	items: ['name', 'features'],
	rules: ['name', 'description'],
	adversaries: ['name', 'description', 'motives_and_tactics', 'experience', 'attack', 'feature'],
	environments: ['name', 'description', 'impulses', 'potential_adversaries', 'feature']
};

/** A line of SRD text and the language it is in; `label` (a catalog string, in the page language) precedes it. */
export type Line = { text: string; lang: Lang; label?: string };

/** French overlays (`src/lib/srd/fr/<kind>.json`): id -> partial translated fields. */
const frData = new Map<SrdKind, Record<string, Raw>>(
	SRD_KINDS.map((k) => [k, JSON.parse(stripBom(readSrdFile(`fr/${k}.json`))) as Record<string, Raw>])
);

/** The raw French overlay of a kind. */
export function frEntries(kind: SrdKind): Record<string, Raw> {
	return frData.get(kind)!;
}

const MISMATCH = Symbol('mismatch');

const isObject = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isLeaf = (v: Raw) => typeof v['en-US'] === 'string' && Object.keys(v).length === 1;

/**
 * Merges a French value over its English counterpart. A `{"en-US": s}` leaf takes a plain French string (and keeps
 * its key), a string takes a string, lists keep their length and objects their keys; any other shape is a MISMATCH.
 */
export function mergeFr(en: unknown, fr: unknown): unknown {
	if (Array.isArray(en)) {
		if (!Array.isArray(fr) || fr.length !== en.length) return MISMATCH;
		const out = en.map((x, i) => mergeFr(x, fr[i]));
		return out.includes(MISMATCH) ? MISMATCH : out;
	}
	if (isObject(en)) {
		if (isLeaf(en)) return typeof fr === 'string' ? { 'en-US': fr } : MISMATCH;
		if (!isObject(fr)) return MISMATCH;
		const keys = Object.keys(en);
		if (Object.keys(fr).length !== keys.length || !keys.every((k) => k in fr)) return MISMATCH;
		const out: Raw = {};
		for (const k of keys) {
			const v = mergeFr(en[k], fr[k]);
			if (v === MISMATCH) return MISMATCH;
			out[k] = v;
		}
		return out;
	}
	if (typeof en === 'string') return typeof fr === 'string' ? fr : MISMATCH;
	return typeof fr === typeof en && (fr === null) === (en === null) ? en : MISMATCH;
}

/** Whether a French value has the shape of the English one. */
export function sameShape(en: unknown, fr: unknown): boolean {
	return mergeFr(en, fr) !== MISMATCH;
}

const byId = new Map<SrdKind, Map<string, { element: SrdElement; name: string }>>(
	SRD_KINDS.map((k) => [k, new Map(data.get(k)!.map((d) => [d.element.id, d]))])
);

function displayName(kind: SrdKind, e: Raw): string {
	if (kind === 'classes') return englishName(kind, e);
	return typeof e.name === 'string' ? e.name : e.name['en-US'];
}

export type Localized = { element: SrdElement & { nameLocalized: string }; langs: Record<string, Lang> };

/**
 * An SRD element with each translated field in French when the French overlay has the whole field with the English
 * shape (else English), and the language of each translated field it has.
 */
export function localizedSrd(kind: SrdKind, id: string, lang: Lang): Localized | null {
	const d = byId.get(kind)!.get(id);
	if (!d) return null;
	const element: Raw = { ...d.element };
	const langs: Record<string, Lang> = {};
	const tr = lang === 'fr' ? frData.get(kind)![id] : undefined;
	for (const f of TRANSLATED_FIELDS[kind]) {
		if (!(f in element)) continue;
		langs[f] = 'en';
		if (!tr || tr[f] === undefined) continue;
		const v = mergeFr(element[f], tr[f]);
		if (v === MISMATCH) continue;
		element[f] = v;
		langs[f] = 'fr';
	}
	element.nameLocalized = displayName(kind, element);
	return { element: element as SrdElement & { nameLocalized: string }, langs };
}

/** The display name of an element in `lang` (English when the French name is missing) and its language. */
function localName(kind: SrdKind, d: { element: SrdElement; name: string }, lang: Lang): { name: string; nameLang: Lang } {
	if (lang === 'fr') {
		const r = localizedSrd(kind, d.element.id, lang)!;
		if (r.langs.name === 'fr') return { name: r.element.nameLocalized, nameLang: 'fr' };
	}
	return { name: d.name, nameLang: 'en' };
}

export function listSrd(kind: SrdKind, lang: Lang): { id: string; name: string; nameLang: Lang }[] {
	return data.get(kind)!.map((d) => ({ id: d.element.id, ...localName(kind, d, lang) }));
}

export function getSrd(kind: SrdKind, id: string, lang: Lang): (SrdElement & { nameLocalized: string }) | null {
	return localizedSrd(kind, id, lang)?.element ?? null;
}

/** Localized name of a domain by id (`core_domain_blade`) and its language; `fallback` (English) when unknown. */
function domainName(domId: string, fallback: string, lang: Lang): { name: string; nameLang: Lang } {
	const d = byId.get('domains')!.get(domId);
	return d ? localName('domains', d, lang) : { name: fallback, nameLang: 'en' };
}

const domainsHelp: Record<string, { en: string; fr: string }> = Object.fromEntries(
	(JSON.parse(readSrdFile('domains.json')) as { id: string; en: string; fr: string }[]).map((d) => [d.id, d])
);

export type RefItem = { kind: SrdKind; id: string; name: string; nameLang: Lang; lines: Line[] };

/** Elements of `kind` (all kinds if undefined) whose English name (or French name, in French) contains `q`. */
export function searchSrd(kind: SrdKind | undefined, q: string, lang: Lang): { kind: SrdKind; items: RefItem[] }[] {
	const needle = q.trim().toLowerCase();
	return SRD_KINDS.filter((k) => !kind || k === kind).map((k) => ({
		kind: k,
		items: data
			.get(k)!
			.map((d) => ({ d, local: localName(k, d, lang) }))
			.filter(({ d, local }) => !needle || d.name.toLowerCase().includes(needle) || (local.nameLang === 'fr' && local.name.toLowerCase().includes(needle)))
			.map(({ d, local }) => ({
				kind: k,
				id: d.element.id,
				name: local.name,
				nameLang: local.nameLang,
				lines: linesOf(k, d.element.id, lang)
			}))
	}));
}

/** Adversaries of a tier (1-4; all if undefined) in file order, with their role. */
export function adversariesByTier(
	tier: number | undefined,
	lang: Lang
): { id: string; name: string; nameLang: Lang; tier: number; role: string }[] {
	return data
		.get('adversaries')!
		.filter((d) => tier === undefined || d.element.tier === tier)
		.map((d) => ({ id: d.element.id, ...localName('adversaries', d, lang), tier: d.element.tier, role: d.element.role }));
}

export const getAdversary = (id: string, lang: Lang) => getSrd('adversaries', id, lang);
export const getEnvironment = (id: string, lang: Lang) => getSrd('environments', id, lang);

const t = translate;

/** Collects the text of an SRD field in order: `en-US` leaves (which hold French once merged), and a named object
 * with a description (a feature) as "<name>: <first paragraph>" then its other paragraphs. */
function fieldTexts(node: unknown, out: string[]): void {
	if (Array.isArray(node)) return node.forEach((n) => fieldTexts(n, out));
	if (!node || typeof node !== 'object') return;
	const o = node as Raw;
	if (typeof o['en-US'] === 'string') {
		out.push(o['en-US']);
		return;
	}
	if (Array.isArray(o.description) && typeof o.name?.['en-US'] === 'string') {
		const ps: string[] = [];
		fieldTexts(o.description, ps);
		out.push(`${o.name['en-US']}: ${ps[0] ?? ''}`.trim(), ...ps.slice(1));
		return;
	}
	for (const [k, v] of Object.entries(o)) if (k !== 'name') fieldTexts(v, out);
}

/** The enum key of an adversary range ("Very Close" -> "VERY_CLOSE"). */
const rangeKey = (r: string) => r.trim().toUpperCase().replace(/\s+/g, '_');

/** Adversary type ("Horde (3/HP)") with its role label in `lang`. */
function roleLabel(type: string, lang: Lang): string {
	const role = roleOf(type);
	const rest = type.slice(type.indexOf(role) + role.length);
	return `${t(lang, `adversary.role.${role}`)}${rest}`;
}

/** The facts line of an adversary or environment: catalog labels and values, in `lang`. */
function flatFacts(kind: 'adversaries' | 'environments', e: Raw, lang: Lang): string {
	const v = (k: string) => String(e[k] ?? '').trim();
	const label = (k: string) => `${t(lang, `srd.field.${k}`)} ${v(k)}`;
	const parts: string[] = [];
	if (v('tier')) parts.push(label('tier'));
	if (v('type')) parts.push(kind === 'adversaries' ? roleLabel(v('type'), lang) : t(lang, `environment.type.${v('type')}`));
	for (const k of ['difficulty', 'hp', 'stress', 'thresholds', 'atk']) if (v(k)) parts.push(label(k));
	if (v('range')) parts.push(`${t(lang, 'srd.field.range')} ${t(lang, `range.${rangeKey(v('range'))}`)}`);
	if (v('damage')) parts.push(label('damage'));
	return parts.join(' · ');
}

/** Text fields of adversaries and environments shown as "<label>: <text>" lines. */
const FLAT_TEXT: Record<'adversaries' | 'environments', string[]> = {
	adversaries: ['description', 'motives_and_tactics', 'attack', 'experience'],
	environments: ['description', 'impulses', 'potential_adversaries']
};

/**
 * Help lines of an SRD element (as returned by `localizedSrd`): a facts line in the page `lang` (catalog labels and
 * enum keys) for weapons, armors, domain cards, adversaries and environments, then one line per text paragraph or
 * feature ("<name>: <text>") in the language of the field it comes from (`langs[field]`, English when missing).
 */
export function helpLines(kind: SrdKind, e: Raw, langs: Record<string, Lang>, lang: Lang): Line[] {
	const out: Line[] = [];
	const fieldLang = (f: string): Lang => langs[f] ?? 'en';
	if (kind === 'domains') {
		const help = domainsHelp[e.id]?.[lang];
		return [help ? { text: help, lang } : { text: displayName(kind, e), lang: fieldLang('name') }];
	}
	if (kind === 'adversaries' || kind === 'environments') {
		const facts = flatFacts(kind, e, lang);
		if (facts) out.push({ text: facts, lang });
		for (const f of FLAT_TEXT[kind]) {
			const v = String(e[f] ?? '').trim();
			if (v) out.push({ label: t(lang, `srd.field.${f}`), text: v, lang: fieldLang(f) });
		}
		for (const f of (e.feature as Raw[] | undefined) ?? []) out.push({ text: `${f.name}: ${f.text}`, lang: fieldLang('feature') });
		return out;
	}
	if (kind === 'weapons') {
		const dmg = e.damage ?? {};
		const parts = [
			e.trait ? t(lang, `trait.${String(e.trait).toLowerCase()}`) : '',
			e.range ? t(lang, `range.${e.range}`) : '',
			`${dmg.dice ?? ''} ${dmg.type ? t(lang, `damage.${dmg.type}`) : ''}`.trim(),
			e.burden ? t(lang, `burden.${e.burden}`) : ''
		];
		out.push({ text: parts.filter(Boolean).join(' · '), lang });
	} else if (kind === 'armors') {
		out.push({
			text: `${t(lang, 'srd.help.thresholds')} ${e.baseMajorThreshold}/${e.baseSevereThreshold} · ${t(lang, 'srd.help.score')} ${e.baseScore}`,
			lang
		});
	} else if (kind === 'domain-cards') {
		const dom = String(e.domain ?? '');
		const { name } = domainName(`core_domain_${dom.toLowerCase()}`, dom.charAt(0) + dom.slice(1).toLowerCase(), lang);
		out.push({ text: `${name} · ${t(lang, 'srd.help.level')} ${e.level} · ${t(lang, 'srd.help.recallCost')} ${e.recallCost}`, lang });
	}
	for (const [f, v] of Object.entries(e)) {
		if (f === 'id' || f === 'name' || f === 'nameLocalized') continue;
		const texts: string[] = [];
		fieldTexts(v, texts);
		for (const text of texts) if (text.trim()) out.push({ text, lang: fieldLang(f) });
	}
	if (!out.length) out.push({ text: displayName(kind, e), lang: fieldLang('name') });
	return out;
}

/** Help lines of a stored element in `lang`. */
function linesOf(kind: SrdKind, id: string, lang: Lang): Line[] {
	const r = localizedSrd(kind, id, lang)!;
	return helpLines(kind, r.element, r.langs, lang);
}

export type Pick = { id: string; name: string; nameLang: Lang; lines: Line[] };

function toPick(kind: SrdKind, d: { element: SrdElement; name: string }, lang: Lang): Pick {
	return { id: d.element.id, ...localName(kind, d, lang), lines: linesOf(kind, d.element.id, lang) };
}

export function pickList(kind: SrdKind, lang: Lang): Pick[] {
	return data.get(kind)!.map((d) => toPick(kind, d, lang));
}

/** Select options: English name as value, localised name as label, in SRD order. */
export function pickOptions(kind: 'classes' | 'ancestries' | 'communities', lang: Lang): { value: string; label: string }[] {
	const en = pickList(kind, 'en');
	return pickList(kind, lang).map((p, i) => ({ value: en[i].name, label: p.name }));
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

export type CardPick = Pick & { domain: string; domainName: string; domainNameLang: Lang; level: number };

function toCardPick(d: { element: SrdElement; name: string }, lang: Lang): CardPick {
	const dom = String(d.element.domain);
	const domId = `core_domain_${dom.toLowerCase()}`;
	return {
		...toPick('domain-cards', d, lang),
		domain: dom,
		...(({ name, nameLang }) => ({ domainName: name, domainNameLang: nameLang }))(
			domainName(domId, dom.charAt(0) + dom.slice(1).toLowerCase(), lang)
		),
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

/** Domains of an SRD class (by English name, any case): raw ids ("BLADE"), localized name and help text. `[]` for other classes. */
export function domainsOfClass(className: string, lang: Lang): { id: string; name: string; nameLang: Lang; help: string }[] {
	const cls = data.get('classes')!.find((c) => c.element.name === String(className ?? '').toUpperCase());
	return ((cls?.element.domains as string[] | undefined) ?? []).map((id) => {
		const domId = `core_domain_${id.toLowerCase()}`;
		return {
			id,
			...domainName(domId, id.charAt(0) + id.slice(1).toLowerCase(), lang),
			help: domainsHelp[domId]?.[lang] ?? ''
		};
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

export type GearGroup = { tier: number; picks: Pick[] };

function gearGroups(kind: 'weapons' | 'armors', types: string[] | null, tier: number, lang: Lang): GearGroup[] {
	const rows = data.get(kind)!.filter((d) => (!types || types.includes(String(d.element.type))) && Number(d.element.tier) <= tier);
	const tiers = [...new Set(rows.map((d) => Number(d.element.tier)))].sort((a, b) => a - b);
	return tiers.map((t) => ({
		tier: t,
		picks: rows.filter((d) => Number(d.element.tier) === t).map((d) => toPick(kind, d, lang))
	}));
}

/** Primary or secondary weapons up to `tier`, grouped by their SRD tier field. */
export function weaponGroups(kind: 'primary' | 'secondary', tier: number, lang: Lang): GearGroup[] {
	return gearGroups('weapons', kind === 'primary' ? ['PRIMARY_PHYSICAL', 'PRIMARY_MAGIC'] : ['SECONDARY'], tier, lang);
}

/** Armors up to `tier`, grouped by their SRD tier field. */
export function armorGroups(tier: number, lang: Lang): GearGroup[] {
	return gearGroups('armors', null, tier, lang);
}

export type GearFeature = { name: string; text: string; lang: Lang };
export type GearDetail = {
	id: string;
	name: string;
	nameLang: Lang;
	trait?: string;
	range?: string;
	dice?: string;
	damageType?: string;
	burden?: string;
	major?: number;
	severe?: number;
	score?: number;
	features: GearFeature[];
};

/** Structured details of a weapon or armor (raw SRD enum values), with the language of its name and features. */
export function gearDetail(kind: 'weapons' | 'armors', id: string | null | undefined, lang: Lang): GearDetail | null {
	const r = id ? localizedSrd(kind, id, lang) : null;
	if (!r) return null;
	const { element: e, langs } = r;
	const features: GearFeature[] = ((e.features as Raw[] | undefined) ?? []).map((f) => {
		const texts: string[] = [];
		fieldTexts(f.description, texts);
		return { name: String(f.name?.['en-US'] ?? ''), text: texts.join(' '), lang: langs.features ?? 'en' };
	});
	const base = { id: e.id, name: e.nameLocalized, nameLang: langs.name ?? 'en', features };
	return kind === 'weapons'
		? { ...base, trait: e.trait, range: e.range, dice: e.damage?.dice, damageType: e.damage?.type, burden: e.burden }
		: { ...base, major: e.baseMajorThreshold, severe: e.baseSevereThreshold, score: e.baseScore };
}

/** Name of an SRD subclass and the feature lines ("<name>: <text>") of one of its stages, in `lang` where translated. */
export function subclassStageText(
	id: string | null | undefined,
	stage: 'foundation' | 'specialization' | 'mastery',
	lang: Lang
): { name: string; nameLang: Lang; lines: Line[] } | null {
	const r = id ? localizedSrd('subclasses', id, lang) : null;
	if (!r) return null;
	const texts: string[] = [];
	fieldTexts(r.element[stage], texts);
	const textLang = r.langs[stage] ?? 'en';
	return {
		name: r.element.nameLocalized,
		nameLang: r.langs.name ?? 'en',
		lines: texts.filter((x) => x.trim()).map((text) => ({ text, lang: textLang }))
	};
}
