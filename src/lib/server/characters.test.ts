import { describe, expect, it } from 'vitest';
import { characterJson, parseCreate, parsePatch } from './characters';

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

import { TRACKER_SQL, parseDelta } from './characters';

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
