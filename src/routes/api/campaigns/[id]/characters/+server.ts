import { ApiError, api, getCampaign, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { createSchema, insertCharacter } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const f = parse(createSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	if (!(await getCampaign(id))) throw new ApiError(404, 'campaign not found');
	return json(await insertCharacter(id, f), { status: 201 });
});
