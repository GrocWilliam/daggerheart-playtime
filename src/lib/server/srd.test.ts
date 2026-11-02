import { describe, expect, it } from 'vitest';
import { getSrd, isSrdKind, listSrd, SRD_KINDS } from './srd';

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
		expect(isSrdKind('nonsense')).toBe(false);
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
