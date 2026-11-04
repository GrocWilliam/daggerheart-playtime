import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteCharacter, getCharacter, patchCharacter, patchSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

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
