import { readFileSync } from 'node:fs';
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

export function isSrdKind(v: unknown): v is SrdKind {
	return typeof v === 'string' && (SRD_KINDS as readonly string[]).includes(v);
}

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
