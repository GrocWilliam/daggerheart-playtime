import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { adjustGold, goldSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { handfuls } = parse(goldSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const r = await adjustGold(id, handfuls);
	if (r.status === 'not-found') throw new ApiError(404, 'character not found');
	if (r.status === 'insufficient') throw new ApiError(400, 'not enough gold');
	return json(r.character);
});
