import { describe, expect, it } from 'vitest';
// Assumed: patchSchema(current) of src/lib/server/features/characters.ts takes the stored
// character values, including level, primaryWeapon, secondaryWeapon and armorId.
import { patchSchema } from '../../../src/lib/server/features/characters';

const cur = (o: any = {}) => ({ majorThreshold: 5, severeThreshold: 10, class: 'Guardian', level: 1, primaryWeapon: null, secondaryWeapon: null, armorId: null, ...o });
const msg = (c: any, body: any) => {
	const r: any = patchSchema(c).safeParse(body);
	return r.success ? null : (r.error.issues[0].message as string);
};
const ok = (c: any, body: any) => expect(msg(c, body)).toBeNull();

describe('gear validation (no database)', () => {
	it('accepts valid tier 1 gear and null', () => {
		ok(cur(), { primaryWeapon: 'core_weapon_broadsword' });
		ok(cur(), { primaryWeapon: 'core_weapon_wand' });
		ok(cur(), { secondaryWeapon: 'core_weapon_shortsword' });
		ok(cur(), { armorId: 'core_armor_gambeson_armor' });
		ok(cur(), { primaryWeapon: null, secondaryWeapon: null, armorId: null });
	});
	it('wrong type or unknown id', () => {
		for (const id of ['core_weapon_shortsword', 'core_armor_gambeson_armor', 'nope'])
			expect(msg(cur(), { primaryWeapon: id })).toBe('primaryWeapon must be a primary weapon');
		for (const id of ['core_weapon_broadsword', 'core_armor_gambeson_armor', 'nope'])
			expect(msg(cur(), { secondaryWeapon: id })).toBe('secondaryWeapon must be a secondary weapon');
		for (const id of ['core_weapon_broadsword', 'nope'])
			expect(msg(cur(), { armorId: id })).toBe('armorId must be an armor');
	});
	it('tier mapping: level 1 -> 1, 2-4 -> 2, 5-7 -> 3, 8-10 -> 4', () => {
		const gear: [string, string[]][] = [
			['primaryWeapon', ['core_weapon_broadsword', 'core_weapon_improved_broadsword', 'core_weapon_advanced_broadsword', 'core_weapon_legendary_broadsword']],
			['secondaryWeapon', ['core_weapon_shortsword', 'core_weapon_improved_shortsword', 'core_weapon_advanced_shortsword', 'core_weapon_legendary_shortsword']],
			['armorId', ['core_armor_gambeson_armor', 'core_armor_improved_gambeson_armor', 'core_armor_advanced_gambeson_armor', 'core_armor_legendary_gambeson_armor']]
		];
		const tierOf = (l: number) => (l === 1 ? 1 : l <= 4 ? 2 : l <= 7 ? 3 : 4);
		for (const [field, ids] of gear)
			for (let level = 1; level <= 10; level++)
				ids.forEach((id, i) => {
					const tier = i + 1;
					const m = msg(cur({ level }), { [field]: id });
					if (tier > tierOf(level)) expect(m, `${field} t${tier} L${level}`).toBe(`${field} is tier ${tier}, above the character's tier ${tierOf(level)}`);
					else expect(m, `${field} t${tier} L${level}`).toBeNull();
				});
	});
	it('uses the new level from the same patch', () => {
		ok(cur(), { level: 2, primaryWeapon: 'core_weapon_improved_broadsword' });
		expect(msg(cur({ level: 2 }), { level: 1, primaryWeapon: 'core_weapon_improved_broadsword' })).toBe("primaryWeapon is tier 2, above the character's tier 1");
	});
	it('two-handed primary with a secondary', () => {
		const m = 'a two-handed primary weapon leaves no hand for a secondary weapon';
		expect(msg(cur({ secondaryWeapon: 'core_weapon_shortsword' }), { primaryWeapon: 'core_weapon_longsword' })).toBe(m);
		expect(msg(cur({ primaryWeapon: 'core_weapon_longsword' }), { secondaryWeapon: 'core_weapon_shortsword' })).toBe(m);
		expect(msg(cur(), { primaryWeapon: 'core_weapon_longsword', secondaryWeapon: 'core_weapon_shortsword' })).toBe(m);
		ok(cur({ secondaryWeapon: 'core_weapon_shortsword' }), { primaryWeapon: 'core_weapon_broadsword' });
		ok(cur({ secondaryWeapon: 'core_weapon_shortsword' }), { primaryWeapon: 'core_weapon_longsword', secondaryWeapon: null });
		ok(cur({ primaryWeapon: 'core_weapon_longsword' }), { primaryWeapon: null, secondaryWeapon: 'core_weapon_shortsword' });
	});
});
