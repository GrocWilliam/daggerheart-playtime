import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, TRACKER_SQL, characterJson, parseDelta, type Tracker } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const tracker = params.tracker as Tracker;
	if (!Object.hasOwn(TRACKER_SQL, tracker)) throw new ApiError(404, 'not found');
	const delta = parseDelta(await readJson(request));
	const db = await getDb();
	const { rows } = await db.query(
		`UPDATE characters SET ${TRACKER_SQL[tracker]} WHERE id = $2 RETURNING ${CHARACTER_COLS}`,
		[delta, params.id]
	);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	return json(characterJson(rows[0]));
});
