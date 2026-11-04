import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { adjustTracker, deltaSchema, trackerSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const tracker = parse(trackerSchema, params.tracker, 404);
	const { delta } = parse(deltaSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const c = await adjustTracker(id, tracker, delta);
	if (!c) throw new ApiError(404, 'character not found');
	return json(c);
});
