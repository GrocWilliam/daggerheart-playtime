import { ApiError } from './campaigns';

export const CHARACTER_COLS = `id, campaign_id, name, class, level, evasion, major_threshold,
	severe_threshold, hp_marked, hp_max, stress_marked, stress_max, hope, armor_marked, armor_max,
	vulnerable, restrained, hidden, notes, gold_handfuls, gold_bags, gold_chests`;

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
		items: [],
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
