import { describe, expect, it } from 'vitest';
import { ApiError, parse } from './campaigns';
import {
	TRACKER_SQL, cardIdSchema, characterJson, conditionsSchema, createSchema, damageSchema, deltaSchema,
	goldSchema, itemCreateSchema, itemQuantitySchema, patchSchema, trackerSchema
} from './characters';

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

describe('TRACKER_SQL', () => {
	it('covers the four trackers', () => {
		expect(Object.keys(TRACKER_SQL).sort()).toEqual(['armor', 'hope', 'hp', 'stress']);
	});
});

import { DAMAGE_SQL } from './characters';
import { getDb } from './db';

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

describe('DAMAGE_SQL', () => {
	async function make(hp: number, armor: number) {
		const db = await getDb();
		const c = await db.query(`INSERT INTO campaigns (name) VALUES ('c') RETURNING id`);
		const r = await db.query(
			`INSERT INTO characters (campaign_id, name, class, evasion, major_threshold, severe_threshold,
				hp_marked, hp_max, armor_marked, armor_max) VALUES ($1,'n','k',10,5,10,$2,10,$3,2) RETURNING id`,
			[c.rows[0].id, hp, armor]
		);
		return { db, id: r.rows[0].id as string };
	}
	it('applies armor and reduces the hit', async () => {
		const { db, id } = await make(0, 0);
		const { rows } = await db.query(DAMAGE_SQL, [7, true, id]);
		expect([rows[0].hp_hit, rows[0].armor_used, rows[0].hp_marked, rows[0].armor_marked]).toEqual([1, true, 1, 1]);
	});
	it('ignores armor when full, and clamps hp', async () => {
		const { db, id } = await make(9, 2);
		const { rows } = await db.query(DAMAGE_SQL, [20, true, id]);
		expect([rows[0].hp_hit, rows[0].armor_used, rows[0].hp_marked, rows[0].armor_marked]).toEqual([3, false, 10, 2]);
	});
	it('does nothing for non-positive amounts and unknown ids', async () => {
		const { db, id } = await make(2, 0);
		const { rows } = await db.query(DAMAGE_SQL, [-5, true, id]);
		expect([rows[0].hp_hit, rows[0].hp_marked]).toEqual([0, 2]);
		expect((await db.query(DAMAGE_SQL, [5, false, 'nope'])).rows).toHaveLength(0);
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

import { GOLD_SQL } from './characters';

describe('goldSchema', () => {
	it('accepts integers only', () => {
		expect(parse(goldSchema, { handfuls: -4 })).toEqual({ handfuls: -4 });
		for (const b of [{ handfuls: 'two' }, { handfuls: 1.5 }, {}, null]) {
			expect(msg(goldSchema, b)).toBe('handfuls must be an integer');
		}
	});
});

describe('GOLD_SQL', () => {
	async function make(h: number, b: number, c: number) {
		const db = await getDb();
		const camp = await db.query(`INSERT INTO campaigns (name) VALUES ('c') RETURNING id`);
		const r = await db.query(
			`INSERT INTO characters (campaign_id, name, class, evasion, major_threshold, severe_threshold,
				hp_max, armor_max, gold_handfuls, gold_bags, gold_chests) VALUES ($1,'n','k',10,5,10,10,2,$2,$3,$4) RETURNING id`,
			[camp.rows[0].id, h, b, c]
		);
		return { db, id: r.rows[0].id as string };
	}
	it('normalizes', async () => {
		const { db, id } = await make(5, 9, 0);
		const { rows } = await db.query(GOLD_SQL, [5, id]);
		expect([rows[0].gold_handfuls, rows[0].gold_bags, rows[0].gold_chests]).toEqual([0, 0, 1]);
	});
	it('refuses overspending without changing anything', async () => {
		const { db, id } = await make(2, 0, 0);
		const { rows } = await db.query(GOLD_SQL, [-5, id]);
		expect(Number(rows[0].gold_total)).toBe(-3);
		const cur = await db.query('SELECT gold_handfuls FROM characters WHERE id = $1', [id]);
		expect(cur.rows[0].gold_handfuls).toBe(2);
	});
	it('returns no rows for unknown ids', async () => {
		const { db } = await make(0, 0, 0);
		expect((await db.query(GOLD_SQL, [1, 'nope'])).rows).toHaveLength(0);
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
