import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { campaigns } from './schema';

export const MAX_NAME = 100;
export const MAX_FEAR = 12;

/** Thrown to short-circuit a handler with a JSON {"error"} response. */
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export function errorResponse(status: number, message: string): Response {
	return json({ error: message }, { status });
}

/** Wraps a handler so ApiError becomes a {"error": reason} response. */
export function api<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
	return async (...a: A): Promise<Response> => {
		try {
			return await fn(...a);
		} catch (e) {
			if (e instanceof ApiError) return errorResponse(e.status, e.message);
			throw e;
		}
	};
}

/** Trimmed string field; every rejection carries the field's exact legacy message. */
export function strField(field: string, min: number, max: number) {
	const range = { error: `${field} must be ${min} to ${max} characters` };
	return z
		.string({ error: `${field} must be a string` })
		.trim()
		.min(min, range)
		.max(max, range);
}

/** Integer field in [min, max] with one message for every rejection. */
export function intField(field: string, min: number, max: number) {
	const error = `${field} must be an integer from ${min} to ${max}`;
	return z
		.number({ error })
		.refine((n) => Number.isInteger(n) && n >= min && n <= max, { error });
}

/** Safe-integer field with no range (deltas, amounts). */
export function safeIntField(field: string) {
	const error = `${field} must be an integer`;
	return z.number({ error }).refine(Number.isSafeInteger, { error });
}

/** Strict JSON-object body for schemas that reject other shapes. */
export const OBJECT_ERROR = 'body must be a JSON object';

/** A route param (campaign, character, item or card id): any non-empty string without NUL (which SQL rejects). */
export const idSchema = z
	.string({ error: 'invalid id' })
	.min(1, { error: 'invalid id' })
	.refine((s) => !s.includes('\0'), { error: 'invalid id' });

export const nameSchema = z.object({ name: strField('name', 1, MAX_NAME) }, { error: 'name must be a string' });
export type Name = z.infer<typeof nameSchema>;

/** Validates `body` against `schema`; throws ApiError(status (default 400), message of the first issue). */
export function parse<S extends z.ZodType>(schema: S, body: unknown, status = 400): z.output<S> {
	const r = schema.safeParse(body);
	if (!r.success) throw new ApiError(status, r.error.issues[0]?.message ?? 'invalid input');
	return r.data;
}

export function clampFear(fear: number, delta: number): number {
	return Math.min(MAX_FEAR, Math.max(0, fear + delta));
}

export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ApiError(400, 'malformed JSON');
	}
}

export function detail(
	row: { id: string; name: string; fear: number },
	characters: unknown[] = []
) {
	return { id: row.id, name: row.name, fear: row.fear, characters };
}

export { json };

type CampaignRow = { id: string; name: string; fear: number };

const campaignCols = { id: campaigns.id, name: campaigns.name, fear: campaigns.fear };

export async function listCampaigns(): Promise<CampaignRow[]> {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	return db.select(campaignCols).from(campaigns).orderBy(campaigns.createdAt, campaigns.seq);
}

/** Validates the name (throws ApiError 400) and inserts a campaign. */
export async function createCampaign(body: unknown): Promise<CampaignRow> {
	const { name } = parse(nameSchema, body);
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const [row] = await db.insert(campaigns).values({ name }).returning(campaignCols);
	return row;
}

/** The campaign, or undefined when it does not exist. */
export async function getCampaign(id: string): Promise<CampaignRow | undefined> {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const [row] = await db.select(campaignCols).from(campaigns).where(eq(campaigns.id, id));
	return row;
}

/** Renames the campaign; undefined when it does not exist. */
export async function renameCampaign(id: string, name: string): Promise<CampaignRow | undefined> {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const [row] = await db.update(campaigns).set({ name }).where(eq(campaigns.id, id)).returning(campaignCols);
	return row;
}

/** Deletes the campaign; false when it does not exist. */
export async function deleteCampaign(id: string): Promise<boolean> {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const rows = await db.delete(campaigns).where(eq(campaigns.id, id)).returning({ id: campaigns.id });
	return rows.length > 0;
}

/** Adds `delta` to the fear, clamped to 0..MAX_FEAR in SQL; the new fear, or undefined when not found. */
export async function adjustFear(id: string, delta: number): Promise<number | undefined> {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const [row] = await db
		.update(campaigns)
		.set({ fear: sql`LEAST(${MAX_FEAR}::int, GREATEST(0, ${campaigns.fear} + ${delta}::bigint))::int` })
		.where(eq(campaigns.id, id))
		.returning({ fear: campaigns.fear });
	return row?.fear;
}
