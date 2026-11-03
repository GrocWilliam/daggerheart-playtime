import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { deleteCharacter, getCharacter, patchCharacter, patchSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async ({ params }) => {
	const c = await getCharacter(parse(idSchema, params.id));
	if (!c) throw new ApiError(404, 'character not found');
	return json(c);
});

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	const cur = await getCharacter(id);
	if (!cur) throw new ApiError(404, 'character not found');
	const p = parse(patchSchema(cur), body);
	const updated = await patchCharacter(id, p);
	if (!updated) throw new ApiError(404, 'character not found');
	return json(updated);
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	if (!(await deleteCharacter(parse(idSchema, params.id)))) throw new ApiError(404, 'character not found');
	return new Response(null, { status: 204 });
});
