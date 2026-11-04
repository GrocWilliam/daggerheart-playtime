import { ApiError, api, parse } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { removeCard } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const DELETE: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	const cardId = parse(idSchema, params.cardId);
	if (!(await removeCard(id, cardId))) throw new ApiError(404, 'card not held');
	return new Response(null, { status: 204 });
});
