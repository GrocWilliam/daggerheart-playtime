import { json } from '@sveltejs/kit';
import { api, ApiError, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { adjustFear } from '$lib/server/features/campaigns';
import { deltaSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { delta } = parse(deltaSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const fear = await adjustFear(id, delta);
	if (fear === undefined) throw new ApiError(404, 'campaign not found');
	return json({ fear });
});
