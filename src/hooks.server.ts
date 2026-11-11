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
	// A plain form post that accepts anything (`*/*`, no enhance header) is a no-JS post: SvelteKit would answer it with
	// a JSON redirect envelope, so ask for HTML to get a real 303.
	if (
		request.method === 'POST' &&
		isForm &&
		!request.headers.has('x-sveltekit-action') &&
		(request.headers.get('accept') ?? '*/*').trim() === '*/*'
	) {
		const headers = new Headers(request.headers);
		headers.set('accept', 'text/html');
		event.request = new Request(request, { headers });
	}
	const lang = resolveLang(event.cookies.get('lang'), request.headers.get('accept-language'));
	event.locals.lang = lang;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en"', `<html lang="${lang}"`)
	});
};
