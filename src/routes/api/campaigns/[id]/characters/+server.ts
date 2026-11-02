import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, characterJson, parseCreate } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const f = parseCreate(await readJson(request));
	const db = await getDb();
	const camp = await db.query('SELECT id FROM campaigns WHERE id = $1', [params.id]);
	if (!camp.rows[0]) throw new ApiError(404, 'campaign not found');
	const { rows } = await db.query(
		`INSERT INTO characters (campaign_id, name, class, level, evasion, major_threshold,
			severe_threshold, hp_max, stress_max, armor_max)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${CHARACTER_COLS}`,
		[params.id, f.name, f.class, f.level, f.evasion, f.majorThreshold, f.severeThreshold,
			f.maxHp, f.maxStress, f.armorSlots]
	);
	return json(characterJson(rows[0]), { status: 201 });
});
