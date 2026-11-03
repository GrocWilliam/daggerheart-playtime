import { describe, expect, it } from 'vitest';
import { getSrd, listSrd, SRD_KINDS, srdIdSchema, srdKindSchema, srdSearchSchema } from './srd';

const COUNTS = [9, 18, 18, 9, 9, 189, 192, 34, 60, 60, 14];

describe('srd', () => {
	it('lists every kind with the expected count', () => {
		SRD_KINDS.forEach((k, i) => expect(listSrd(k, 'en')).toHaveLength(COUNTS[i]));
	});
	it('capitalises class names and builds domain ids', () => {
		expect(listSrd('classes', 'en')[0]).toEqual({ id: 'core_class_bard', name: 'Bard' });
		expect(getSrd('domains', 'core_domain_blade', 'en')?.nameLocalized).toBe('Blade');
	});
	it('returns the file object plus nameLocalized, null if unknown', () => {
		const e = getSrd('classes', 'core_class_bard', 'fr');
		expect(e?.name).toBe('BARD');
		expect(e?.nameLocalized).toBe('Barde');
		expect(getSrd('classes', 'nope', 'en')).toBeNull();
	});
	it('returns French names when the language is French', () => {
		expect(getSrd('domains', 'core_domain_blade', 'fr')?.nameLocalized).toBe('Lame');
		expect(listSrd('classes', 'fr')[0]).toEqual({ id: 'core_class_bard', name: 'Barde' });
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
