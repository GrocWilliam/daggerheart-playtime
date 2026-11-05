import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as srd from '../../../src/lib/server/features/srd';

// Assumed shapes (the story says "for example"): weaponGroups(kind, tier, lang) with kind
// 'primary' | 'secondary', armorGroups(tier, lang); each returns an array of groups
// { tier: number, <one array property of picks { id, name }> }, ordered by tier.
const core = (f: string) => JSON.parse(readFileSync(`src/lib/srd/core/${f}.json`, 'utf8'));
const FR = JSON.parse(readFileSync('src/lib/srd/fr.json', 'utf8'));
const W = core('weapons'), A = core('armors');
const s: any = srd;

const picksOf = (g: any): any[] => Object.values(g).find((v) => Array.isArray(v)) as any[];
const flat = (groups: any[]) => groups.flatMap((g) => picksOf(g));
const ids = (groups: any[]) => flat(groups).map((p) => p.id);
const wantW = (kinds: string[], tier: number) => W.filter((w: any) => kinds.includes(w.type) && w.tier <= tier).map((w: any) => w.id).sort();
const wantA = (tier: number) => A.filter((a: any) => a.tier <= tier).map((a: any) => a.id).sort();

describe('srd gear helpers', () => {
	it('are exported', () => {
		expect(typeof s.weaponGroups).toBe('function');
		expect(typeof s.armorGroups).toBe('function');
	});
	it('filter primary weapons by tier (PRIMARY_PHYSICAL and PRIMARY_MAGIC)', () => {
		for (const tier of [1, 2, 3, 4]) expect(ids(s.weaponGroups('primary', tier, 'en')).sort()).toEqual(wantW(['PRIMARY_PHYSICAL', 'PRIMARY_MAGIC'], tier));
	});
	it('filter secondary weapons and armors by tier', () => {
		for (const tier of [1, 2, 3, 4]) {
			expect(ids(s.weaponGroups('secondary', tier, 'en')).sort()).toEqual(wantW(['SECONDARY'], tier));
			expect(ids(s.armorGroups(tier, 'en')).sort()).toEqual(wantA(tier));
		}
	});
	it('group by tier using the SRD tier field', () => {
		const groups = s.weaponGroups('primary', 3, 'en');
		expect(groups.map((g: any) => g.tier)).toEqual([1, 2, 3]);
		for (const g of groups) for (const p of picksOf(g)) expect(W.find((w: any) => w.id === p.id).tier).toBe(g.tier);
		const ag = s.armorGroups(2, 'en');
		expect(ag.map((g: any) => g.tier)).toEqual([1, 2]);
		for (const g of ag) for (const p of picksOf(g)) expect(A.find((a: any) => a.id === p.id).tier).toBe(g.tier);
	});
	it('use English names, and French names from fr.json', () => {
		const en = flat(s.weaponGroups('primary', 1, 'en'));
		expect(en.find((p: any) => p.id === 'core_weapon_broadsword').name).toBe('Broadsword');
		const fr = flat(s.weaponGroups('primary', 1, 'fr'));
		for (const p of fr) expect(p.name).toBe(FR[p.id]);
		expect(flat(s.armorGroups(1, 'fr')).find((p: any) => p.id === 'core_armor_gambeson_armor').name).toBe(FR.core_armor_gambeson_armor);
	});
});
