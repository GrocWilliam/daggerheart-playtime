import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { conditionsSchema, getCharacter, setConditions } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const PUT: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	if (!(await getCharacter(id))) throw new ApiError(404, 'character not found');
	const c = parse(conditionsSchema, body);
	const updated = await setConditions(id, c);
	if (!updated) throw new ApiError(404, 'character not found');
	return json(updated);
});
