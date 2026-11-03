import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, parse } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	const cardId = parse(idSchema, params.cardId);
	const db = await getDb();
	const { rows } = await db.query(
		`UPDATE characters SET cards = COALESCE((SELECT jsonb_agg(e ORDER BY n)
			FROM jsonb_array_elements_text(cards) WITH ORDINALITY AS t(e, n) WHERE e <> $2::text), '[]'::jsonb)
		WHERE id = $1 AND cards ? $2::text RETURNING id`,
		[id, cardId]
	);
	if (!rows[0]) throw new ApiError(404, 'card not held');
	return new Response(null, { status: 204 });
});
