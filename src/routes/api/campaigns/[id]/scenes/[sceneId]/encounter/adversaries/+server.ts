import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { addSceneAdversaries } from '$lib/server/features/encounters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await addSceneAdversaries(parse(idSchema, params.id), parse(idSchema, params.sceneId), body), { status: 201 });
});
