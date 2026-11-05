import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { moveScene } from '$lib/server/features/scenes';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await moveScene(parse(idSchema, params.id), parse(idSchema, params.sceneId), body));
});
