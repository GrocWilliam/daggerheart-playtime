import * as z from 'zod';
import { and, eq } from 'drizzle-orm';
import { characters, scenes } from '../schema';
import { ApiError, parse } from '../errors';
import { intField, OBJECT_ERROR } from '../../utils/validation';
import { seededRandom } from '../../utils/prng';
import { adversariesByTier, getAdversary } from './srd';

export const ADJUSTMENTS = ['easier', 'damageBoost', 'harder'] as const;
export type Adjustment = (typeof ADJUSTMENTS)[number];
export type AutomaticAdjustment = 'twoSolos' | 'noBigThreats';

const ADJUSTMENT_DELTA: Record<Adjustment, number> = { easier: -1, damageBoost: -2, harder: 2 };
const ADJUSTMENTS_ERROR = 'adjustments must be easier, damageBoost or harder';

/** Request to generate an encounter; every field is optional. */
export const generateRequestSchema = z.object(
	{
		partySize: intField('partySize', 1, 8).optional(),
		tier: intField('tier', 1, 4).optional(),
		adjustments: z
			.array(z.enum(ADJUSTMENTS, { error: ADJUSTMENTS_ERROR }), { error: ADJUSTMENTS_ERROR })
			.optional(),
		seed: z
			.number({ error: 'seed must be an integer' })
			.refine(Number.isSafeInteger, { error: 'seed must be an integer' })
			.optional()
	},
	{ error: OBJECT_ERROR }
);
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export type EncounterAdversary = { role: string; count: number };

const BIG_THREATS = ['Bruiser', 'Horde', 'Leader', 'Solo'];

/** Battle Points: 3 x party + 2, manual adjustments, then the automatic ones. */
export function budgetFor(partySize: number, adjustments: Adjustment[], adversaries: EncounterAdversary[]) {
	let budget = 3 * partySize + 2;
	for (const a of new Set(adjustments)) budget += ADJUSTMENT_DELTA[a];
	const automatic: AutomaticAdjustment[] = [];
	if (adversaries.filter((a) => a.role === 'Solo').reduce((n, a) => n + a.count, 0) >= 2) {
		budget -= 2;
		automatic.push('twoSolos');
	}
	if (!adversaries.some((a) => BIG_THREATS.includes(a.role))) {
		budget += 1;
		automatic.push('noBigThreats');
	}
	return { budget, automatic };
}

const COSTS: Record<string, number> = {
	Social: 1, Support: 1, Horde: 2, Ranged: 2, Skulk: 2, Standard: 2, Leader: 3, Bruiser: 4, Solo: 5
};

/** Battle Points of `count` adversaries of a role; Minions cost 1 per group as large as the party. */
export function costOf(role: string, count: number, partySize: number) {
	if (role === 'Minion') return Math.ceil(count / Math.max(1, partySize));
	return (COSTS[role] ?? 2) * count;
}

/** Party size and tier from character levels. */
export function partyDefaults(levels: number[]) {
	const top = levels.length ? Math.max(...levels) : 1;
	const tier = top <= 1 ? 1 : top <= 4 ? 2 : top <= 7 ? 3 : 4;
	return { partySize: Math.max(1, levels.length), tier };
}

/** Defaults for a campaign from its characters' levels. */
export async function campaignPartyDefaults(campaignId: string) {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	const rows = await db.select({ level: characters.level }).from(characters).where(eq(characters.campaignId, campaignId));
	return partyDefaults(rows.map((r) => r.level));
}

export type PoolAdversary = { id: string; name: string; role: string };
/** `hpMarked`, when present, holds marked HP per copy (`length === count`); absent means all zeros. */
export type EncounterEntry = PoolAdversary & { count: number; cost: number; hpMarked?: number[] };
export type Encounter = {
	partySize: number;
	tier: number;
	budget: number;
	spent: number;
	adjustments: Adjustment[];
	automatic: AutomaticAdjustment[];
	adversaries: EncounterEntry[];
};

/** Budget, automatic adjustments and spent points of a list of entries. */
function evaluate(partySize: number, adjustments: Adjustment[], list: { id: string; name: string; role: string; count: number }[]) {
	const adversaries = list.map((a) => ({ ...a, cost: costOf(a.role, a.count, partySize) }));
	const { budget, automatic } = budgetFor(partySize, adjustments, adversaries.map((a) => ({ role: a.role, count: a.count })));
	return { budget, automatic, adversaries, spent: adversaries.reduce((n, a) => n + a.cost, 0) };
}

const valid = (e: { budget: number; spent: number; adversaries: unknown[] }) =>
	e.spent <= e.budget && e.budget - e.spent <= 1 && (e.budget < 4 || e.adversaries.length >= 2);

/** Generates an encounter from `pool` (adversaries of one tier); same seed and inputs give the same result. */
export function generateEncounter(
	input: { partySize: number; tier: number; adjustments?: Adjustment[]; seed?: number },
	pool: PoolAdversary[]
): Encounter {
	const partySize = input.partySize;
	const adjustments = [...new Set(input.adjustments ?? [])];
	const random = seededRandom(input.seed ?? Math.floor(Math.random() * 2 ** 32));
	const base = evaluate(partySize, adjustments, []).budget - 1; // budget before the "no big threat" bonus
	const unit = (role: string) => (role === 'Minion' ? partySize : 1);
	const costFor = (role: string) => costOf(role, unit(role), partySize);
	let best: ReturnType<typeof evaluate> | null = null;
	for (let attempt = 0; attempt < 2000; attempt++) {
		const counts = new Map<string, number>();
		let spent = 0;
		for (;;) {
			const room = pool.filter((a) => costFor(a.role) <= base - spent);
			if (room.length === 0) break;
			const a = room[Math.floor(random() * room.length)];
			counts.set(a.id, (counts.get(a.id) ?? 0) + unit(a.role));
			spent += costFor(a.role);
		}
		const tryList = () => [...counts].map(([id, count]) => ({ ...pool.find((p) => p.id === id)!, count }));
		let e = evaluate(partySize, adjustments, tryList());
		if (!valid(e) && e.budget > e.spent) {
			// no big threat gives +1: spend it on a cheap adversary
			const cheap = pool.filter((a) => costFor(a.role) === e.budget - e.spent);
			if (cheap.length) {
				const a = cheap[Math.floor(random() * cheap.length)];
				counts.set(a.id, (counts.get(a.id) ?? 0) + unit(a.role));
				e = evaluate(partySize, adjustments, tryList());
			}
		}
		if (valid(e)) return { partySize, tier: input.tier, adjustments, ...e };
		best ??= e;
	}
	return { partySize, tier: input.tier, adjustments, ...best! };
}

const countsSchema = z.object(
	{
		adversaries: z.array(
			z.object(
				{
					id: z.string({ error: 'adversaries must be a list of {id, count}' }),
					count: z
						.number({ error: 'count must be a positive integer' })
						.refine((n) => Number.isSafeInteger(n) && n > 0, { error: 'count must be a positive integer' })
				},
				{ error: 'adversaries must be a list of {id, count}' }
			),
			{ error: 'adversaries must be a list of {id, count}' }
		)
	},
	{ error: OBJECT_ERROR }
);

/** HP marked by `amount` damage against `thresholds` ("Major/Severe", Severe may be "None"; anything else: 1). */
export function damageMarks(amount: number, thresholds: string): number {
	if (!(amount > 0)) return 0;
	const m = /^(\d+)\/(\d+|None)$/.exec(thresholds);
	if (!m) return 1;
	const major = Number(m[1]);
	if (amount < major) return 1;
	if (m[2] === 'None') return 2;
	return amount < Number(m[2]) ? 2 : 3;
}

/** Marked HP per copy of an entry (zeros when never marked). */
export function marksOf(entry: { count: number; hpMarked?: number[] }): number[] {
	return entry.hpMarked ?? Array(entry.count).fill(0);
}

/** Cuts or pads marks with zeros to `count` copies; `undefined` stays `undefined`. */
export function resizeMarks(marks: number[] | undefined, count: number): number[] | undefined {
	if (!marks) return undefined;
	return Array.from({ length: count }, (_, i) => marks[i] ?? 0);
}

/** HP maximum of an SRD adversary (English data). */
export function maxHp(id: string): number {
	return Number(getAdversary(id, 'en')!.hp);
}

const INDEX_ERROR = 'index must be a copy of that adversary';
const battleTarget = {
	adversaryId: z.string({ error: 'adversaryId must be a string' }),
	index: z.number({ error: INDEX_ERROR }).refine((n) => Number.isSafeInteger(n) && n >= 0, { error: INDEX_ERROR })
};

export const battleDamageSchema = z.object(
	{ ...battleTarget, amount: intField('amount', 1, 999) },
	{ error: OBJECT_ERROR }
);
export type BattleDamage = z.infer<typeof battleDamageSchema>;

const DELTA_ERROR = 'delta must be 1 or -1';
export const battleHpSchema = z.object(
	{
		...battleTarget,
		delta: z.number({ error: DELTA_ERROR }).refine((n) => n === 1 || n === -1, { error: DELTA_ERROR })
	},
	{ error: OBJECT_ERROR }
);
export type BattleHp = z.infer<typeof battleHpSchema>;

export const battleAddSchema = z.object(
	{ adversaryId: z.string({ error: 'adversaryId must be a string' }), count: intField('count', 1, 20) },
	{ error: OBJECT_ERROR }
);
export type BattleAdd = z.infer<typeof battleAddSchema>;

async function conn() {
	const { getDrizzle } = await import('../db');
	return getDrizzle();
}

async function sceneRow(campaignId: string, sceneId: string) {
	const db = await conn();
	const [row] = await db
		.select({ encounter: scenes.encounter })
		.from(scenes)
		.where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)));
	if (!row) throw new ApiError(404, 'scene not found');
	return { db, encounter: row.encounter as Encounter | null };
}

type Db = Awaited<ReturnType<typeof conn>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Locks the scene row and returns its encounter; 404 when the scene or its encounter is absent. */
async function lockEncounter(tx: Tx, campaignId: string, sceneId: string): Promise<Encounter> {
	const [row] = await tx
		.select({ encounter: scenes.encounter })
		.from(scenes)
		.where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)))
		.for('update');
	if (!row) throw new ApiError(404, 'scene not found');
	if (!row.encounter) throw new ApiError(404, 'encounter not found');
	return row.encounter as Encounter;
}

/** Locks the encounter and finds the targeted copy: its entry, marks, SRD element and HP maximum. */
async function targetCopy(tx: Tx, campaignId: string, sceneId: string, adversaryId: string, index: number) {
	const encounter = await lockEncounter(tx, campaignId, sceneId);
	const srd = getAdversary(adversaryId, 'en');
	if (!srd) throw new ApiError(400, `adversaries contains an unknown adversary: ${adversaryId}`);
	const entry = encounter.adversaries.find((a) => a.id === adversaryId);
	if (!entry || index >= entry.count) throw new ApiError(400, INDEX_ERROR);
	return { encounter, entry, marks: marksOf(entry), max: maxHp(adversaryId), thresholds: String(srd.thresholds ?? '') };
}

/** Marks HP on one copy from a damage amount; returns the HP actually marked and the encounter. */
export async function damageSceneAdversary(campaignId: string, sceneId: string, body: unknown) {
	const f = parse(battleDamageSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		const { encounter, entry, marks, max, thresholds } = await targetCopy(tx, campaignId, sceneId, f.adversaryId, f.index);
		const hpHit = Math.max(0, Math.min(damageMarks(f.amount, thresholds), max - marks[f.index]));
		marks[f.index] += hpHit;
		entry.hpMarked = marks;
		await tx.update(scenes).set({ encounter }).where(eq(scenes.id, sceneId));
		return { hpHit, encounter };
	});
}

/** Marks (+1) or clears (-1) one HP on one copy, within 0..hp; returns the encounter. */
export async function markSceneAdversary(campaignId: string, sceneId: string, body: unknown): Promise<Encounter> {
	const f = parse(battleHpSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		const { encounter, entry, marks, max } = await targetCopy(tx, campaignId, sceneId, f.adversaryId, f.index);
		marks[f.index] = Math.min(max, Math.max(0, marks[f.index] + f.delta));
		entry.hpMarked = marks;
		await tx.update(scenes).set({ encounter }).where(eq(scenes.id, sceneId));
		return encounter;
	});
}

/** Generates and stores (replacing any previous) the scene's encounter. */
export async function generateSceneEncounter(campaignId: string, sceneId: string, body: unknown): Promise<Encounter> {
	const f = parse(generateRequestSchema, body);
	const { db } = await sceneRow(campaignId, sceneId);
	const defaults = await campaignPartyDefaults(campaignId);
	const partySize = f.partySize ?? defaults.partySize;
	const tier = f.tier ?? defaults.tier;
	const pool = adversariesByTier(tier, 'en').map(({ id, name, role }) => ({ id, name, role }));
	const enc = generateEncounter({ partySize, tier, adjustments: f.adjustments, seed: f.seed }, pool);
	// Big threats last: their feature text often names the minions they lead (keeps name lookups on cards unambiguous).
	enc.adversaries.sort((a, b) => costOf(a.role, 1, partySize) - costOf(b.role, 1, partySize));
	await db.update(scenes).set({ encounter: enc }).where(eq(scenes.id, sceneId));
	return enc;
}

/** Adds copies of an SRD adversary (any tier) to the stored encounter, keeping marks; recomputes budget and spent. */
export async function addSceneAdversaries(campaignId: string, sceneId: string, body: unknown): Promise<Encounter> {
	const f = parse(battleAddSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		const encounter = await lockEncounter(tx, campaignId, sceneId);
		const srd = adversariesByTier(undefined, 'en').find((a) => a.id === f.adversaryId);
		if (!srd) throw new ApiError(400, `adversaries contains an unknown adversary: ${f.adversaryId}`);
		const list = encounter.adversaries.map(({ id, name, role, count }) => ({ id, name, role, count }));
		const found = list.find((a) => a.id === f.adversaryId);
		if (found) found.count += f.count;
		else list.push({ id: srd.id, name: srd.name, role: srd.role, count: f.count });
		const e = evaluate(encounter.partySize, encounter.adjustments, list);
		const adversaries: EncounterEntry[] = e.adversaries.map((a) => {
			const marks = resizeMarks(encounter.adversaries.find((o) => o.id === a.id)?.hpMarked, a.count);
			return marks ? { ...a, hpMarked: marks } : a;
		});
		const next: Encounter = { ...encounter, ...e, adversaries };
		await tx.update(scenes).set({ encounter: next }).where(eq(scenes.id, sceneId));
		return next;
	});
}

/** Replaces the adversaries of the stored encounter; recomputes budget and spent and resizes kept marks. */
export async function patchSceneEncounter(campaignId: string, sceneId: string, body: unknown) {
	const { adversaries } = parse(countsSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		const encounter = await lockEncounter(tx, campaignId, sceneId);
		const all = new Map(adversariesByTier(undefined, 'en').map((a) => [a.id, a]));
		const merged = new Map<string, number>();
		for (const a of adversaries) {
			if (!all.has(a.id)) throw new ApiError(400, `adversaries contains an unknown adversary: ${a.id}`);
			merged.set(a.id, (merged.get(a.id) ?? 0) + a.count);
		}
		const list = [...merged].map(([id, count]) => ({ id, name: all.get(id)!.name, role: all.get(id)!.role, count }));
		const e = evaluate(encounter.partySize, encounter.adjustments, list);
		const adversariesWithMarks: EncounterEntry[] = e.adversaries.map((a) => {
			const marks = resizeMarks(encounter.adversaries.find((o) => o.id === a.id)?.hpMarked, a.count);
			return marks ? { ...a, hpMarked: marks } : a;
		});
		const next: Encounter = { ...encounter, ...e, adversaries: adversariesWithMarks };
		await tx.update(scenes).set({ encounter: next }).where(eq(scenes.id, sceneId));
		return { ...next, over: next.spent > next.budget };
	});
}

export async function deleteSceneEncounter(campaignId: string, sceneId: string): Promise<void> {
	const { db } = await sceneRow(campaignId, sceneId);
	await db.update(scenes).set({ encounter: null }).where(eq(scenes.id, sceneId));
}
