import { json } from '@sveltejs/kit';
import { api, parse } from '$lib/server/campaigns';
import { listSrd, srdKindSchema } from '$lib/server/srd';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async ({ params, locals }) => {
	const kind = parse(srdKindSchema, params.kind, 404);
	return json(listSrd(kind, locals.lang));
});
