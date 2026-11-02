import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import { itemJson, parseItemQuantity } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	const db = await getDb();
	const quantity = parseItemQuantity(body);
	const sql =
		quantity === 0
			? 'DELETE FROM items WHERE id = $1 RETURNING id, name, quantity'
			: 'UPDATE items SET quantity = $2 WHERE id = $1 RETURNING id, name, quantity';
	const { rows } = await db.query(sql, quantity === 0 ? [params.id] : [params.id, quantity]);
	if (!rows[0]) throw new ApiError(404, 'item not found');
	if (quantity === 0) return new Response(null, { status: 204 });
	return json(itemJson(rows[0]));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query('DELETE FROM items WHERE id = $1 RETURNING id', [params.id]);
	if (!rows[0]) throw new ApiError(404, 'item not found');
	return new Response(null, { status: 204 });
});
