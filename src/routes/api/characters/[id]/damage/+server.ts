import { json } from '@sveltejs/kit';
import { ApiError, api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { applyDamage, damageSchema } from '$lib/server/features/characters';
type RequestHandler = import('./$types').RequestHandler;

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { amount, useArmor } = parse(damageSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const r = await applyDamage(id, amount, useArmor);
	if (!r) throw new ApiError(404, 'character not found');
	return json({ hpMarked: r.hpHit, armorUsed: r.armorUsed, character: r.character });
});
