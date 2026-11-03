import type { Handle } from '@sveltejs/kit';
import { resolveLang } from '$lib/i18n';
import { getDrizzle } from '$lib/server/db';

// Kick off the DB connection (and its migrations) as soon as the server
// process starts, so they're underway before the first request arrives.
getDrizzle().catch((err) => {
	console.error('database initialization failed', err);
});

/** Rejects cross-site form posts: the Origin host must match the Host header. */
export const handle: Handle = async ({ event, resolve }) => {
	const { request } = event;
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	const isForm =
		type === 'application/x-www-form-urlencoded' ||
		type === 'multipart/form-data' ||
		type === 'text/plain';
	if (isForm && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
		const origin = request.headers.get('origin');
		let host: string | null = null;
		try {
			host = origin ? new URL(origin).host : null;
		} catch {
			/* invalid origin */
		}
		if (!host || host !== event.url.host) {
			return new Response('Cross-site form submissions are forbidden', { status: 403 });
		}
	}
	const lang = resolveLang(event.cookies.get('lang'), request.headers.get('accept-language'));
	event.locals.lang = lang;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en"', `<html lang="${lang}"`)
	});
};
