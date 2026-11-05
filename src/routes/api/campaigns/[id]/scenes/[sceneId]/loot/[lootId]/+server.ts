import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteLoot, patchLoot } from '$lib/server/features/loot';
type RequestHandler = import('./$types').RequestHandler;

const ids = (p: Record<string, string>) =>
	[parse(idSchema, p.id), parse(idSchema, p.sceneId), parse(idSchema, p.lootId)] as const;

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	return json(await patchLoot(...ids(params), body));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	await deleteLoot(...ids(params));
	return new Response(null, { status: 204 });
});
