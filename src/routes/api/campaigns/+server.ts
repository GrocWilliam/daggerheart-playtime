import { json } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/errors';
import { createCampaign, listCampaigns } from '$lib/server/features/campaigns';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async () => json(await listCampaigns()));

export const POST: RequestHandler = api(async ({ request }) =>
	json(await createCampaign(await readJson(request)), { status: 201 })
);
