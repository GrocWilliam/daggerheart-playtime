import { api, ApiError, readJson } from '$lib/server/campaigns';
import { isLang } from '$lib/i18n';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ request, cookies }) => {
	const body = (await readJson(request)) as { lang?: unknown } | null;
	const lang = body?.lang;
	if (!isLang(lang)) throw new ApiError(400, 'lang must be "en" or "fr"');
	cookies.set('lang', lang, {
		path: '/',
		maxAge: 31536000,
		sameSite: 'lax',
		httpOnly: false,
		secure: false
	});
	return new Response(null, { status: 204 });
});
