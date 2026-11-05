import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteSceneEncounter, generateSceneEncounter, patchSceneEncounter } from '$lib/server/features/encounters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await generateSceneEncounter(parse(idSchema, params.id), parse(idSchema, params.sceneId), body));
});

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await patchSceneEncounter(parse(idSchema, params.id), parse(idSchema, params.sceneId), body));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	await deleteSceneEncounter(parse(idSchema, params.id), parse(idSchema, params.sceneId));
	return new Response(null, { status: 204 });
});
