import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import { itemJson, parseItemCreate } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	const db = await getDb();
	const { name, quantity, srdId } = parseItemCreate(body);
	const c = await db.query('SELECT id FROM characters WHERE id = $1', [params.id]);
	if (!c.rows[0]) throw new ApiError(404, 'character not found');
	// Atomic upsert on the unique (character, lower(trim(name))) index; xmax = 0 only for fresh inserts.
	const { rows } = await db.query(
		`INSERT INTO items (character_id, name, quantity, srd_id) VALUES ($1,$2,$3,$4)
		ON CONFLICT (character_id, lower(btrim(name)))
		DO UPDATE SET quantity = items.quantity + EXCLUDED.quantity,
			srd_id = COALESCE(items.srd_id, EXCLUDED.srd_id)
		RETURNING id, name, quantity, srd_id, (xmax = 0) AS inserted`,
		[params.id, name, quantity, srdId]
	);
	return json(itemJson(rows[0]), { status: rows[0].inserted ? 201 : 200 });
});
