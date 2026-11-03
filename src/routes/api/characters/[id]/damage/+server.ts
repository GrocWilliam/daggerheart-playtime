import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { applyDamage, damageSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { amount, useArmor } = parse(damageSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const r = await applyDamage(id, amount, useArmor);
	if (!r) throw new ApiError(404, 'character not found');
	return json({ hpMarked: r.hpHit, armorUsed: r.armorUsed, character: r.character });
});
