import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, characterJson, cardIdSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	const db = await getDb();
	const { cardId } = parse(cardIdSchema, body);
	const id = parse(idSchema, params.id);

	// Atomic append, only when the card is not already held.
	const { rows } = await db.query(
		`UPDATE characters SET cards = cards || to_jsonb($2::text)
		WHERE id = $1 AND NOT cards ? $2::text RETURNING ${CHARACTER_COLS}`,
		[id, cardId]
	);
	if (rows[0]) return json(characterJson(rows[0]), { status: 201 });
	const c = await db.query('SELECT id FROM characters WHERE id = $1', [id]);
	if (!c.rows[0]) throw new ApiError(404, 'character not found');
	throw new ApiError(409, 'card already held');
});
