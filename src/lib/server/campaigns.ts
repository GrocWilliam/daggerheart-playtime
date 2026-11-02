import { json } from '@sveltejs/kit';

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

export function parseName(body: unknown): string {
	const name = (body as { name?: unknown } | null)?.name;
	if (typeof name !== 'string') throw new ApiError(400, 'name must be a string');
	const trimmed = name.trim();
	if (trimmed.length < 1 || trimmed.length > MAX_NAME) {
		throw new ApiError(400, `name must be 1 to ${MAX_NAME} characters`);
	}
	return trimmed;
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
	const name = parseName(body);
	const { getDb } = await import('./db');
	const db = await getDb();
	const { rows } = await db.query<CampaignRow>(
		'INSERT INTO campaigns (name) VALUES ($1) RETURNING id, name, fear',
		[name]
	);
	return rows[0];
}
