import * as z from 'zod';
import { and, eq } from 'drizzle-orm';
import { characters, scenes } from '../schema';
import { ApiError, parse } from '../errors';
import { intField, OBJECT_ERROR } from '../../utils/validation';
import { seededRandom } from '../../utils/prng';
import { adversariesByTier } from './srd';

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
export type EncounterEntry = PoolAdversary & { count: number; cost: number };
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

/** Generates and stores (replacing any previous) the scene's encounter. */
export async function generateSceneEncounter(campaignId: string, sceneId: string, body: unknown): Promise<Encounter> {
	const f = parse(generateRequestSchema, body);
	const { db } = await sceneRow(campaignId, sceneId);
	const defaults = await campaignPartyDefaults(campaignId);
	const partySize = f.partySize ?? defaults.partySize;
	const tier = f.tier ?? defaults.tier;
	const pool = adversariesByTier(tier, 'en').map(({ id, name, role }) => ({ id, name, role }));
	const enc = generateEncounter({ partySize, tier, adjustments: f.adjustments, seed: f.seed }, pool);
	await db.update(scenes).set({ encounter: enc }).where(eq(scenes.id, sceneId));
	return enc;
}

/** Replaces the adversaries of the stored encounter; recomputes budget and spent. */
export async function patchSceneEncounter(campaignId: string, sceneId: string, body: unknown) {
	const { adversaries } = parse(countsSchema, body);
	const { db, encounter } = await sceneRow(campaignId, sceneId);
	if (!encounter) throw new ApiError(404, 'encounter not found');
	const all = new Map(adversariesByTier(undefined, 'en').map((a) => [a.id, a]));
	const merged = new Map<string, number>();
	for (const a of adversaries) {
		if (!all.has(a.id)) throw new ApiError(400, `adversaries contains an unknown adversary: ${a.id}`);
		merged.set(a.id, (merged.get(a.id) ?? 0) + a.count);
	}
	const list = [...merged].map(([id, count]) => ({ id, name: all.get(id)!.name, role: all.get(id)!.role, count }));
	const e = evaluate(encounter.partySize, encounter.adjustments, list);
	const next: Encounter = { ...encounter, ...e };
	await db.update(scenes).set({ encounter: next }).where(eq(scenes.id, sceneId));
	return { ...next, over: next.spent > next.budget };
}

export async function deleteSceneEncounter(campaignId: string, sceneId: string): Promise<void> {
	const { db } = await sceneRow(campaignId, sceneId);
	await db.update(scenes).set({ encounter: null }).where(eq(scenes.id, sceneId));
}
