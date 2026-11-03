import { json } from '@sveltejs/kit';
import { getDrizzle } from '$lib/server/db';
import { appInfo } from '$lib/server/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	await (await getDrizzle()).select().from(appInfo).limit(1);
	return json({ status: 'ok' });
};
