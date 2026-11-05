import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { addScene, listScenes } from '$lib/server/features/scenes';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async ({ params }) => json(await listScenes(parse(idSchema, params.id))));

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await addScene(parse(idSchema, params.id), body), { status: 201 });
});
