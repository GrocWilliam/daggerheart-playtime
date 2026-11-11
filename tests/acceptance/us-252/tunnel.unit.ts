// us-252: tunnel.ts helpers for step 3 (traits + armor) and the API body built from derivedStats.
import { describe, expect, it } from 'vitest';
import { derivedStats } from '../../../src/lib/server/features/characters';
import * as tunnel from '../../../src/routes/campaigns/[id]/characters/new/tunnel';
import { characterBody, fieldOfMessage, firstInvalid, readValues, stepOfField, TUNNEL_STEPS } from '../../../src/routes/campaigns/[id]/characters/new/tunnel';

const OLD = ['evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots'];
const S1 = { name: 'Ann', class: 'Warrior', level: '3' };
const TRAITS = { agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' };
const CHAIN = 'core_armor_chainmail_armor';

describe('step 3 fields', () => {
	it('step 3 statistics has the six traits and armorId; still 4 steps with the same keys', () => {
		expect(TUNNEL_STEPS.map((s) => s.key)).toEqual(['identity', 'heritage', 'statistics', 'review']);
		expect([...TUNNEL_STEPS[2].fields]).toEqual(['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge', 'armorId']);
	});
	it('readValues ignores the removed stat params (old URLs still load)', () => {
		const v = readValues(new URLSearchParams({ ...S1, evasion: '10', maxHp: '6', armorSlots: '3', agility: '2' }));
		for (const f of OLD) expect(v).not.toHaveProperty(f);
		expect(v.agility).toBe('2');
	});
	it('RANGES keeps only level; DEFAULTS is { level: "1" }; TRAIT_OPTIONS is [2, 1, 0, -1]', () => {
		const t = tunnel as unknown as Record<string, unknown>;
		expect(Object.keys(t.RANGES as object)).toEqual(['level']);
		expect(t.DEFAULTS).toEqual({ level: '1' });
		expect(t.TRAIT_OPTIONS).toEqual([2, 1, 0, -1]);
	});
});

describe('firstInvalid, step 3', () => {
	it('accepts the array 2,1,1,0,0,-1 in any order, unarmored or with a tier 1 armor', () => {
		expect(firstInvalid({ ...S1, ...TRAITS }, 3)).toBeNull();
		expect(firstInvalid({ ...S1, ...TRAITS, armorId: '' }, 3)).toBeNull();
		expect(firstInvalid({ ...S1, ...TRAITS, armorId: CHAIN }, 3)).toBeNull();
		const shuffled = { agility: '-1', strength: '0', finesse: '2', instinct: '1', presence: '0', knowledge: '1' };
		expect(firstInvalid({ ...S1, ...shuffled }, 3)).toBeNull();
	});
	it('rejects traits not following the array with { step: 3, field: "traits" }', () => {
		expect(firstInvalid({ ...S1, ...TRAITS, strength: '2' }, 3)).toEqual({ step: 3, field: 'traits' });
	});
	it('rejects a blank or missing trait with field traits', () => {
		expect(firstInvalid({ ...S1, ...TRAITS, knowledge: '' }, 3)).toEqual({ step: 3, field: 'traits' });
		const five = Object.fromEntries(Object.entries(TRAITS).filter(([k]) => k !== 'knowledge'));
		expect(firstInvalid({ ...S1, ...five }, 3)).toEqual({ step: 3, field: 'traits' });
	});
	it('rejects a value outside TRAIT_OPTIONS or not an integer with field traits', () => {
		expect(firstInvalid({ ...S1, ...TRAITS, agility: '3' }, 3)).toEqual({ step: 3, field: 'traits' });
		expect(firstInvalid({ ...S1, ...TRAITS, agility: 'abc' }, 3)).toEqual({ step: 3, field: 'traits' });
		expect(firstInvalid({ ...S1, ...TRAITS, agility: '1.5' }, 3)).toEqual({ step: 3, field: 'traits' });
	});
	it('rejects an armor above the tier of the level, or an unknown armor, with field armorId', () => {
		const t2 = 'core_armor_improved_gambeson_armor';
		expect(firstInvalid({ ...S1, level: '1', ...TRAITS, armorId: t2 }, 3)).toEqual({ step: 3, field: 'armorId' });
		expect(firstInvalid({ ...S1, level: '2', ...TRAITS, armorId: t2 }, 3)).toBeNull();
		expect(firstInvalid({ ...S1, ...TRAITS, armorId: 'core_armor_nope' }, 3)).toEqual({ step: 3, field: 'armorId' });
		expect(firstInvalid({ ...S1, ...TRAITS, armorId: 'core_weapon_broadsword' }, 3)).toEqual({ step: 3, field: 'armorId' });
	});
	it('checks traits before the armor', () => {
		expect(firstInvalid({ ...S1, ...TRAITS, agility: '', armorId: 'core_armor_nope' }, 3)).toEqual({ step: 3, field: 'traits' });
	});
	it('earlier steps still come first', () => {
		expect(firstInvalid({ ...S1, level: '11', ...TRAITS, agility: '' }, 3)).toEqual({ step: 1, field: 'level' });
	});
});

describe('stepOfField / fieldOfMessage', () => {
	it('stepOfField("traits") is 3, stepOfField("armorId") is 3', () => {
		expect(stepOfField('traits')).toBe(3);
		expect(stepOfField('armorId')).toBe(3);
	});
	it('maps armorId and traits messages to those fields, anything else to review', () => {
		expect(fieldOfMessage("armorId is tier 2, above the character's tier 1")).toBe('armorId');
		expect(fieldOfMessage('armorId must be an armor')).toBe('armorId');
		expect(fieldOfMessage('traits must be an object')).toBe('traits');
		expect(fieldOfMessage('maxHp must be an integer between 1 and 12')).toBe('review');
		expect(fieldOfMessage('boom')).toBe('review');
	});
});

describe('characterBody', () => {
	it('sends derivedStats, the traits as numbers and armorId', () => {
		const b = characterBody({ ...S1, ...TRAITS, armorId: CHAIN });
		const d = derivedStats('Warrior', 3, CHAIN)!;
		expect(d).toEqual({ evasion: 10, majorThreshold: 10, severeThreshold: 18, maxHp: 6, maxStress: 6, armorSlots: 4 });
		for (const [k, v] of Object.entries(d)) expect(b[k]).toBe(v);
		expect(b.traits).toEqual({ agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 });
		expect(b.armorId).toBe(CHAIN);
		expect(b.name).toBe('Ann');
		expect(b.class).toBe('Warrior');
		expect(b.level).toBe(3);
	});
	it('omits armorId when unarmored and sends the unarmored derived stats', () => {
		const b = characterBody({ ...S1, ...TRAITS, armorId: '' });
		expect(b).not.toHaveProperty('armorId');
		expect([b.evasion, b.majorThreshold, b.severeThreshold, b.maxHp, b.maxStress, b.armorSlots]).toEqual([11, 3, 6, 6, 6, 0]);
		expect(characterBody({ ...S1, ...TRAITS })).not.toHaveProperty('armorId');
	});
});
