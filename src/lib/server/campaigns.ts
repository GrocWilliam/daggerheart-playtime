import { json } from '@sveltejs/kit';
import * as z from 'zod';

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

/** Validates `body` against `schema`; throws ApiError(400, message of the first issue). */
export function parse<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
	const r = schema.safeParse(body);
	if (!r.success) throw new ApiError(400, r.error.issues[0]?.message ?? 'invalid input');
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

export async function listCampaigns(): Promise<CampaignRow[]> {
	const { getDb } = await import('./db');
	const db = await getDb();
	const { rows } = await db.query<CampaignRow>(
		'SELECT id, name, fear FROM campaigns ORDER BY created_at, seq'
	);
	return rows;
}

/** Validates the name (throws ApiError 400) and inserts a campaign. */
export async function createCampaign(body: unknown): Promise<CampaignRow> {
	const { name } = parse(nameSchema, body);
	const { getDb } = await import('./db');
	const db = await getDb();
	const { rows } = await db.query<CampaignRow>(
		'INSERT INTO campaigns (name) VALUES ($1) RETURNING id, name, fear',
		[name]
	);
	return rows[0];
}
