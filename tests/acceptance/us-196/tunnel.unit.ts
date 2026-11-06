import { describe, expect, it } from 'vitest';
import { createFields, createSchema, thresholdsOk, THRESHOLDS_ERROR } from '../../../src/lib/server/features/characters';
import { idByName, listSrd, pickOf, pickOptions } from '../../../src/lib/server/features/srd';
import { fieldOfMessage, firstInvalid, parseStep, readValues, stepOfField, TUNNEL_STEPS, tunnelHref } from '../../../src/routes/campaigns/[id]/characters/new/tunnel';

const body = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
const firstMsg = (r: any) => (r.success ? null : r.error.issues[0].message);

describe('createFields / createSchema / thresholdsOk', () => {
	it('exports both; the empty name message is the same', () => {
		const a = firstMsg(createFields.pick({ name: true }).safeParse({ name: '' }));
		const b = firstMsg(createSchema.safeParse({ ...body, name: '' }));
		expect(a).toBeTruthy();
		expect(a).toBe(b);
	});
	it('thresholds error', () => {
		expect(THRESHOLDS_ERROR).toBe('thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100');
		expect(firstMsg(createSchema.safeParse({ ...body, majorThreshold: 10, severeThreshold: 5 }))).toBe(THRESHOLDS_ERROR);
		expect(createSchema.safeParse(body).success).toBe(true);
		expect(thresholdsOk(5, 10)).toBe(true);
		expect(thresholdsOk(10, 10)).toBe(false);
	});
});

describe('pickOptions', () => {
	it('ancestries in fr', () => {
		const o = pickOptions('ancestries', 'fr');
		expect(o).toHaveLength(listSrd('ancestries', 'en').length);
		for (const { value, label } of o) {
			const id = idByName('ancestries', value);
			expect(id).not.toBeNull();
			expect(label).toBe(pickOf('ancestries', id, 'fr')!.name);
		}
	});
	it('classes in en: value equals label', () => {
		const o = pickOptions('classes', 'en');
		expect(o.length).toBeGreaterThan(0);
		for (const e of o) expect(e.value).toBe(e.label);
	});
	it('communities in SRD order', () => {
		expect(pickOptions('communities', 'en').map((e) => e.value)).toEqual(listSrd('communities', 'en').map((e) => e.name));
	});
});

describe('tunnel', () => {
	it('TUNNEL_STEPS', () => {
		expect(TUNNEL_STEPS).toEqual([
			{ key: 'identity', fields: ['name', 'class', 'level'] },
			{ key: 'heritage', fields: ['ancestry', 'community'] },
			{ key: 'statistics', fields: ['evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots'] },
			{ key: 'review', fields: [] }
		]);
	});
	it('parseStep', () => {
		expect(parseStep('3')).toBe(3);
		for (const s of ['1', '2', '4']) expect(parseStep(s)).toBe(Number(s));
		for (const s of [null, '0', '5', 'abc', '2.5']) expect(parseStep(s)).toBe(1);
	});
	it('readValues', () => {
		expect(readValues(new URLSearchParams('name=Ari&step=2&foo=1'))).toEqual({ name: 'Ari' });
		const fd = new FormData();
		fd.set('class', 'Bard');
		fd.set('zzz', 'x');
		expect(readValues(fd)).toEqual({ class: 'Bard' });
	});
	const s1 = { name: 'Ari', class: 'Bard', level: '1' };
	const s3 = { evasion: '10', majorThreshold: '5', severeThreshold: '10', maxHp: '6', maxStress: '6', armorSlots: '3' };
	it('firstInvalid step 1', () => {
		expect(firstInvalid(s1, 1)).toBeNull();
		expect(firstInvalid({ ...s1, level: '11' }, 1)).toEqual({ step: 1, field: 'level' });
		expect(firstInvalid({ ...s1, name: '' }, 1)).toEqual({ step: 1, field: 'name' });
	});
	it('firstInvalid step 2', () => {
		expect(firstInvalid({ ...s1, ancestry: 'Nope' }, 2)).toEqual({ step: 2, field: 'ancestry' });
		expect(firstInvalid(s1, 2)).toBeNull();
		expect(firstInvalid({ ...s1, ancestry: '', community: '' }, 2)).toBeNull();
	});
	it('firstInvalid step 3 thresholds', () => {
		expect(firstInvalid({ ...s1, ...s3 }, 3)).toBeNull();
		expect(firstInvalid({ ...s1, ...s3, majorThreshold: '10', severeThreshold: '5' }, 3)).toEqual({ step: 3, field: 'severeThreshold' });
	});
	it('firstInvalid upTo 0', () => {
		expect(firstInvalid({}, 0)).toBeNull();
		expect(firstInvalid({ name: '' }, 0)).toBeNull();
	});
	it('stepOfField', () => {
		expect(stepOfField('community')).toBe(2);
		expect(stepOfField('maxHp')).toBe(3);
		expect(stepOfField('name')).toBe(1);
		expect(stepOfField('zzz')).toBe(4);
	});
	it('fieldOfMessage', () => {
		expect(fieldOfMessage(THRESHOLDS_ERROR)).toBe('severeThreshold');
		const lvl = firstMsg(createSchema.safeParse({ ...body, level: 11 }));
		expect(fieldOfMessage(lvl)).toBe('level');
		expect(fieldOfMessage('boom')).toBeNull();
	});
	it('tunnelHref (accepts + or %20 for a space)', () => {
		const h = tunnelHref('c1', 2, { name: 'A B', level: '1' }, 'name');
		expect([
			'/campaigns/c1/characters/new?step=2&name=A+B&level=1&invalid=name',
			'/campaigns/c1/characters/new?step=2&name=A%20B&level=1&invalid=name'
		]).toContain(h);
		expect(tunnelHref('c1', 3, { name: 'A', class: '' })).toBe('/campaigns/c1/characters/new?step=3&name=A');
	});
});
