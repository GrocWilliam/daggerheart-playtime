import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { DAMAGE_SQL, characterJson, damageSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { amount, useArmor } = parse(damageSchema, await readJson(request));
	const id = parse(idSchema, params.id);

	const db = await getDb();
	const { rows } = await db.query(DAMAGE_SQL, [amount, useArmor, id]);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	return json({
		hpMarked: Number(rows[0].hp_hit),
		armorUsed: rows[0].armor_used,
		character: characterJson(rows[0])
	});
});
