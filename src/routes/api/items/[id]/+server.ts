import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteItem, itemQuantitySchema, setItemQuantity } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id);
	const body = await readJson(request);
	const { quantity } = parse(itemQuantitySchema, body);
	const r = await setItemQuantity(id, quantity);
	if (r === undefined) throw new ApiError(404, 'item not found');
	if (r === null) return new Response(null, { status: 204 });
	return json(r);
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	if (!(await deleteItem(parse(idSchema, params.id)))) throw new ApiError(404, 'item not found');
	return new Response(null, { status: 204 });
});
