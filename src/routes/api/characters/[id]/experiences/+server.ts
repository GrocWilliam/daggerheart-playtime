import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { addExperience, experienceSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const e = parse(experienceSchema, await readJson(request));
	const r = await addExperience(id, e);
	if (r.status === 'not-found') throw new ApiError(404, 'character not found');
	if (r.status === 'full') throw new ApiError(400, 'a character has at most 10 experiences');
	if (r.status === 'duplicate') throw new ApiError(409, 'experience already exists');
	return json(r.character, { status: 201 });
});
