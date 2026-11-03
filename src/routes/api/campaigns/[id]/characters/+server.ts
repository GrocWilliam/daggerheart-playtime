import { getDb } from '$lib/server/db';
import { ApiError, api, idSchema, json, parse, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, characterJson, createSchema } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const f = parse(createSchema, await readJson(request));
	const id = parse(idSchema, params.id);
	const db = await getDb();
	const camp = await db.query('SELECT id FROM campaigns WHERE id = $1', [id]);
	if (!camp.rows[0]) throw new ApiError(404, 'campaign not found');
	const { rows } = await db.query(
		`INSERT INTO characters (campaign_id, name, class, level, evasion, major_threshold,
			severe_threshold, hp_max, stress_max, armor_max)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${CHARACTER_COLS}`,
		[id, f.name, f.class, f.level, f.evasion, f.majorThreshold, f.severeThreshold,
			f.maxHp, f.maxStress, f.armorSlots]
	);
	return json(characterJson(rows[0]), { status: 201 });
});
