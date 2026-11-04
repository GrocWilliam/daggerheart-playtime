import { campaignCharacters } from '$lib/server/features/characters';
import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteCampaign, detail, getCampaign, nameSchema, renameCampaign } from '$lib/server/features/campaigns';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	const row = await getCampaign(id);
	if (!row) throw new ApiError(404, 'campaign not found');
	return json(detail(row, await campaignCharacters(id)));
});

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const { name } = parse(nameSchema, await readJson(request));
	const row = await renameCampaign(id, name);
	if (!row) throw new ApiError(404, 'campaign not found');
	return json(detail(row, await campaignCharacters(id)));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const id = parse(idSchema, params.id);
	if (!(await deleteCampaign(id))) throw new ApiError(404, 'campaign not found');
	return new Response(null, { status: 204 });
});
