import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { adjustGold, goldSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { handfuls } = parse(goldSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const r = await adjustGold(id, handfuls);
	if (r.status === 'not-found') throw new ApiError(404, 'character not found');
	if (r.status === 'insufficient') throw new ApiError(400, 'not enough gold');
	return json(r.character);
});
