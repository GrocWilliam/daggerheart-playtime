import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { GOLD_SQL, characterJson, goldSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { handfuls } = parse(goldSchema, await readJson(request));
	const id = parse(idSchema, params.id);

	const db = await getDb();
	const { rows } = await db.query(GOLD_SQL, [handfuls, id]);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	if (Number(rows[0].gold_total) < 0) throw new ApiError(400, 'not enough gold');
	return json(characterJson(rows[0]));
});
