import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import { CHARACTER_COLS, characterJson, parsePatch } from '$lib/server/characters';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query(`SELECT ${CHARACTER_COLS} FROM characters WHERE id = $1`, [
		params.id
	]);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	return json(characterJson(rows[0]));
});

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const body = await readJson(request);
	const db = await getDb();
	const cur = await db.query(`SELECT ${CHARACTER_COLS} FROM characters WHERE id = $1`, [params.id]);
	if (!cur.rows[0]) throw new ApiError(404, 'character not found');
	const p = parsePatch(body, {
		majorThreshold: cur.rows[0].major_threshold,
		severeThreshold: cur.rows[0].severe_threshold,
		class: cur.rows[0].class
	});
	const cols: Record<string, [string, unknown]> = {
		name: ['name', p.name],
		class: ['class', p.class],
		level: ['level', p.level],
		evasion: ['evasion', p.evasion],
		majorThreshold: ['major_threshold', p.majorThreshold],
		severeThreshold: ['severe_threshold', p.severeThreshold],
		maxHp: ['hp_max', p.maxHp],
		maxStress: ['stress_max', p.maxStress],
		armorSlots: ['armor_max', p.armorSlots],
		notes: ['notes', p.notes],
		subclass: ['subclass', p.subclass],
		ancestry: ['ancestry', p.ancestry],
		community: ['community', p.community]
	};
	const sets: string[] = [];
	const vals: unknown[] = [];
	// Lowering a max also lowers the matching marked value (SET sees old row values, so reuse the param).
	const marked: Record<string, string> = {
		hp_max: 'hp_marked',
		stress_max: 'stress_marked',
		armor_max: 'armor_marked'
	};
	for (const [col, v] of Object.values(cols)) {
		if (v === undefined) continue;
		vals.push(v);
		sets.push(`${col} = $${vals.length}`);
		if (marked[col]) sets.push(`${marked[col]} = LEAST(${marked[col]}, $${vals.length})`);
	}
	if (sets.length === 0) return json(characterJson(cur.rows[0]));
	vals.push(params.id);
	const { rows } = await db.query(
		`UPDATE characters SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${CHARACTER_COLS}`,
		vals
	);
	return json(characterJson(rows[0]));
});

export const DELETE: RequestHandler = api(async ({ params }) => {
	const db = await getDb();
	const { rows } = await db.query('DELETE FROM characters WHERE id = $1 RETURNING id', [params.id]);
	if (!rows[0]) throw new ApiError(404, 'character not found');
	return new Response(null, { status: 204 });
});
