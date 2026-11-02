import { ApiError } from './campaigns';

const BASE_COLS = `id, campaign_id, name, class, level, evasion, major_threshold,
	severe_threshold, hp_marked, hp_max, stress_marked, stress_max, hope, armor_marked, armor_max,
	vulnerable, restrained, hidden, notes, gold_handfuls, gold_bags, gold_chests`;

const ITEMS_SUBQUERY = (idRef: string) => `(SELECT COALESCE(json_agg(json_build_object(
	'id', i.id, 'name', i.name, 'quantity', i.quantity) ORDER BY i.created_at, i.id), '[]'::json)
	FROM items i WHERE i.character_id = ${idRef}) AS items`;

export const CHARACTER_COLS = `${BASE_COLS}, ${ITEMS_SUBQUERY('characters.id')}`;

export function characterJson(r: any) {
	return {
		id: r.id,
		campaignId: r.campaign_id,
		name: r.name,
		class: r.class,
		level: r.level,
		evasion: r.evasion,
		majorThreshold: r.major_threshold,
		severeThreshold: r.severe_threshold,
		hp: { marked: r.hp_marked, max: r.hp_max },
		stress: { marked: r.stress_marked, max: r.stress_max },
		hope: r.hope,
		armor: { marked: r.armor_marked, max: r.armor_max },
		conditions: { vulnerable: r.vulnerable, restrained: r.restrained, hidden: r.hidden },
		notes: r.notes,
		gold: { handfuls: r.gold_handfuls, bags: r.gold_bags, chests: r.gold_chests },
		items: r.items ?? [],
		down: r.hp_marked === r.hp_max
	};
}

function str(v: unknown, field: string, min: number, max: number): string {
	if (typeof v !== 'string') throw new ApiError(400, `${field} must be a string`);
	const t = v.trim();
	if (t.length < min || t.length > max) {
		throw new ApiError(400, `${field} must be ${min} to ${max} characters`);
	}
	return t;
}

function int(v: unknown, field: string, min: number, max: number): number {
	if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
		throw new ApiError(400, `${field} must be an integer from ${min} to ${max}`);
	}
	return v;
}

export interface CharacterFields {
	name: string;
	class: string;
	level: number;
	evasion: number;
	majorThreshold: number;
	severeThreshold: number;
	maxHp: number;
	maxStress: number;
	armorSlots: number;
	notes: string;
}

function checkThresholds(major: number, severe: number) {
	if (!(major >= 1 && major < severe && severe <= 100)) {
		throw new ApiError(400, 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100');
	}
}

function asObject(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new ApiError(400, 'body must be a JSON object');
	}
	return body as Record<string, unknown>;
}

export function parseCreate(body: unknown): CharacterFields {
	const b = asObject(body);
	const f: CharacterFields = {
		name: str(b.name, 'name', 1, 100),
		class: str(b.class, 'class', 1, 50),
		level: b.level === undefined ? 1 : int(b.level, 'level', 1, 10),
		evasion: int(b.evasion, 'evasion', 0, 30),
		majorThreshold: int(b.majorThreshold, 'majorThreshold', 1, 100),
		severeThreshold: int(b.severeThreshold, 'severeThreshold', 1, 100),
		maxHp: int(b.maxHp, 'maxHp', 1, 12),
		maxStress: b.maxStress === undefined ? 6 : int(b.maxStress, 'maxStress', 1, 12),
		armorSlots: int(b.armorSlots, 'armorSlots', 0, 12),
		notes: ''
	};
	checkThresholds(f.majorThreshold, f.severeThreshold);
	return f;
}

/** Validates a PATCH body; returns only supplied fields. `current` supplies the other threshold. */
export function parsePatch(
	body: unknown,
	current: { majorThreshold: number; severeThreshold: number }
): Partial<CharacterFields> {
	const b = asObject(body);
	const p: Partial<CharacterFields> = {};
	if (b.name !== undefined) p.name = str(b.name, 'name', 1, 100);
	if (b.class !== undefined) p.class = str(b.class, 'class', 1, 50);
	if (b.level !== undefined) p.level = int(b.level, 'level', 1, 10);
	if (b.evasion !== undefined) p.evasion = int(b.evasion, 'evasion', 0, 30);
	if (b.majorThreshold !== undefined) p.majorThreshold = int(b.majorThreshold, 'majorThreshold', 1, 100);
	if (b.severeThreshold !== undefined) p.severeThreshold = int(b.severeThreshold, 'severeThreshold', 1, 100);
	if (b.maxHp !== undefined) p.maxHp = int(b.maxHp, 'maxHp', 1, 12);
	if (b.maxStress !== undefined) p.maxStress = int(b.maxStress, 'maxStress', 1, 12);
	if (b.armorSlots !== undefined) p.armorSlots = int(b.armorSlots, 'armorSlots', 0, 12);
	if (b.notes !== undefined) {
		if (typeof b.notes !== 'string' || b.notes.length > 5000) {
			throw new ApiError(400, 'notes must be a string of up to 5000 characters');
		}
		p.notes = b.notes;
	}
	if (p.majorThreshold !== undefined || p.severeThreshold !== undefined) {
		checkThresholds(
			p.majorThreshold ?? current.majorThreshold,
			p.severeThreshold ?? current.severeThreshold
		);
	}
	return p;
}

export const CONDITION_KEYS = ['vulnerable', 'restrained', 'hidden'] as const;

/** Validates a conditions body; returns only the supplied boolean fields. */
export function parseConditions(body: unknown): Partial<Record<(typeof CONDITION_KEYS)[number], boolean>> {
	const b = asObject(body);
	const out: Partial<Record<(typeof CONDITION_KEYS)[number], boolean>> = {};
	for (const k of CONDITION_KEYS) {
		if (b[k] === undefined) continue;
		if (typeof b[k] !== 'boolean') throw new ApiError(400, `${k} must be a boolean`);
		out[k] = b[k] as boolean;
	}
	return out;
}

export type Tracker = 'hp' | 'stress' | 'hope' | 'armor';

export function parseDelta(body: unknown): number {
	const d = (body as { delta?: unknown } | null)?.delta;
	if (typeof d !== 'number' || !Number.isSafeInteger(d)) {
		throw new ApiError(400, 'delta must be an integer');
	}
	return d;
}

// Single atomic UPDATE per tracker ($1 = delta, $2 = id); SET expressions read the old row.
const NEW_STRESS = 'LEAST(stress_max, GREATEST(0, stress_marked + $1::bigint))';
export const TRACKER_SQL: Record<Tracker, string> = {
	hp: 'hp_marked = LEAST(hp_max, GREATEST(0, hp_marked + $1::bigint))::int',
	hope: 'hope = LEAST(6, GREATEST(0, hope + $1::bigint))::int',
	armor: 'armor_marked = LEAST(armor_max, GREATEST(0, armor_marked + $1::bigint))::int',
	stress: `stress_marked = ${NEW_STRESS}::int,
		hp_marked = LEAST(hp_max, hp_marked + CASE WHEN $1::bigint > 0
			THEN GREATEST(0, stress_marked + $1::bigint - stress_max) ELSE 0 END)::int,
		vulnerable = CASE WHEN ${NEW_STRESS} = stress_max THEN true
			WHEN stress_marked = stress_max THEN false ELSE vulnerable END`
};

export function parseDamage(body: unknown): { amount: number; useArmor: boolean } {
	const b = body as { amount?: unknown; useArmor?: unknown } | null;
	if (typeof b?.amount !== 'number' || !Number.isSafeInteger(b.amount)) {
		throw new ApiError(400, 'amount must be an integer');
	}
	if (typeof b.useArmor !== 'boolean') throw new ApiError(400, 'useArmor must be a boolean');
	return { amount: b.amount, useArmor: b.useArmor };
}

// Atomic damage: $1 = amount, $2 = useArmor, $3 = id. The CTE locks the row and computes the hit once.
export const DAMAGE_SQL = `
WITH old AS (
	SELECT id, armor_marked < armor_max AND $2::boolean AS armor_used,
		CASE WHEN $1::bigint <= 0 THEN 0
			WHEN $1::bigint < major_threshold THEN 1
			WHEN $1::bigint < severe_threshold THEN 2 ELSE 3 END AS base_hit
	FROM characters WHERE id = $3 FOR UPDATE
), calc AS (
	SELECT id, armor_used, GREATEST(0, base_hit - CASE WHEN armor_used THEN 1 ELSE 0 END) AS hp_hit FROM old
)
UPDATE characters c SET
	hp_marked = LEAST(c.hp_max, GREATEST(0, c.hp_marked + calc.hp_hit))::int,
	armor_marked = c.armor_marked + CASE WHEN calc.armor_used THEN 1 ELSE 0 END
FROM calc WHERE c.id = calc.id
RETURNING ${BASE_COLS.replace(/\b([a-z_]+)\b/g, 'c.$1')}, ${ITEMS_SUBQUERY('c.id')}, calc.hp_hit, calc.armor_used`;

export function parseItemCreate(body: unknown): { name: string; quantity: number } {
	const b = asObject(body);
	const name = str(b.name, 'name', 1, 100);
	const quantity = b.quantity === undefined ? 1 : int(b.quantity, 'quantity', 1, 1_000_000);
	return { name, quantity };
}

export function parseItemQuantity(body: unknown): number {
	return int(asObject(body).quantity, 'quantity', 0, 1_000_000);
}

export function itemJson(r: any) {
	return { id: r.id, name: r.name, quantity: r.quantity };
}

export function parseGold(body: unknown): number {
	const h = (body as { handfuls?: unknown } | null)?.handfuls;
	if (typeof h !== 'number' || !Number.isSafeInteger(h)) {
		throw new ApiError(400, 'handfuls must be an integer');
	}
	return h;
}

// Atomic gold change: $1 = handfuls delta, $2 = id. Locks the row; updates only if the new total is >= 0.
export const GOLD_SQL = `
WITH old AS (
	SELECT id, gold_chests::bigint * 100 + gold_bags::bigint * 10 + gold_handfuls + $1::bigint AS total
	FROM characters WHERE id = $2 FOR UPDATE
), upd AS (
	UPDATE characters c SET
		gold_chests = (old.total / 100)::int,
		gold_bags = ((old.total / 10) % 10)::int,
		gold_handfuls = (old.total % 10)::int
	FROM old WHERE c.id = old.id AND old.total >= 0
	RETURNING ${BASE_COLS.replace(/\b([a-z_]+)\b/g, 'c.$1')}, ${ITEMS_SUBQUERY('c.id')}
)
SELECT old.total AS gold_total, upd.* FROM old LEFT JOIN upd ON true`;
