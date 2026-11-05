import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { rollSceneLoot } from '$lib/server/features/loot';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await rollSceneLoot(parse(idSchema, params.id), parse(idSchema, params.sceneId), body), { status: 201 });
});
