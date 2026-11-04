import { eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { campaigns } from '../schema';
import { parse } from '../errors';
import { strField } from '../../utils/validation';

export const MAX_NAME = 100;
export const MAX_FEAR = 12;

export const nameSchema = z.object({ name: strField('name', 1, MAX_NAME) }, { error: 'name must be a string' });
export type Name = z.infer<typeof nameSchema>;

export function clampFear(fear: number, delta: number): number {
	return Math.min(MAX_FEAR, Math.max(0, fear + delta));
}

export function detail(
	row: { id: string; name: string; fear: number },
	characters: unknown[] = []
) {
	return { id: row.id, name: row.name, fear: row.fear, characters };
}

type CampaignRow = { id: string; name: string; fear: number };

const campaignCols = { id: campaigns.id, name: campaigns.name, fear: campaigns.fear };

export async function listCampaigns(): Promise<CampaignRow[]> {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	return db.select(campaignCols).from(campaigns).orderBy(campaigns.createdAt, campaigns.seq);
}

/** Validates the name (throws ApiError 400) and inserts a campaign. */
export async function createCampaign(body: unknown): Promise<CampaignRow> {
	const { name } = parse(nameSchema, body);
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	const [row] = await db.insert(campaigns).values({ name }).returning(campaignCols);
	return row;
}

/** The campaign, or undefined when it does not exist. */
export async function getCampaign(id: string): Promise<CampaignRow | undefined> {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	const [row] = await db.select(campaignCols).from(campaigns).where(eq(campaigns.id, id));
	return row;
}

/** Renames the campaign; undefined when it does not exist. */
export async function renameCampaign(id: string, name: string): Promise<CampaignRow | undefined> {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	const [row] = await db.update(campaigns).set({ name }).where(eq(campaigns.id, id)).returning(campaignCols);
	return row;
}

/** Deletes the campaign; false when it does not exist. */
export async function deleteCampaign(id: string): Promise<boolean> {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	const rows = await db.delete(campaigns).where(eq(campaigns.id, id)).returning({ id: campaigns.id });
	return rows.length > 0;
}

/** Adds `delta` to the fear, clamped to 0..MAX_FEAR in SQL; the new fear, or undefined when not found. */
export async function adjustFear(id: string, delta: number): Promise<number | undefined> {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	const [row] = await db
		.update(campaigns)
		.set({ fear: sql`LEAST(${MAX_FEAR}::int, GREATEST(0, ${campaigns.fear} + ${delta}::bigint))::int` })
		.where(eq(campaigns.id, id))
		.returning({ fear: campaigns.fear });
	return row?.fear;
}
