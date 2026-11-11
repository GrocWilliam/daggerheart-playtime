import { describe, expect, it } from 'vitest';
import { createFields, createSchema, thresholdsOk } from '$lib/server/features/characters';
import { RANGES, TRAIT_OPTIONS, characterBody, fieldOfMessage, firstInvalid, parseStep, readValues, stepOfField, tunnelHref } from './tunnel';

const s1 = { name: 'Ari', class: 'Bard', level: '1' };
const s3 = { agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' };

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
	it('firstInvalid step 1 rejects a non-SRD class', () => {
		expect(firstInvalid({ ...s1, class: 'Pirate' }, 2)).toEqual({ step: 1, field: 'class' });
		expect(firstInvalid({ ...s1, class: 'Warrior' }, 2)).toBeNull();
	});
	it('firstInvalid step 2', () => {
		expect(firstInvalid({ ...s1, ancestry: 'Nope' }, 2)).toEqual({ step: 2, field: 'ancestry' });
		expect(firstInvalid(s1, 2)).toBeNull();
		expect(firstInvalid({ ...s1, ancestry: '' }, 2)).toBeNull();
	});
	it('firstInvalid step 3', () => {
		expect(firstInvalid({ ...s1, ...s3 }, 3)).toBeNull();
		expect(firstInvalid({ ...s1, ...s3, agility: '1' }, 3)).toEqual({ step: 3, field: 'traits' });
		expect(firstInvalid({ ...s1, ...s3, agility: ' ' }, 3)).toEqual({ step: 3, field: 'traits' });
		expect(firstInvalid({ ...s1, ...s3, agility: '-2' }, 3)).toEqual({ step: 3, field: 'traits' });
		expect(firstInvalid({ ...s1, ...s3, armorId: 'core_armor_gambeson_armor' }, 3)).toBeNull();
		expect(firstInvalid({ ...s1, ...s3, armorId: 'core_armor_improved_gambeson_armor' }, 3)).toEqual({ step: 3, field: 'armorId' });
		expect(TRAIT_OPTIONS).toEqual([2, 1, 0, -1]);
	});
	it('stepOfField / fieldOfMessage', () => {
		expect(stepOfField('community')).toBe(2);
		expect(stepOfField('traits')).toBe(3);
		expect(stepOfField('armorId')).toBe(3);
		expect(stepOfField('zzz')).toBe(4);
		expect(fieldOfMessage('traits has an unknown trait: luck')).toBe('traits');
		expect(fieldOfMessage('armorId must be an armor')).toBe('armorId');
		expect(fieldOfMessage('level must be an integer from 1 to 10')).toBe('review');
		expect(fieldOfMessage('boom')).toBe('review');
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
	it('RANGES match the API: min and max pass, one beyond fails', () => {
		for (const [f, [min, max]] of Object.entries(RANGES)) {
			const one = createFields.pick({ [f]: true } as never);
			expect(one.safeParse({ [f]: min }).success, `${f} ${min}`).toBe(true);
			expect(one.safeParse({ [f]: max }).success, `${f} ${max}`).toBe(true);
			expect(one.safeParse({ [f]: min - 1 }).success, `${f} ${min - 1}`).toBe(false);
			expect(one.safeParse({ [f]: max + 1 }).success, `${f} ${max + 1}`).toBe(false);
		}
	});
	it('characterBody: SRD names to ids, derived stats, traits as numbers, armorId omitted when unarmored', () => {
		const b = characterBody({ ...s1, ...s3, ancestry: 'Clank', community: '' });
		expect(b).toMatchObject({ name: 'Ari', class: 'Bard', level: 1, evasion: 10, maxHp: 5, maxStress: 6, armorSlots: 0, majorThreshold: 1, severeThreshold: 2 });
		expect(b.traits).toEqual({ agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 });
		expect(typeof b.ancestry).toBe('string');
		expect(b.ancestry).not.toBe('Clank');
		expect('community' in b).toBe(false);
		expect('armorId' in b).toBe(false);
		expect(characterBody({ ...s1, ...s3, armorId: 'core_armor_gambeson_armor' }).armorId).toBe('core_armor_gambeson_armor');
		expect(characterBody({})).toMatchObject({ name: '', class: '', level: '' });
	});
});
