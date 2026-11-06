import { json } from '@sveltejs/kit';
import { api, parse } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { nextScene } from '$lib/server/features/scenes';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params }) => json(await nextScene(parse(idSchema, params.id))));
