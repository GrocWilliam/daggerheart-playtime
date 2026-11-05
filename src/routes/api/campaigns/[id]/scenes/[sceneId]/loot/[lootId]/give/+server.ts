import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { giveLoot } from '$lib/server/features/loot';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const ids = [parse(idSchema, params.id), parse(idSchema, params.sceneId), parse(idSchema, params.lootId)] as const;
	return json(await giveLoot(...ids, await readJson(request)));
});
