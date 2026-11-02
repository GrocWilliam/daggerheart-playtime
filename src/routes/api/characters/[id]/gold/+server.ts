import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import { GOLD_SQL, characterJson, parseGold } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const handfuls = parseGold(await readJson(request));
	const db = await getDb();
	const { rows } = await db.query(GOLD_SQL, [handfuls, params.id]);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	if (Number(rows[0].gold_total) < 0) throw new ApiError(400, 'not enough gold');
	return json(characterJson(rows[0]));
});
