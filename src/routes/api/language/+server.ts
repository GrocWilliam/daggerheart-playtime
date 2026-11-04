import { api, parse, readJson } from '$lib/server/errors';
import { languageBodySchema } from '$lib/server/features/language';
type RequestHandler = import('./$types').RequestHandler;

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
