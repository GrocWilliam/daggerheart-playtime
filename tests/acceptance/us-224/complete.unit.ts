// us-224: srd-fr.test.ts has no allow-list; every field of every element is French; legacy code is gone.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSrd, localizedSrd, SRD_KINDS, TRANSLATED_FIELDS } from '../../../src/lib/server/features/srd';

const root = new URL('../../..', import.meta.url).pathname;

describe('srd-fr.test.ts covers every kind without an allow-list', () => {
	const src = readFileSync(join(root, 'src/lib/server/features/srd-fr.test.ts'), 'utf8');
	it('has no DONE map', () => {
		expect(src).not.toMatch(/\bDONE\b/);
	});
	it('still loops over SRD_KINDS', () => {
		expect(src).toMatch(/SRD_KINDS/);
	});
});

describe('SRD_KINDS', () => {
	it('has the 13 kinds, domains included', () => {
		expect(SRD_KINDS.length).toBe(13);
		expect(SRD_KINDS).toContain('domains');
	});
});

describe.each(SRD_KINDS)('localizedSrd fr langs for %s', (kind) => {
	it('is "fr" for every translated field the English element has', () => {
		const ids = listSrd(kind, 'en').map((e) => e.id);
		expect(ids.length).toBeGreaterThan(0);
		const bad: string[] = [];
		for (const id of ids) {
			const en = localizedSrd(kind, id, 'en')!.element as Record<string, unknown>;
			const fr = localizedSrd(kind, id, 'fr')!;
			for (const f of TRANSLATED_FIELDS[kind]) {
				if (!(f in en)) continue;
				if (fr.langs[f] !== 'fr') bad.push(`${id}.${f}=${String(fr.langs[f])}`);
			}
		}
		expect(bad).toEqual([]);
	});
});

describe('domains', () => {
	it('has a French name for each of the 9 domains', () => {
		const ids = listSrd('domains', 'en').map((e) => e.id);
		expect(ids.length).toBe(9);
		const fr = JSON.parse(readFileSync(join(root, 'src/lib/srd/fr/domains.json'), 'utf8'));
		for (const id of ids) expect(typeof (fr[id]?.name ?? '')).toBe('string');
		for (const id of ids) expect(String(fr[id]?.name?.['en-US'] ?? fr[id]?.name ?? '').trim()).not.toBe('');
	});
});

describe('transition code removed', () => {
	it('the legacy srd French file does not exist and nothing reads it', () => {
		expect(existsSync(join(root, ['src', 'lib', 'srd', 'fr.json'].join('/')))).toBe(false);
		const hits: string[] = [];
		const walk = (d: string) => {
			for (const n of readdirSync(d)) {
				const p = join(d, n);
				if (statSync(p).isDirectory()) walk(p);
				else if (/\.(ts|svelte|js|mjs)$/.test(n) && /['"`/]fr\.json['"`]/.test(readFileSync(p, 'utf8')) && /srd\/fr\.json|\.\/fr\.json|srd.*fr\.json/.test(readFileSync(p, 'utf8'))) hits.push(p);
			}
		};
		walk(join(root, 'src'));
		expect(hits.filter((h) => !h.includes('/i18n/'))).toEqual([]);
	});
	it('no `en: string[]` help prop remains in components', () => {
		const dir = join(root, 'src/lib/components');
		for (const n of readdirSync(dir).filter((x) => x.endsWith('.svelte')))
			expect(readFileSync(join(dir, n), 'utf8'), n).not.toMatch(/\ben\??:\s*string\[\]/);
	});
});

describe('CLAUDE.md', () => {
	it('says the fr files are complete and checked for every kind', () => {
		const md = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
		const row = md.split('\n').find((l) => l.startsWith('| `src/lib/srd/fr/`'))!;
		expect(row).toBeTruthy();
		expect(row).toMatch(/complete/i);
		expect(row).toMatch(/every kind/i);
		expect(row).not.toMatch(/DONE/);
	});
});
