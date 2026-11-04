import { json } from '@sveltejs/kit';
import type * as z from 'zod';

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

/** Validates `body` against `schema`; throws ApiError(status (default 400), message of the first issue). */
export function parse<S extends z.ZodType>(schema: S, body: unknown, status = 400): z.output<S> {
	const r = schema.safeParse(body);
	if (!r.success) throw new ApiError(status, r.error.issues[0]?.message ?? 'invalid input');
	return r.data;
}

export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ApiError(400, 'malformed JSON');
	}
}
