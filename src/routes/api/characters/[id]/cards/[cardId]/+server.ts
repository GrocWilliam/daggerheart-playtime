import { ApiError, api, idSchema, parse } from '$lib/server/campaigns';
import { removeCard } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	const cardId = parse(idSchema, params.cardId);
	if (!(await removeCard(id, cardId))) throw new ApiError(404, 'card not held');
	return new Response(null, { status: 204 });
});
