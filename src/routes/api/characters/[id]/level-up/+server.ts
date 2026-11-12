import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { getCharacter } from '$lib/server/features/characters';
import { levelUp, levelUpBodySchema, planLevelUp } from '$lib/server/features/levelup';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async ({ params }) => {
	const c = await getCharacter(parse(idSchema, params.id));
	if (!c) throw new ApiError(404, 'character not found');
	const plan = planLevelUp(c);
	if (typeof plan === 'string') throw new ApiError(400, plan);
	return json(plan);
});

export const POST: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = parse(levelUpBodySchema, await readJson(request));
	const r = await levelUp(id, body);
	if (r.status === 'not-found') throw new ApiError(404, 'character not found');
	if (r.status === 'invalid') throw new ApiError(400, r.error);
	return json({ character: r.character });
});
