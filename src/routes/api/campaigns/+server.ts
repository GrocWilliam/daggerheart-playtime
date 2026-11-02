import { getDb } from '$lib/server/db';
import { api, json, parseName, readJson } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async () => {
	const db = await getDb();
	const { rows } = await db.query(
		'SELECT id, name, fear FROM campaigns ORDER BY created_at, seq'
	);
	return json(rows);
});

export const POST: RequestHandler = api(async ({ request }) => {
	const name = parseName(await readJson(request));
	const db = await getDb();
	const { rows } = await db.query(
		'INSERT INTO campaigns (name) VALUES ($1) RETURNING id, name, fear',
		[name]
	);
	return json(rows[0], { status: 201 });
});
