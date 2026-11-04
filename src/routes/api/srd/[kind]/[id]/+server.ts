import { json } from '@sveltejs/kit';
import { api, errorResponse, parse } from '$lib/server/errors';
import { getSrd, srdIdSchema, srdKindSchema } from '$lib/server/features/srd';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async ({ params, locals }) => {
	const kind = parse(srdKindSchema, params.kind, 404);
	const id = parse(srdIdSchema, params.id, 404);
	const el = getSrd(kind, id, locals.lang);
	if (!el) return errorResponse(404, 'unknown SRD element');
	return json(el);
});
