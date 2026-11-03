import { api, parse, readJson } from '$lib/server/campaigns';
import { languageBodySchema } from '$lib/server/language';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ request, cookies }) => {
	const { lang } = parse(languageBodySchema, await readJson(request));
	cookies.set('lang', lang, {
		path: '/',
		maxAge: 31536000,
		sameSite: 'lax',
		httpOnly: false,
		secure: false
	});
	return new Response(null, { status: 204 });
});
