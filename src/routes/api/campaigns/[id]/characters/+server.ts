import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { getCampaign } from '$lib/server/features/campaigns';
import { createSchema, insertCharacter } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const f = parse(createSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	if (!(await getCampaign(id))) throw new ApiError(404, 'campaign not found');
	return json(await insertCharacter(id, f), { status: 201 });
});
