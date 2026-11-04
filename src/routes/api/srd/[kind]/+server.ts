import { json } from '@sveltejs/kit';
import { api, parse } from '$lib/server/errors';
import { listSrd, srdKindSchema } from '$lib/server/features/srd';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async ({ params, locals }) => {
	const kind = parse(srdKindSchema, params.kind, 404);
	return json(listSrd(kind, locals.lang));
});
