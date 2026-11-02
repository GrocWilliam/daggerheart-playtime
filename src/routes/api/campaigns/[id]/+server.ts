import { getDb } from '$lib/server/db';
import { ApiError, api, detail, json, parseName, readJson } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query('SELECT id, name, fear FROM campaigns WHERE id = $1', [
		params.id
	]);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return json(detail(rows[0]));
});

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const name = parseName(await readJson(request));
	const db = await getDb();
	const { rows } = await db.query(
		'UPDATE campaigns SET name = $1 WHERE id = $2 RETURNING id, name, fear',
		[name, params.id]
	);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return json(detail(rows[0]));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query('DELETE FROM campaigns WHERE id = $1 RETURNING id', [
		params.id
	]);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return new Response(null, { status: 204 });
});
