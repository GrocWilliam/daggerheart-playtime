import { describe, expect, it } from 'vitest';
import { THRESHOLDS_ERROR, createFields, createSchema, thresholdsOk } from '$lib/server/features/characters';
import { fieldOfMessage, firstInvalid, parseStep, readValues, stepOfField, tunnelHref } from './tunnel';

const s1 = { name: 'Ari', class: 'Bard', level: '1' };
const s3 = { evasion: '10', majorThreshold: '5', severeThreshold: '10', maxHp: '6', maxStress: '6', armorSlots: '3' };

describe('tunnel', () => {
	it('parseStep', () => {
		expect(parseStep('3')).toBe(3);
		for (const v of [null, '0', '5', 'abc', '2.5']) expect(parseStep(v)).toBe(1);
	});
	it('readValues', () => {
		expect(readValues(new URLSearchParams('name=Ari&step=2&foo=1'))).toEqual({ name: 'Ari' });
		const fd = new FormData();
		fd.set('class', 'Bard');
		expect(readValues(fd)).toEqual({ class: 'Bard' });
	});
	it('firstInvalid step 1', () => {
		expect(firstInvalid(s1, 1)).toBeNull();
		expect(firstInvalid({ ...s1, level: '11' }, 1)).toEqual({ step: 1, field: 'level' });
		expect(firstInvalid({ ...s1, name: '' }, 1)).toEqual({ step: 1, field: 'name' });
		expect(firstInvalid(s1, 0)).toBeNull();
	});
	it('firstInvalid step 2', () => {
		expect(firstInvalid({ ...s1, ancestry: 'Nope' }, 2)).toEqual({ step: 2, field: 'ancestry' });
		expect(firstInvalid(s1, 2)).toBeNull();
		expect(firstInvalid({ ...s1, ancestry: '' }, 2)).toBeNull();
	});
	it('firstInvalid step 3', () => {
		expect(firstInvalid({ ...s1, ...s3 }, 3)).toBeNull();
		expect(firstInvalid({ ...s1, ...s3, majorThreshold: '10', severeThreshold: '5' }, 3)).toEqual({ step: 3, field: 'severeThreshold' });
		expect(firstInvalid({ ...s1, ...s3, maxHp: '' }, 3)).toEqual({ step: 3, field: 'maxHp' });
	});
	it('stepOfField / fieldOfMessage', () => {
		expect(stepOfField('community')).toBe(2);
		expect(stepOfField('maxHp')).toBe(3);
		expect(stepOfField('zzz')).toBe(4);
		expect(fieldOfMessage(THRESHOLDS_ERROR)).toBe('severeThreshold');
		expect(fieldOfMessage('level must be an integer from 1 to 10')).toBe('level');
		expect(fieldOfMessage('boom')).toBeNull();
	});
	it('tunnelHref encodes spaces as +', () => {
		expect(tunnelHref('c1', 2, { name: 'A B', level: '1' }, 'name')).toBe('/campaigns/c1/characters/new?step=2&name=A+B&level=1&invalid=name');
	});
	it('createFields shares messages with createSchema', () => {
		const a = createFields.pick({ name: true }).safeParse({ name: '' });
		const b = createSchema.safeParse({});
		expect(a.success).toBe(false);
		expect(thresholdsOk(5, 10)).toBe(true);
		expect(thresholdsOk(10, 10)).toBe(false);
		expect(b.success).toBe(false);
	});
});
