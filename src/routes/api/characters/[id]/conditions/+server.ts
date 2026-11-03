import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { conditionsSchema, getCharacter, setConditions } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	if (!(await getCharacter(id))) throw new ApiError(404, 'character not found');
	const c = parse(conditionsSchema, body);
	const updated = await setConditions(id, c);
	if (!updated) throw new ApiError(404, 'character not found');
	return json(updated);
});
