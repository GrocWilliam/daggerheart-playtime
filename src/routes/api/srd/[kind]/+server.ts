import { json } from '@sveltejs/kit';
import { errorResponse } from '$lib/server/campaigns';
import { isSrdKind, listSrd } from '$lib/server/srd';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	if (!isSrdKind(params.kind)) return errorResponse(404, 'unknown SRD kind');
	return json(listSrd(params.kind, locals.lang));
};
