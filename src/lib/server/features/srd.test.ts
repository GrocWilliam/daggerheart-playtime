import { describe, expect, it } from 'vitest';
import { domainsOfClass, getSrd, listSrd, SRD_KINDS, srdIdSchema, srdKindSchema, srdSearchSchema } from './srd';

const COUNTS = [9, 18, 18, 9, 9, 189, 192, 34, 60, 60, 14, 129, 19];

describe('srd', () => {
	it('lists every kind with the expected count', () => {
		SRD_KINDS.forEach((k, i) => expect(listSrd(k, 'en')).toHaveLength(COUNTS[i]));
	});
	it('capitalises class names and builds domain ids', () => {
		expect(listSrd('classes', 'en')[0]).toEqual({ id: 'core_class_bard', name: 'Bard', nameLang: 'en' });
		expect(getSrd('domains', 'core_domain_blade', 'en')?.nameLocalized).toBe('Blade');
	});
	it('returns the file object plus nameLocalized, null if unknown', () => {
		expect(getSrd('classes', 'core_class_bard', 'en')?.name).toBe('BARD');
		const e = getSrd('classes', 'core_class_bard', 'fr');
		expect(e?.name).toBe('Barde');
		expect(e?.nameLocalized).toBe('Barde');
		expect(getSrd('classes', 'nope', 'en')).toBeNull();
	});
	it('returns French names when the language is French', () => {
		expect(getSrd('domains', 'core_domain_blade', 'fr')?.nameLocalized).toBe('Lame');
		expect(listSrd('classes', 'fr')[0]).toEqual({ id: 'core_class_bard', name: 'Barde', nameLang: 'fr' });
		expect(listSrd('classes', 'en')[0].name).toBe('Bard');
	});
	it('has a French name for every element of every kind', () => {
		for (const k of SRD_KINDS)
			for (const { id, name } of listSrd(k, 'fr')) expect(name.trim(), id).not.toBe('');
	});
});

describe('item pick-lists', () => {
	it('groups weapons, armors, consumables and items', async () => {
		const { itemGroups } = await import('./srd');
		expect(itemGroups('en').map((g) => g.kind)).toEqual(['weapons', 'armors', 'consumables', 'items']);
		expect(itemGroups('en').reduce((n, g) => n + g.picks.length, 0)).toBe(346);
	});
	it('resolves held items to helper data, skipping unknown ids', async () => {
		const { itemGroups, itemPicks } = await import('./srd');
		const id = itemGroups('en')[0].picks[0].id;
		const r = itemPicks([id, 'nope'], 'en');
		expect(Object.keys(r)).toEqual([id]);
	});
});

describe('srdKindSchema', () => {
	it('accepts every kind', () => {
		for (const k of SRD_KINDS) expect(srdKindSchema.safeParse(k).success).toBe(true);
	});
	it('rejects others with the legacy message', () => {
		for (const v of ['nonsense', '', 'Classes', 'toString', '__proto__', undefined, 1]) {
			const r = srdKindSchema.safeParse(v);
			expect(r.success).toBe(false);
			expect(r.error?.issues[0].message).toBe('unknown SRD kind');
		}
	});
});

describe('srdIdSchema', () => {
	it('accepts any non-empty string', () => {
		expect(srdIdSchema.parse('core_class_bard')).toBe('core_class_bard');
		expect(srdIdSchema.safeParse('x').success).toBe(true);
	});
	it('rejects empty and non-strings', () => {
		for (const v of ['', undefined, null, 3]) {
			const r = srdIdSchema.safeParse(v);
			expect(r.success).toBe(false);
			expect(r.error?.issues[0].message).toBe('unknown SRD element');
		}
	});
});

describe('srdSearchSchema', () => {
	it('keeps a valid kind and q', () => {
		expect(srdSearchSchema.parse({ kind: 'weapons', q: 'axe' })).toEqual({ kind: 'weapons', q: 'axe' });
	});
	it('falls back for unknown or missing values', () => {
		expect(srdSearchSchema.parse({ kind: 'nope', q: 'a' })).toEqual({ kind: undefined, q: 'a' });
		expect(srdSearchSchema.parse({})).toEqual({ kind: undefined, q: '' });
		expect(srdSearchSchema.parse({ kind: undefined, q: 5 })).toEqual({ kind: undefined, q: '' });
	});
});

describe('domainsOfClass', () => {
	it('returns the two domains of an SRD class, case-insensitively', () => {
		expect(domainsOfClass('Guardian', 'en').map((d) => d.id)).toEqual(['VALOR', 'BLADE']);
		expect(domainsOfClass('guardian', 'en')).toHaveLength(2);
		expect(domainsOfClass('Guardian', 'en')[0]).toMatchObject({ name: 'Valor' });
		expect(domainsOfClass('Guardian', 'en')[0].help).not.toBe('');
	});
	it('returns [] for a non-SRD class', () => {
		expect(domainsOfClass('Homebrew', 'en')).toEqual([]);
	});
	it('uses French names and help', () => {
		const d = domainsOfClass('Guardian', 'fr');
		expect(d.map((x) => x.name)).toEqual(['Bravoure', 'Lame']);
		expect(d[1].help).toBe('Maîtrise des armes et prouesse martiale.');
	});
});

import { weaponGroups, armorGroups, gearDetail } from './srd';
describe('gear helpers', () => {
	it('filters by tier and groups by the SRD tier field', () => {
		const g = weaponGroups('primary', 1, 'en');
		expect(g.map((x) => x.tier)).toEqual([1]);
		expect(weaponGroups('primary', 2, 'en').map((x) => x.tier)).toEqual([1, 2]);
		expect(armorGroups(3, 'en').map((x) => x.tier)).toEqual([1, 2, 3]);
		expect(weaponGroups('secondary', 1, 'en')[0].picks.some((p) => p.id === 'core_weapon_round_shield')).toBe(true);
		expect(g[0].picks.some((p) => p.id === 'core_weapon_round_shield')).toBe(false);
	});
	it('uses French names and exposes details', () => {
		expect(weaponGroups('primary', 1, 'fr')[0].picks.length).toBeGreaterThan(0);
		expect(gearDetail('weapons', 'core_weapon_longsword', 'en')?.burden).toBe('TWO_HANDED');
		expect(gearDetail('armors', 'core_armor_gambeson_armor', 'en')?.score).toBe(3);
		expect(gearDetail('armors', null, 'en')).toBeNull();
	});
});

import { stripBom, slug, roleOf, getAdversary, adversariesByTier } from './srd';

describe('adversaries and environments', () => {
	it('strips a BOM', () => {
		expect(stripBom('﻿[1]')).toBe('[1]');
		expect(stripBom('[1]')).toBe('[1]');
	});
	it('builds adv_/env_ slugs', () => {
		expect(slug('Acid Burrower')).toBe('acid_burrower');
		expect(slug("Dire Bat's  Nest!")).toBe('dire_bat_s_nest_');
	});
	it('derives the role from the type', () => {
		expect(roleOf('Horde (3/HP)')).toBe('Horde');
		expect(roleOf('Solo')).toBe('Solo');
	});
	it('loads 129 adversaries and 19 environments with numeric tier and role', () => {
		expect(listSrd('adversaries', 'en')).toHaveLength(129);
		expect(listSrd('environments', 'fr')).toHaveLength(19);
		const all = adversariesByTier(undefined, 'en');
		expect(all.every((a) => [1, 2, 3, 4].includes(a.tier) && /^[A-Z][a-z]+$/.test(a.role))).toBe(true);
		expect(adversariesByTier(1, 'en').every((a) => a.tier === 1)).toBe(true);
		expect(getAdversary(all[0].id, 'en')?.nameLocalized).toBe(all[0].name);
		expect(getAdversary('adv_nope', 'en')).toBeNull();
	});
});

describe('pickOptions', () => {
	it('uses English values and localised labels in SRD order', async () => {
		const { pickOptions, idByName, pickOf, pickList } = await import('./srd');
		const fr = pickOptions('ancestries', 'fr');
		expect(fr).toHaveLength(pickList('ancestries', 'en').length);
		for (const o of fr) expect(o.label).toBe(pickOf('ancestries', idByName('ancestries', o.value), 'fr')!.name);
		for (const o of pickOptions('classes', 'en')) expect(o.value).toBe(o.label);
	});
});

import { subclassStageText } from './srd';
describe('subclassStageText', () => {
	it('gives the name and the features of one stage', () => {
		const s = subclassStageText('core_subclass_beastbound', 'specialization', 'en')!;
		expect(s.name).toBe('Beastbound');
		expect(s.lines.map((l) => l.text)).toEqual([
			'Expert Training: Choose an additional level-up option for your companion.',
			expect.stringMatching(/^Battle-Bonded: /)
		]);
	});
	it('is French where translated and null for unknown ids', () => {
		const s = subclassStageText('core_subclass_beastbound', 'mastery', 'fr')!;
		expect(s.lines.every((l) => l.lang === 'fr')).toBe(true);
		expect(subclassStageText(null, 'mastery', 'en')).toBeNull();
		expect(subclassStageText('nope', 'mastery', 'en')).toBeNull();
	});
});
