import { api, createCampaign, json, listCampaigns, readJson } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async () => json(await listCampaigns()));

export const POST: RequestHandler = api(async ({ request }) =>
	json(await createCampaign(await readJson(request)), { status: 201 })
);
