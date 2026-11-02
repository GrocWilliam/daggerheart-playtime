import { json } from '@sveltejs/kit';
import { errorResponse } from '$lib/server/campaigns';
import { getSrd, isSrdKind } from '$lib/server/srd';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	if (!isSrdKind(params.kind)) return errorResponse(404, 'unknown SRD kind');
	const el = getSrd(params.kind, params.id, locals.lang);
	if (!el) return errorResponse(404, 'unknown SRD element');
	return json(el);
};
