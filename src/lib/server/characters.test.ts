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
