import { json } from '@sveltejs/kit';
import { getDrizzle } from '$lib/server/db';
import { appInfo } from '$lib/server/schema';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = async () => {
	await (await getDrizzle()).select().from(appInfo).limit(1);
	return json({ status: 'ok' });
};
