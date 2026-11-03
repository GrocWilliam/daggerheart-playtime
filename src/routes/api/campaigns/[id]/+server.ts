import { campaignCharacters } from '$lib/server/characters';
import {
	ApiError,
	api,
	deleteCampaign,
	detail,
	getCampaign,
	idSchema,
	json,
	nameSchema,
	parse,
	readJson,
	renameCampaign
} from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

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
