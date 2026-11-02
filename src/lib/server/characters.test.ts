import { describe, expect, it } from 'vitest';
import { TRACKER_SQL, characterJson, parseConditions, parseCreate, parseDelta, parsePatch } from './characters';

const valid = {
	name: ' Rook ', class: 'Guardian', evasion: 10,
	majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3
};

describe('parseCreate', () => {
	it('applies defaults and trims', () => {
		const f = parseCreate(valid);
		expect(f).toMatchObject({ name: 'Rook', level: 1, maxStress: 6 });
	});
	it('rejects bad values', () => {
		for (const o of [
			{ majorThreshold: 10, severeThreshold: 5 }, { severeThreshold: 101 },
			{ maxHp: 0 }, { maxHp: 13 }, { level: 11 }, { evasion: 1.5 }, { name: '' }
		]) expect(() => parseCreate({ ...valid, ...o })).toThrow();
		expect(() => parseCreate(null)).toThrow();
	});
});

describe('parsePatch', () => {
	const cur = { majorThreshold: 5, severeThreshold: 10 };
	it('combines thresholds with current', () => {
		expect(() => parsePatch({ majorThreshold: 20 }, cur)).toThrow();
		expect(parsePatch({ majorThreshold: 9 }, cur)).toEqual({ majorThreshold: 9 });
		expect(() => parsePatch({ severeThreshold: 5 }, cur)).toThrow();
	});
	it('validates notes', () => {
		expect(() => parsePatch({ notes: 'x'.repeat(5001) }, cur)).toThrow();
		expect(parsePatch({ notes: 'hi' }, cur)).toEqual({ notes: 'hi' });
	});
});

describe('characterJson', () => {
	it('computes down', () => {
		const r = { hp_marked: 3, hp_max: 3 };
		expect(characterJson(r).down).toBe(true);
		expect(characterJson({ hp_marked: 0, hp_max: 3 }).down).toBe(false);
	});
});

describe('parseConditions', () => {
	it('returns only supplied booleans', () => {
		expect(parseConditions({})).toEqual({});
		expect(parseConditions({ hidden: true, restrained: false, x: 1 })).toEqual({ hidden: true, restrained: false });
	});
	it('rejects non-booleans and non-objects', () => {
		expect(() => parseConditions({ vulnerable: 'yes' })).toThrow();
		expect(() => parseConditions({ hidden: null })).toThrow();
		expect(() => parseConditions([])).toThrow();
	});
});


describe('parseDelta', () => {
	it('accepts integers only', () => {
		expect(parseDelta({ delta: -3 })).toBe(-3);
		for (const b of [{ delta: 'two' }, { delta: 1.5 }, {}, null]) expect(() => parseDelta(b)).toThrow();
	});
});

describe('TRACKER_SQL', () => {
	it('covers the four trackers', () => {
		expect(Object.keys(TRACKER_SQL).sort()).toEqual(['armor', 'hope', 'hp', 'stress']);
	});
});

import { DAMAGE_SQL, parseDamage } from './characters';
import { getDb } from './db';

describe('parseDamage', () => {
	it('validates amount and useArmor', () => {
		expect(parseDamage({ amount: 3, useArmor: false })).toEqual({ amount: 3, useArmor: false });
		for (const b of [{ amount: 'x', useArmor: true }, { amount: 1.5, useArmor: true }, { amount: 1 }, { amount: 1, useArmor: 'y' }, null])
			expect(() => parseDamage(b)).toThrow();
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

import { itemJson, parseItemCreate, parseItemQuantity } from './characters';

describe('items parsing', () => {
	it('parseItemCreate trims and defaults quantity', () => {
		expect(parseItemCreate({ name: ' Torch ' })).toEqual({ name: 'Torch', quantity: 1 });
		expect(parseItemCreate({ name: 'Rope', quantity: 3 }).quantity).toBe(3);
	});
	it('parseItemCreate rejects bad input', () => {
		for (const b of [{}, { name: '  ' }, { name: 'a', quantity: 0 }, { name: 'a', quantity: 1.5 }, null])
			expect(() => parseItemCreate(b)).toThrow();
	});
	it('parseItemQuantity allows 0 but not negatives/non-integers', () => {
		expect(parseItemQuantity({ quantity: 0 })).toBe(0);
		expect(() => parseItemQuantity({ quantity: -1 })).toThrow();
		expect(() => parseItemQuantity({ quantity: 1.5 })).toThrow();
		expect(() => parseItemQuantity({})).toThrow();
	});
	it('itemJson picks public fields', () => {
		expect(itemJson({ id: 'x', name: 'n', quantity: 2, character_id: 'c' })).toEqual({ id: 'x', name: 'n', quantity: 2 });
	});
});

import { GOLD_SQL, parseGold } from './characters';

describe('parseGold', () => {
	it('accepts integers only', () => {
		expect(parseGold({ handfuls: -4 })).toBe(-4);
		for (const b of [{ handfuls: 'two' }, { handfuls: 1.5 }, {}, null]) expect(() => parseGold(b)).toThrow();
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
