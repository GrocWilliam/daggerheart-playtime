import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { addItem, itemCreateSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	const it = parse(itemCreateSchema, body);
	const r = await addItem(id, it);
	if (!r) throw new ApiError(404, 'character not found');
	return json(r.item, { status: r.created ? 201 : 200 });
});
