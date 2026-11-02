import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const db = await getDb();
	await db.query('SELECT 1');
	return json({ status: 'ok' });
};
