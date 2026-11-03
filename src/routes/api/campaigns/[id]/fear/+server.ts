import { adjustFear, api, ApiError, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { deltaSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { delta } = parse(deltaSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const fear = await adjustFear(id, delta);
	if (fear === undefined) throw new ApiError(404, 'campaign not found');
	return json({ fear });
});
