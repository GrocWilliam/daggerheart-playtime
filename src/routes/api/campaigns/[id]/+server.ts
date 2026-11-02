import { getDb, type Db } from '$lib/server/db';
import { CHARACTER_COLS, characterJson } from '$lib/server/characters';
import { ApiError, api, detail, json, parseName, readJson } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

async function loadCharacters(db: Db, campaignId: string) {
	const { rows } = await db.query(
		`SELECT ${CHARACTER_COLS} FROM characters WHERE campaign_id = $1 ORDER BY created_at, seq`,
		[campaignId]
	);
	return rows.map(characterJson);
}

export const GET: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query('SELECT id, name, fear FROM campaigns WHERE id = $1', [
		params.id
	]);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return json(detail(rows[0], await loadCharacters(db, params.id)));
});

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const name = parseName(await readJson(request));
	const db = await getDb();
	const { rows } = await db.query(
		'UPDATE campaigns SET name = $1 WHERE id = $2 RETURNING id, name, fear',
		[name, params.id]
	);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return json(detail(rows[0], await loadCharacters(db, params.id)));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query('DELETE FROM campaigns WHERE id = $1 RETURNING id', [
		params.id
	]);
	if (!rows[0]) throw new ApiError(404, "campaign not found");
	return new Response(null, { status: 204 });
});
