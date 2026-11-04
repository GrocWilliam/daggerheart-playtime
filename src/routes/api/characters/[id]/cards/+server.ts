import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { addCard, cardIdSchema, getCharacter } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	const { cardId } = parse(cardIdSchema, body);
	const id = parse(idSchema, params.id);
	const c = await addCard(id, cardId);
	if (c) return json(c, { status: 201 });
	if (!(await getCharacter(id))) throw new ApiError(404, 'character not found');
	throw new ApiError(409, 'card already held');
});
