import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, TRACKER_SQL, characterJson, deltaSchema, trackerSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const tracker = trackerSchema.safeParse(params.tracker);
	if (!tracker.success) throw new ApiError(404, 'not found');
	const { delta } = parse(deltaSchema, await readJson(request));
	const id = parse(idSchema, params.id);

	const db = await getDb();
	const { rows } = await db.query(
		`UPDATE characters SET ${TRACKER_SQL[tracker.data]} WHERE id = $2 RETURNING ${CHARACTER_COLS}`,
		[delta, id]
	);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	return json(characterJson(rows[0]));
});
