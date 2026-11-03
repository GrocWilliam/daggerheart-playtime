import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { itemJson, itemQuantitySchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	const db = await getDb();
	const { quantity } = parse(itemQuantitySchema, body);
	const sql =
		quantity === 0
			? 'DELETE FROM items WHERE id = $1 RETURNING id, name, quantity, srd_id'
			: 'UPDATE items SET quantity = $2 WHERE id = $1 RETURNING id, name, quantity, srd_id';
	const { rows } = await db.query(sql, quantity === 0 ? [id] : [id, quantity]);
	if (!rows[0]) throw new ApiError(404, 'item not found');
	if (quantity === 0) return new Response(null, { status: 204 });
	return json(itemJson(rows[0]));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	const db = await getDb();
	const { rows } = await db.query('DELETE FROM items WHERE id = $1 RETURNING id', [id]);
	if (!rows[0]) throw new ApiError(404, 'item not found');
	return new Response(null, { status: 204 });
});
