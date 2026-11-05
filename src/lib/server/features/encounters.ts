import * as z from 'zod';
import { eq } from 'drizzle-orm';
import { characters } from '../schema';
import { intField, OBJECT_ERROR } from '../../utils/validation';

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
	if (adversaries.filter((a) => a.role === 'Solo').length >= 2) {
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
