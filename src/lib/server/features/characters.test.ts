import { afterAll, describe, expect, it } from 'vitest';
import { ApiError, parse } from '../errors';
import { cardIdSchema, characterJson, conditionsSchema, createSchema, damageSchema, deltaSchema, goldSchema, itemCreateSchema, itemQuantitySchema, armorStats, armorEvasionModifier, recomputeOnPatch, patchSchema, tierOfLevel, trackerSchema } from './characters';

/** The 400 message `parse` gives for `body`, or null when valid. */
function msg(schema: Parameters<typeof parse>[0], body: unknown): string | null {
	try {
		parse(schema, body);
		return null;
	} catch (e) {
		if (e instanceof ApiError && e.status === 400) return e.message;
		throw e;
	}
}
const INT = (f: string, a: number, b: number) => `${f} must be an integer from ${a} to ${b}`;
const THRESHOLDS = 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100';
const OBJ = 'body must be a JSON object';

const valid = {
	name: ' Rook ', class: 'Guardian', evasion: 10,
	majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3
};

describe('createSchema', () => {
	it('applies defaults and trims', () => {
		expect(parse(createSchema, valid)).toMatchObject({ name: 'Rook', level: 1, maxStress: 6 });
	});
	it('accepts boundaries', () => {
		const lo = { ...valid, name: 'x', class: 'c', evasion: 0, majorThreshold: 1, severeThreshold: 2, maxHp: 1, armorSlots: 0, level: 1, maxStress: 1 };
		const hi = { ...valid, name: 'x'.repeat(100), class: 'c'.repeat(50), evasion: 30, majorThreshold: 99, severeThreshold: 100, maxHp: 12, armorSlots: 12, level: 10, maxStress: 12 };
		expect(msg(createSchema, lo)).toBeNull();
		expect(msg(createSchema, hi)).toBeNull();
	});
	it('rejects each field with its message', () => {
		const bad = (o: object, m: string) => expect(msg(createSchema, { ...valid, ...o })).toBe(m);
		bad({ name: 'x'.repeat(101) }, 'name must be 1 to 100 characters');
		bad({ name: '' }, 'name must be 1 to 100 characters');
		bad({ name: 1 }, 'name must be a string');
		bad({ class: 'c'.repeat(51) }, 'class must be 1 to 50 characters');
		bad({ class: undefined }, 'class must be a string');
		bad({ level: 0 }, INT('level', 1, 10));
		bad({ level: 11 }, INT('level', 1, 10));
		bad({ level: null }, INT('level', 1, 10));
		bad({ evasion: -1 }, INT('evasion', 0, 30));
		bad({ evasion: 1.5 }, INT('evasion', 0, 30));
		bad({ evasion: 31 }, INT('evasion', 0, 30));
		bad({ evasion: undefined }, INT('evasion', 0, 30));
		bad({ severeThreshold: 101 }, INT('severeThreshold', 1, 100));
		bad({ majorThreshold: 0 }, INT('majorThreshold', 1, 100));
		bad({ maxHp: 0 }, INT('maxHp', 1, 12));
		bad({ maxHp: 13 }, INT('maxHp', 1, 12));
		bad({ maxStress: 13 }, INT('maxStress', 1, 12));
		bad({ armorSlots: 13 }, INT('armorSlots', 0, 12));
		bad({ majorThreshold: 10, severeThreshold: 5 }, THRESHOLDS);
		bad({ majorThreshold: 5, severeThreshold: 5 }, THRESHOLDS);
	});
	it('rejects non-objects', () => {
		for (const b of [null, [], 'x', 3]) expect(msg(createSchema, b)).toBe(OBJ);
	});
});

describe('patchSchema', () => {
	const cur = { majorThreshold: 5, severeThreshold: 10, class: 'Ranger' };
	const schema = patchSchema(cur);
	it('returns only supplied fields', () => {
		expect(parse(schema, {})).toEqual({});
		expect(parse(schema, { name: ' A ', ancestry: null })).toEqual({ name: 'A', ancestry: null });
	});
	it('combines thresholds with current', () => {
		expect(msg(schema, { majorThreshold: 20 })).toBe(THRESHOLDS);
		expect(parse(schema, { majorThreshold: 9 })).toEqual({ majorThreshold: 9 });
		expect(msg(schema, { severeThreshold: 5 })).toBe(THRESHOLDS);
		expect(msg(schema, { majorThreshold: 50, severeThreshold: 40 })).toBe(THRESHOLDS);
		expect(msg(schema, { majorThreshold: 1, severeThreshold: 100 })).toBeNull();
	});
	it('validates notes at 5000 and 5001', () => {
		const m = 'notes must be a string of up to 5000 characters';
		expect(msg(schema, { notes: 'x'.repeat(5000) })).toBeNull();
		expect(msg(schema, { notes: 'x'.repeat(5001) })).toBe(m);
		expect(msg(schema, { notes: 3 })).toBe(m);
		expect(parse(schema, { notes: ' hi ' })).toEqual({ notes: ' hi ' });
	});
	it('validates each scalar field', () => {
		expect(msg(schema, { name: 'x'.repeat(101) })).toBe('name must be 1 to 100 characters');
		expect(msg(schema, { name: 1 })).toBe('name must be a string');
		expect(msg(schema, { class: '' })).toBe('class must be 1 to 50 characters');
		expect(msg(schema, { level: 11 })).toBe(INT('level', 1, 10));
		expect(msg(schema, { level: null })).toBe(INT('level', 1, 10));
		expect(msg(schema, { evasion: 31 })).toBe(INT('evasion', 0, 30));
		expect(msg(schema, { maxHp: 13 })).toBe(INT('maxHp', 1, 12));
		expect(msg(schema, { maxStress: 0 })).toBe(INT('maxStress', 1, 12));
		expect(msg(schema, { armorSlots: 13 })).toBe(INT('armorSlots', 0, 12));
		expect(msg(schema, { majorThreshold: 101 })).toBe(INT('majorThreshold', 1, 100));
		expect(msg(schema, { severeThreshold: 0 })).toBe(INT('severeThreshold', 1, 100));
	});
	it('validates subclass/ancestry/community', () => {
		expect(parse(schema, { ancestry: null }).ancestry).toBeNull();
		expect(msg(schema, { ancestry: 'nope' })).toBe('ancestry must be an SRD ancestries id or null');
		expect(msg(schema, { community: 5 })).toBe('community must be an SRD communities id or null');
		expect(msg(schema, { subclass: 'nope' })).toBe('subclass must be an SRD subclasses id or null');
		expect(msg(schema, { subclass: 3 })).toBe('subclass must be an SRD subclasses id or null');
	});
	it('checks the subclass against the class', () => {
		const sub = 'core_subclass_beastbound';
		expect(msg(patchSchema({ ...cur, class: 'Ranger' }), { subclass: sub })).toBeNull();
		expect(msg(schema, { class: 'Bard', subclass: sub })).toBe("subclass must belong to the character's class");
		expect(msg(patchSchema({ ...cur, class: 'Bard' }), { subclass: sub })).toBe(
			"subclass must belong to the character's class"
		);
	});
	it('rejects non-objects', () => {
		for (const b of [null, [], 'x']) expect(msg(schema, b)).toBe(OBJ);
	});
});

describe('characterJson', () => {
	it('computes down', () => {
		const r = { hp_marked: 3, hp_max: 3 };
		expect(characterJson(r).down).toBe(true);
		expect(characterJson({ hp_marked: 0, hp_max: 3 }).down).toBe(false);
	});
});

describe('conditionsSchema', () => {
	it('returns only supplied booleans', () => {
		expect(parse(conditionsSchema, {})).toEqual({});
		expect(parse(conditionsSchema, { hidden: true, restrained: false, x: 1 })).toEqual({ hidden: true, restrained: false });
	});
	it('rejects non-booleans and non-objects', () => {
		expect(msg(conditionsSchema, { vulnerable: 'yes' })).toBe('vulnerable must be a boolean');
		expect(msg(conditionsSchema, { restrained: 0 })).toBe('restrained must be a boolean');
		expect(msg(conditionsSchema, { hidden: null })).toBe('hidden must be a boolean');
		expect(msg(conditionsSchema, [])).toBe(OBJ);
		expect(msg(conditionsSchema, null)).toBe(OBJ);
	});
});

describe('deltaSchema', () => {
	it('accepts safe integers only', () => {
		expect(parse(deltaSchema, { delta: -3 })).toEqual({ delta: -3 });
		expect(msg(deltaSchema, { delta: Number.MAX_SAFE_INTEGER })).toBeNull();
		for (const b of [{ delta: 'two' }, { delta: 1.5 }, { delta: 2 ** 60 }, {}, null, []]) {
			expect(msg(deltaSchema, b)).toBe('delta must be an integer');
		}
	});
});

describe('trackerSchema', () => {
	it('accepts the four trackers only', () => {
		for (const t of ['hp', 'stress', 'hope', 'armor']) expect(trackerSchema.safeParse(t).success).toBe(true);
		for (const t of ['gold', 'toString', '__proto__', '']) expect(trackerSchema.safeParse(t).success).toBe(false);
	});
});

import * as m from './characters';
import { createCampaign } from './campaigns';
import { getDb } from '../db';

afterAll(async () => {
	await (await getDb()).close?.();
});

/** A character with hp 6/6 max, stress 6, armor 2, thresholds 5/10, in a fresh campaign. */
async function make(over: Partial<m.CreateCharacter> = {}) {
	const camp = await createCampaign({ name: 'c' });
	return m.insertCharacter(camp.id, { name: 'n', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2, ...over });
}

describe('damageSchema', () => {
	it('validates amount and useArmor', () => {
		expect(parse(damageSchema, { amount: 3, useArmor: false })).toEqual({ amount: 3, useArmor: false });
		for (const b of [{ amount: 'x', useArmor: true }, { amount: 1.5, useArmor: true }, { useArmor: true }, null, []]) {
			expect(msg(damageSchema, b)).toBe('amount must be an integer');
		}
		for (const b of [{ amount: 1 }, { amount: 1, useArmor: 'y' }]) {
			expect(msg(damageSchema, b)).toBe('useArmor must be a boolean');
		}
	});
});

describe('characters on PGlite', () => {
	it('creates, reads, lists and deletes', async () => {
		const c = await make();
		expect(c).toMatchObject({ name: 'n', hp: { marked: 0, max: 6 }, hope: 2, items: [], cards: [], down: false });
		expect(await m.getCharacter(c.id)).toEqual(c);
		expect((await m.campaignCharacters(c.campaignId)).map((x) => x.id)).toEqual([c.id]);
		expect(await m.getCharacter('nope')).toBeUndefined();
		expect(await m.deleteCharacter(c.id)).toBe(true);
		expect(await m.deleteCharacter(c.id)).toBe(false);
	});

	it('patches fields and lowers marked values with the maxes', async () => {
		const c = await make();
		await m.adjustTracker(c.id, 'hp', 5);
		await m.adjustTracker(c.id, 'armor', 2);
		await m.adjustTracker(c.id, 'stress', 4);
		const p = (await m.patchCharacter(c.id, { name: 'X', notes: 'hi', maxHp: 3, maxStress: 2, armorSlots: 1 }))!;
		expect(p).toMatchObject({ name: 'X', notes: 'hi', hp: { marked: 3, max: 3 }, stress: { marked: 2, max: 2 }, armor: { marked: 1, max: 1 } });
		const q = (await m.patchCharacter(c.id, { maxHp: 8 }))!;
		expect(q.hp).toEqual({ marked: 3, max: 8 });
		expect(await m.patchCharacter(c.id, {})).toEqual(q);
		expect(await m.patchCharacter('nope', { name: 'y' })).toBeUndefined();
		expect(await m.patchCharacter('nope', {})).toBeUndefined();
	});

	it('clamps hp, armor and hope at both bounds', async () => {
		const c = await make();
		for (const [t, key, max] of [['hp', 'hp', 6], ['armor', 'armor', 2]] as const) {
			expect((await m.adjustTracker(c.id, t, 100))![key]).toEqual({ marked: max, max });
			expect((await m.adjustTracker(c.id, t, -100))![key]).toEqual({ marked: 0, max });
		}
		expect((await m.adjustTracker(c.id, 'hope', 100))!.hope).toBe(6);
		expect((await m.adjustTracker(c.id, 'hope', -100))!.hope).toBe(0);
		expect(await m.adjustTracker('nope', 'hp', 1)).toBeUndefined();
	});

	it('stress clamps, overflows into hp and toggles vulnerable', async () => {
		const c = await make();
		expect((await m.adjustTracker(c.id, 'stress', -3))!.stress.marked).toBe(0);
		const full = (await m.adjustTracker(c.id, 'stress', 8))!;
		expect(full.stress.marked).toBe(6);
		expect(full.hp.marked).toBe(2);
		expect(full.conditions.vulnerable).toBe(true);
		const more = (await m.adjustTracker(c.id, 'stress', 100))!;
		expect(more.hp.marked).toBe(6);
		const less = (await m.adjustTracker(c.id, 'stress', -1))!;
		expect([less.stress.marked, less.conditions.vulnerable]).toEqual([5, false]);
	});

	it('damage with and without armor', async () => {
		const c = await make();
		const a = (await m.applyDamage(c.id, 7, true))!;
		expect([a.hpHit, a.armorUsed, a.character.hp.marked, a.character.armor.marked]).toEqual([1, true, 1, 1]);
		const b = (await m.applyDamage(c.id, 7, false))!;
		expect([b.hpHit, b.armorUsed, b.character.hp.marked, b.character.armor.marked]).toEqual([2, false, 3, 1]);
		const d = (await m.applyDamage(c.id, 20, true))!;
		expect([d.hpHit, d.armorUsed, d.character.armor.marked]).toEqual([2, true, 2]);
		const e = (await m.applyDamage(c.id, 20, true))!;
		expect([e.hpHit, e.armorUsed, e.character.hp.marked, e.character.down]).toEqual([3, false, 6, true]);
		const z = (await m.applyDamage(c.id, -5, false))!;
		expect([z.hpHit, z.character.hp.marked]).toEqual([0, 6]);
		expect(await m.applyDamage('nope', 5, false)).toBeUndefined();
	});

	it('gold normalizes and never goes below zero', async () => {
		const c = await make();
		const ok = async (n: number) => {
			const r = await m.adjustGold(c.id, n);
			if (r.status !== 'ok') throw new Error(r.status);
			return r.character.gold;
		};
		expect(await ok(5)).toEqual({ handfuls: 5, bags: 0, chests: 0 });
		expect(await ok(105)).toEqual({ handfuls: 0, bags: 1, chests: 1 });
		expect(await ok(-1)).toEqual({ handfuls: 9, bags: 0, chests: 1 });
		expect((await m.adjustGold(c.id, -109)).status).toBe('ok');
		expect((await m.adjustGold(c.id, -1)).status).toBe('insufficient');
		expect((await m.getCharacter(c.id))!.gold).toEqual({ handfuls: 0, bags: 0, chests: 0 });
		expect((await m.adjustGold('nope', 1)).status).toBe('not-found');
	});

	it('sets conditions', async () => {
		const c = await make();
		const r = (await m.setConditions(c.id, { hidden: true, restrained: false }))!;
		expect(r.conditions).toEqual({ vulnerable: false, restrained: false, hidden: true });
		expect((await m.setConditions(c.id, {}))!.conditions.hidden).toBe(true);
		expect(await m.setConditions('nope', { hidden: true })).toBeUndefined();
	});

	it('adds and removes cards', async () => {
		const { listSrd } = await import('./srd');
		const [x, y, z] = listSrd('domain-cards', 'en').slice(0, 3).map((e) => e.id);
		const c = await make();
		for (const id of [x, y, z]) await m.addCard(c.id, id);
		expect(await m.addCard(c.id, y)).toBeUndefined();
		expect(await m.addCard('nope', y)).toBeUndefined();
		expect((await m.getCharacter(c.id))!.cards).toEqual([x, y, z]);
		expect(await m.removeCard(c.id, y)).toBe(true);
		expect(await m.removeCard(c.id, y)).toBe(false);
		expect((await m.getCharacter(c.id))!.cards).toEqual([x, z]);
	});

	it('merges items by name and returns them in the character', async () => {
		const c = await make();
		const a = (await m.addItem(c.id, { name: 'Rope', quantity: 1, srdId: null }))!;
		expect(a.created).toBe(true);
		const b = (await m.addItem(c.id, { name: ' rope', quantity: 2, srdId: null }))!;
		expect([b.created, b.item.quantity, b.item.id]).toEqual([false, 3, a.item.id]);
		expect(await m.addItem('nope', { name: 'x', quantity: 1, srdId: null })).toBeUndefined();
		expect((await m.getCharacter(c.id))!.items).toEqual([a.item.id && { id: a.item.id, name: 'Rope', quantity: 3, srdId: null }]);
		expect(await m.setItemQuantity(a.item.id, 7)).toMatchObject({ quantity: 7 });
		expect(await m.setItemQuantity(a.item.id, 0)).toBeNull();
		expect(await m.setItemQuantity(a.item.id, 1)).toBeUndefined();
		const d = (await m.addItem(c.id, { name: 'Gem', quantity: 1, srdId: null }))!;
		expect(await m.deleteItem(d.item.id)).toBe(true);
		expect(await m.deleteItem(d.item.id)).toBe(false);
	});

	it('cascades character deletion to its items', async () => {
		const c = await make();
		const a = (await m.addItem(c.id, { name: 'Rope', quantity: 1, srdId: null }))!;
		const b = (await m.addItem(c.id, { name: 'Gem', quantity: 2, srdId: null }))!;
		expect(await m.deleteCharacter(c.id)).toBe(true);
		expect(await m.deleteItem(a.item.id)).toBe(false);
		expect(await m.setItemQuantity(b.item.id, 5)).toBeUndefined();
	});
});

import { itemJson } from './characters';

describe('items', () => {
	it('itemCreateSchema trims and defaults quantity', () => {
		expect(parse(itemCreateSchema, { name: ' Torch ' })).toEqual({ name: 'Torch', quantity: 1, srdId: null });
		expect(parse(itemCreateSchema, { name: 'Rope', quantity: 3, srdId: null }).quantity).toBe(3);
	});
	it('itemCreateSchema boundaries and rejections', () => {
		expect(msg(itemCreateSchema, { name: 'a', quantity: 1_000_000 })).toBeNull();
		expect(msg(itemCreateSchema, { name: 'a'.repeat(100) })).toBeNull();
		expect(msg(itemCreateSchema, { name: 'a'.repeat(101) })).toBe('name must be 1 to 100 characters');
		expect(msg(itemCreateSchema, { name: '  ' })).toBe('name must be 1 to 100 characters');
		expect(msg(itemCreateSchema, {})).toBe('name must be a string');
		for (const quantity of [0, 1.5, 1_000_001, 'x', null]) {
			expect(msg(itemCreateSchema, { name: 'a', quantity })).toBe(INT('quantity', 1, 1_000_000));
		}
		expect(msg(itemCreateSchema, null)).toBe(OBJ);
		expect(msg(itemCreateSchema, [])).toBe(OBJ);
	});
	it('itemQuantitySchema allows 0 but not negatives/non-integers', () => {
		expect(parse(itemQuantitySchema, { quantity: 0 })).toEqual({ quantity: 0 });
		expect(msg(itemQuantitySchema, { quantity: 1_000_000 })).toBeNull();
		for (const b of [{ quantity: -1 }, { quantity: 1.5 }, { quantity: 1_000_001 }, {}]) {
			expect(msg(itemQuantitySchema, b)).toBe(INT('quantity', 0, 1_000_000));
		}
		expect(msg(itemQuantitySchema, null)).toBe(OBJ);
	});
	it('itemJson picks public fields', () => {
		expect(itemJson({ id: 'x', name: 'n', quantity: 2, character_id: 'c' })).toEqual({ id: 'x', name: 'n', quantity: 2, srdId: null });
	});
});

describe('goldSchema', () => {
	it('accepts integers only', () => {
		expect(parse(goldSchema, { handfuls: -4 })).toEqual({ handfuls: -4 });
		for (const b of [{ handfuls: 'two' }, { handfuls: 1.5 }, {}, null]) {
			expect(msg(goldSchema, b)).toBe('handfuls must be an integer');
		}
	});
});

describe('SRD ids', () => {
	it('resolves an SRD item to its localized name', async () => {
		const { listSrd } = await import('./srd');
		const w = listSrd('weapons', 'en')[0];
		expect(parse(itemCreateSchema, { srdId: w.id, quantity: 2 })).toEqual({ name: w.name, quantity: 2, srdId: w.id });
		const m = 'srdId must be an SRD weapon, armor, consumable or item id';
		expect(msg(itemCreateSchema, { srdId: 'nope' })).toBe(m);
		expect(msg(itemCreateSchema, { srdId: 5 })).toBe(m);
	});
	it('validates card ids', async () => {
		const { listSrd } = await import('./srd');
		const c = listSrd('domain-cards', 'en')[0];
		expect(parse(cardIdSchema, { cardId: c.id })).toEqual({ cardId: c.id });
		const m = 'cardId must be an SRD domain card id';
		for (const b of [{ cardId: 'nope' }, { cardId: 4 }, {}]) expect(msg(cardIdSchema, b)).toBe(m);
		expect(msg(cardIdSchema, null)).toBe(OBJ);
	});
});

describe('form field schemas', () => {
	it('trackerFieldSchema / conditionFieldSchema use the form messages', async () => {
		const { trackerFieldSchema, conditionFieldSchema } = await import('./characters');
		expect(trackerFieldSchema.parse('hp')).toBe('hp');
		expect(trackerFieldSchema.safeParse('gold').error?.issues[0].message).toBe('unknown tracker');
		expect(trackerFieldSchema.safeParse(null).error?.issues[0].message).toBe('unknown tracker');
		expect(conditionFieldSchema.parse('hidden')).toBe('hidden');
		expect(conditionFieldSchema.safeParse('burning').error?.issues[0].message).toBe('unknown condition');
		expect(conditionFieldSchema.safeParse(null).error?.issues[0].message).toBe('unknown condition');
	});
});

describe('patchSchema equipped gear', () => {
	const cur = { majorThreshold: 5, severeThreshold: 10, class: 'Ranger', level: 1 };
	const schema = patchSchema(cur);
	it('validates types', () => {
		expect(msg(schema, { primaryWeapon: 'core_weapon_broadsword' })).toBeNull();
		expect(msg(schema, { primaryWeapon: null, secondaryWeapon: null, armorId: null })).toBeNull();
		expect(msg(schema, { primaryWeapon: 'core_weapon_shortsword' })).toBe('primaryWeapon must be a primary weapon');
		expect(msg(schema, { primaryWeapon: 'nope' })).toBe('primaryWeapon must be a primary weapon');
		expect(msg(schema, { secondaryWeapon: 'core_weapon_broadsword' })).toBe('secondaryWeapon must be a secondary weapon');
		expect(msg(schema, { armorId: 'core_weapon_broadsword' })).toBe('armorId must be an armor');
		expect(msg(schema, { armorId: 'core_armor_gambeson_armor' })).toBeNull();
	});
	it('checks the tier', () => {
		expect(msg(schema, { primaryWeapon: 'core_weapon_improved_broadsword' })).toBe(
			"primaryWeapon is tier 2, above the character's tier 1"
		);
		expect(msg(schema, { primaryWeapon: 'core_weapon_improved_broadsword', level: 2 })).toBeNull();
		expect(msg(patchSchema({ ...cur, level: 4 }), { primaryWeapon: 'core_weapon_improved_broadsword' })).toBeNull();
		expect([1, 2, 4, 5, 7, 8, 10].map(tierOfLevel)).toEqual([1, 2, 2, 3, 3, 4, 4]);
	});
	it('rejects two-handed primary with a secondary', () => {
		const msgTwo = 'a two-handed primary weapon leaves no hand for a secondary weapon';
		expect(msg(patchSchema({ ...cur, secondaryWeapon: 'core_weapon_shortsword' }), { primaryWeapon: 'core_weapon_longsword' })).toBe(msgTwo);
		expect(msg(patchSchema({ ...cur, primaryWeapon: 'core_weapon_longsword' }), { secondaryWeapon: 'core_weapon_shortsword' })).toBe(msgTwo);
		expect(msg(patchSchema({ ...cur, primaryWeapon: 'core_weapon_longsword' }), { secondaryWeapon: null })).toBeNull();
	});
	it('computes armor stats from the level', () => {
		expect(armorStats('core_armor_gambeson_armor', 1)).toEqual({ armorMax: 3, majorThreshold: 6, severeThreshold: 12 });
	});
});

describe('derived statistics rules', () => {
	it('armorStats handles unarmored', () => {
		expect(m.armorStats('core_armor_chainmail_armor', 3)).toEqual({ armorMax: 4, majorThreshold: 10, severeThreshold: 18 });
		expect(m.armorStats(null, 10)).toEqual({ armorMax: 0, majorThreshold: 10, severeThreshold: 20 });
	});
	it('armorEvasionModifier', () => {
		expect(m.armorEvasionModifier('core_armor_chainmail_armor')).toBe(-1);
		expect(m.armorEvasionModifier(null)).toBe(0);
	});
	it('traitsFollowArray', () => {
		expect(m.traitsFollowArray([0, -1, 2, 1, 0, 1])).toBe(true);
		expect(m.traitsFollowArray([2, 2, 1, 0, 0, -1])).toBe(false);
		expect(m.traitsFollowArray([2, 1, 1, 0, 0])).toBe(false);
	});
	it('classStart and derivedStats', () => {
		expect(m.classStart('Bard')).toEqual({ evasion: 10, hp: 5 });
		expect(m.classStart('Pirate')).toBeNull();
		expect(m.derivedStats('Warrior', 3, 'core_armor_chainmail_armor')).toEqual({ evasion: 10, majorThreshold: 10, severeThreshold: 18, maxHp: 6, maxStress: 6, armorSlots: 4 });
		expect(m.derivedStats('Warrior', 3, null)).toEqual({ evasion: 11, majorThreshold: 3, severeThreshold: 6, maxHp: 6, maxStress: 6, armorSlots: 0 });
		expect(m.derivedStats('Pirate', 1, null)).toBeNull();
	});
	it('gearTierIssue', () => {
		expect(m.gearTierIssue('armorId', 'armors', null, 1)).toBeNull();
	});
});

describe('recomputeOnPatch', () => {
	const cur: any = { level: 3, evasion: 12, armorId: null, majorThreshold: 3, severeThreshold: 6 };
	it('covers each rule', () => {
		expect(recomputeOnPatch(cur, {})).toEqual({});
		expect(recomputeOnPatch(cur, { armorId: null })).toEqual({});
		const id = 'core_armor_chainmail_armor';
		const a = armorStats(id, 3);
		const mod = armorEvasionModifier(id);
		expect(recomputeOnPatch(cur, { armorId: id })).toEqual({ majorThreshold: a.majorThreshold, severeThreshold: a.severeThreshold, armorSlots: a.armorMax, evasion: 12 + mod });
		const worn = { ...cur, armorId: id, evasion: 10 };
		expect(recomputeOnPatch(worn, { armorId: null })).toEqual({ majorThreshold: 3, severeThreshold: 6, armorSlots: 0, evasion: 10 - mod });
		expect(recomputeOnPatch(worn, { level: 5 })).toEqual({ majorThreshold: armorStats(id, 5).majorThreshold, severeThreshold: armorStats(id, 5).severeThreshold });
		expect(recomputeOnPatch(cur, { level: 5 })).toEqual({ majorThreshold: 5, severeThreshold: 10 });
		expect(recomputeOnPatch({ ...cur, majorThreshold: 5, severeThreshold: 10 }, { level: 4 })).toEqual({});
		expect(recomputeOnPatch({ ...worn, evasion: 30 }, { armorId: null })).toMatchObject({ evasion: Math.min(30, 30 - mod) });
	});
});
