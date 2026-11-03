import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, characterJson, conditionsSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	const db = await getDb();
	const cur = await db.query(`SELECT ${CHARACTER_COLS} FROM characters WHERE id = $1`, [id]);
	if (!cur.rows[0]) throw new ApiError(404, 'character not found');
	const c = parse(conditionsSchema, body);
	const sets: string[] = [];
	const vals: unknown[] = [];
	for (const [k, v] of Object.entries(c)) {
		vals.push(v);
		sets.push(`${k} = $${vals.length}`);
	}
	if (sets.length === 0) return json(characterJson(cur.rows[0]));
	vals.push(id);
	const { rows } = await db.query(
		`UPDATE characters SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${CHARACTER_COLS}`,
		vals
	);
	return json(characterJson(rows[0]));
});
