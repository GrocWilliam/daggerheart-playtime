import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { patchExperience, patchExperienceSchema, removeExperience } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const expId = parse(idSchema, params.expId);
	const p = parse(patchExperienceSchema, await readJson(request));
	const r = await patchExperience(id, expId, p);
	if (r.status === 'not-found') throw new ApiError(404, 'experience not found');
	if (r.status === 'duplicate') throw new ApiError(409, 'experience already exists');
	if (r.status !== 'ok') throw new ApiError(404, 'experience not found');
	return json(r.character);
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	const expId = parse(idSchema, params.expId);
	const c = await removeExperience(id, expId);
	if (!c) throw new ApiError(404, 'experience not found');
	return json(c);
});
