import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteScene, patchScene } from '$lib/server/features/scenes';
type RequestHandler = import('./$types').RequestHandler;

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await patchScene(parse(idSchema, params.id), parse(idSchema, params.sceneId), body));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	await deleteScene(parse(idSchema, params.id), parse(idSchema, params.sceneId));
	return new Response(null, { status: 204 });
});
