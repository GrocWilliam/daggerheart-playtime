import { getDb } from '$lib/server/db';
import { api, ApiError, MAX_FEAR, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { deltaSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { delta } = parse(deltaSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const db = await getDb();
	const { rows } = await db.query(
		'UPDATE campaigns SET fear = LEAST($3::int, GREATEST(0, fear + $1::bigint))::int WHERE id = $2 RETURNING fear',
		[delta, id, MAX_FEAR]
	);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return json({ fear: rows[0].fear });
});
