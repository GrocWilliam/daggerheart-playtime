import { getDb } from '$lib/server/db';
import { api, ApiError, MAX_FEAR, json, readJson } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = (await readJson(request)) as { delta?: unknown } | null;
	const delta = body?.delta;
	if (typeof delta !== 'number' || !Number.isSafeInteger(delta)) {
		throw new ApiError(400, 'delta must be an integer');
	}
	const db = await getDb();
	const { rows } = await db.query(
		'UPDATE campaigns SET fear = LEAST($3::int, GREATEST(0, fear + $1::bigint))::int WHERE id = $2 RETURNING fear',
		[delta, params.id, MAX_FEAR]
	);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return json({ fear: rows[0].fear });
});
