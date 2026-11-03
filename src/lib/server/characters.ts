import { eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { characters } from './schema';
import { OBJECT_ERROR, intField, safeIntField, strField } from './campaigns';
import { getSrd } from './srd';

const BASE_COLS = `id, campaign_id, name, class, level, evasion, major_threshold,
	severe_threshold, hp_marked, hp_max, stress_marked, stress_max, hope, armor_marked, armor_max,
	vulnerable, restrained, hidden, notes, gold_handfuls, gold_bags, gold_chests,
	subclass, ancestry, community, cards`;

const ITEMS_SUBQUERY = (idRef: string) => `(SELECT COALESCE(json_agg(json_build_object(
	'id', i.id, 'name', i.name, 'quantity', i.quantity, 'srdId', i.srd_id) ORDER BY i.created_at, i.id), '[]'::json)
	FROM items i WHERE i.character_id = ${idRef}) AS items`;

export const CHARACTER_COLS = `${BASE_COLS}, ${ITEMS_SUBQUERY('characters.id')}`;

/** Drizzle select shape giving the snake_case row that `characterJson` reads. */
const characterSelect = {
	id: characters.id,
	campaign_id: characters.campaignId,
	name: characters.name,
	class: characters.class,
	level: characters.level,
	evasion: characters.evasion,
	major_threshold: characters.majorThreshold,
	severe_threshold: characters.severeThreshold,
	hp_marked: characters.hpMarked,
	hp_max: characters.hpMax,
	stress_marked: characters.stressMarked,
	stress_max: characters.stressMax,
	hope: characters.hope,
	armor_marked: characters.armorMarked,
	armor_max: characters.armorMax,
	vulnerable: characters.vulnerable,
	restrained: characters.restrained,
	hidden: characters.hidden,
	notes: characters.notes,
	gold_handfuls: characters.goldHandfuls,
	gold_bags: characters.goldBags,
	gold_chests: characters.goldChests,
	subclass: characters.subclass,
	ancestry: characters.ancestry,
	community: characters.community,
	cards: characters.cards,
	items: sql<unknown>`(SELECT COALESCE(json_agg(json_build_object(
		'id', i.id, 'name', i.name, 'quantity', i.quantity, 'srdId', i.srd_id) ORDER BY i.created_at, i.id), '[]'::json)
		FROM items i WHERE i.character_id = ${characters.id})`.as('items')
};

/** The characters of a campaign, oldest first, as API JSON. */
export async function campaignCharacters(campaignId: string) {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const rows = await db
		.select(characterSelect)
		.from(characters)
		.where(eq(characters.campaignId, campaignId))
		.orderBy(characters.createdAt, characters.seq);
	return rows.map(characterJson);
}

/** Inserts a character into a campaign (which must exist) and returns it as API JSON. */
export async function insertCharacter(campaignId: string, f: CreateCharacter) {
	const { getDrizzle } = await import('./db');
	const db = await getDrizzle();
	const [row] = await db
		.insert(characters)
		.values({
			campaignId,
			name: f.name,
			class: f.class,
			level: f.level,
			evasion: f.evasion,
			majorThreshold: f.majorThreshold,
			severeThreshold: f.severeThreshold,
			hpMax: f.maxHp,
			stressMax: f.maxStress,
			armorMax: f.armorSlots
		})
		.returning(characterSelect);
	return characterJson(row);
}

export function characterJson(r: any) {
	return {
		id: r.id,
		campaignId: r.campaign_id,
		name: r.name,
		class: r.class,
		level: r.level,
		evasion: r.evasion,
		majorThreshold: r.major_threshold,
		severeThreshold: r.severe_threshold,
		hp: { marked: r.hp_marked, max: r.hp_max },
		stress: { marked: r.stress_marked, max: r.stress_max },
		hope: r.hope,
		armor: { marked: r.armor_marked, max: r.armor_max },
		conditions: { vulnerable: r.vulnerable, restrained: r.restrained, hidden: r.hidden },
		notes: r.notes,
		gold: { handfuls: r.gold_handfuls, bags: r.gold_bags, chests: r.gold_chests },
		subclass: r.subclass ?? null,
		ancestry: r.ancestry ?? null,
		community: r.community ?? null,
		cards: r.cards ?? [],
		items: r.items ?? [],
		down: r.hp_marked === r.hp_max
	};
}

const THRESHOLDS_ERROR = 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100';
const thresholdsOk = (major: number, severe: number) => major >= 1 && major < severe && severe <= 100;

type SrdKind = 'subclasses' | 'ancestries' | 'communities';

/** An SRD id of `kind`, or null. */
function srdId(field: string, kind: SrdKind) {
	return z.custom<string | null>((v) => v === null || (typeof v === 'string' && !!getSrd(kind, v, 'en')), {
		error: `${field} must be an SRD ${kind} id or null`
	});
}

export const createSchema = z
	.object(
		{
			name: strField('name', 1, 100),
			class: strField('class', 1, 50),
			level: intField('level', 1, 10).default(1),
			evasion: intField('evasion', 0, 30),
			majorThreshold: intField('majorThreshold', 1, 100),
			severeThreshold: intField('severeThreshold', 1, 100),
			maxHp: intField('maxHp', 1, 12),
			maxStress: intField('maxStress', 1, 12).default(6),
			armorSlots: intField('armorSlots', 0, 12)
		},
		{ error: OBJECT_ERROR }
	)
	.refine((f) => thresholdsOk(f.majorThreshold, f.severeThreshold), { error: THRESHOLDS_ERROR });
export type CreateCharacter = z.infer<typeof createSchema>;

const patchFields = z.object(
	{
		name: strField('name', 1, 100).optional(),
		class: strField('class', 1, 50).optional(),
		level: intField('level', 1, 10).optional(),
		evasion: intField('evasion', 0, 30).optional(),
		majorThreshold: intField('majorThreshold', 1, 100).optional(),
		severeThreshold: intField('severeThreshold', 1, 100).optional(),
		maxHp: intField('maxHp', 1, 12).optional(),
		maxStress: intField('maxStress', 1, 12).optional(),
		armorSlots: intField('armorSlots', 0, 12).optional(),
		notes: z
			.string({ error: 'notes must be a string of up to 5000 characters' })
			.max(5000, { error: 'notes must be a string of up to 5000 characters' })
			.optional(),
		subclass: srdId('subclass', 'subclasses').optional(),
		ancestry: srdId('ancestry', 'ancestries').optional(),
		community: srdId('community', 'communities').optional()
	},
	{ error: OBJECT_ERROR }
);

/** PATCH body schema; returns only supplied fields. `current` supplies the other threshold and the class. */
export function patchSchema(current: { majorThreshold: number; severeThreshold: number; class?: string }) {
	return patchFields.superRefine((p, ctx) => {
		if (p.subclass) {
			const cls = (p.class ?? current.class ?? '').toUpperCase();
			if (getSrd('subclasses', p.subclass, 'en')?.class !== cls) {
				ctx.addIssue({ code: 'custom', message: "subclass must belong to the character's class" });
				return;
			}
		}
		if (p.majorThreshold !== undefined || p.severeThreshold !== undefined) {
			const ok = thresholdsOk(
				p.majorThreshold ?? current.majorThreshold,
				p.severeThreshold ?? current.severeThreshold
			);
			if (!ok) ctx.addIssue({ code: 'custom', message: THRESHOLDS_ERROR });
		}
	});
}
export type PatchCharacter = z.infer<typeof patchFields>;

export const CONDITION_KEYS = ['vulnerable', 'restrained', 'hidden'] as const;

/** Conditions body; keeps only the supplied boolean fields. */
export const conditionsSchema = z.object(
	Object.fromEntries(
		CONDITION_KEYS.map((k) => [k, z.boolean({ error: `${k} must be a boolean` }).optional()])
	) as Record<(typeof CONDITION_KEYS)[number], z.ZodOptional<z.ZodBoolean>>,
	{ error: OBJECT_ERROR }
);
export type Conditions = z.infer<typeof conditionsSchema>;

export const TRACKERS = ['hp', 'stress', 'hope', 'armor'] as const;
/** The `[tracker]` route param. */
export const trackerSchema = z.enum(TRACKERS, { error: 'not found' });
/** The `tracker` form field of the pages (400 with the form's message). */
export const trackerFieldSchema = z.enum(TRACKERS, { error: 'unknown tracker' });
/** The `condition` form field of the pages. */
export const conditionFieldSchema = z.enum(CONDITION_KEYS, { error: 'unknown condition' });
export type Tracker = z.infer<typeof trackerSchema>;

export const deltaSchema = z.object({ delta: safeIntField('delta') }, { error: 'delta must be an integer' });
export type Delta = z.infer<typeof deltaSchema>;

// Single atomic UPDATE per tracker ($1 = delta, $2 = id); SET expressions read the old row.
const NEW_STRESS = 'LEAST(stress_max, GREATEST(0, stress_marked + $1::bigint))';
export const TRACKER_SQL: Record<Tracker, string> = {
	hp: 'hp_marked = LEAST(hp_max, GREATEST(0, hp_marked + $1::bigint))::int',
	hope: 'hope = LEAST(6, GREATEST(0, hope + $1::bigint))::int',
	armor: 'armor_marked = LEAST(armor_max, GREATEST(0, armor_marked + $1::bigint))::int',
	stress: `stress_marked = ${NEW_STRESS}::int,
		hp_marked = LEAST(hp_max, hp_marked + CASE WHEN $1::bigint > 0
			THEN GREATEST(0, stress_marked + $1::bigint - stress_max) ELSE 0 END)::int,
		vulnerable = CASE WHEN ${NEW_STRESS} = stress_max THEN true
			WHEN stress_marked = stress_max THEN false ELSE vulnerable END`
};

export const damageSchema = z.object(
	{
		amount: safeIntField('amount'),
		useArmor: z.boolean({ error: 'useArmor must be a boolean' })
	},
	{ error: 'amount must be an integer' }
);
export type Damage = z.infer<typeof damageSchema>;

// Atomic damage: $1 = amount, $2 = useArmor, $3 = id. The CTE locks the row and computes the hit once.
export const DAMAGE_SQL = `
WITH old AS (
	SELECT id, armor_marked < armor_max AND $2::boolean AS armor_used,
		CASE WHEN $1::bigint <= 0 THEN 0
			WHEN $1::bigint < major_threshold THEN 1
			WHEN $1::bigint < severe_threshold THEN 2 ELSE 3 END AS base_hit
	FROM characters WHERE id = $3 FOR UPDATE
), calc AS (
	SELECT id, armor_used, GREATEST(0, base_hit - CASE WHEN armor_used THEN 1 ELSE 0 END) AS hp_hit FROM old
)
UPDATE characters c SET
	hp_marked = LEAST(c.hp_max, GREATEST(0, c.hp_marked + calc.hp_hit))::int,
	armor_marked = c.armor_marked + CASE WHEN calc.armor_used THEN 1 ELSE 0 END
FROM calc WHERE c.id = calc.id
RETURNING ${BASE_COLS.replace(/\b([a-z_]+)\b/g, 'c.$1')}, ${ITEMS_SUBQUERY('c.id')}, calc.hp_hit, calc.armor_used`;

const ITEM_KINDS = ['weapons', 'armors', 'consumables', 'items'] as const;

const SRD_ITEM_ERROR = 'srdId must be an SRD weapon, armor, consumable or item id';

export const itemCreateSchema = z
	.object(
		{
			quantity: intField('quantity', 1, 1_000_000).default(1),
			srdId: z
				.custom<string | null>(
					(v) => v === null || (typeof v === 'string' && ITEM_KINDS.some((k) => getSrd(k, v, 'en'))),
					{ error: SRD_ITEM_ERROR }
				)
				.optional(),
			name: z.unknown().optional()
		},
		{ error: OBJECT_ERROR }
	)
	.transform((b, ctx): { name: string; quantity: number; srdId: string | null } => {
		if (typeof b.srdId === 'string') {
			const found = ITEM_KINDS.map((k) => getSrd(k, b.srdId as string, 'en')).find((e) => e)!;
			return { name: found.nameLocalized, quantity: b.quantity, srdId: found.id };
		}
		const name = strField('name', 1, 100).safeParse(b.name);
		if (!name.success) {
			ctx.issues.push({ code: 'custom', message: name.error.issues[0].message, input: b.name });
			return z.NEVER;
		}
		return { name: name.data, quantity: b.quantity, srdId: null };
	});
export type ItemCreate = z.infer<typeof itemCreateSchema>;

export const itemQuantitySchema = z.object(
	{ quantity: intField('quantity', 0, 1_000_000) },
	{ error: OBJECT_ERROR }
);
export type ItemQuantity = z.infer<typeof itemQuantitySchema>;

export function itemJson(r: any) {
	return { id: r.id, name: r.name, quantity: r.quantity, srdId: r.srd_id ?? null };
}

export const goldSchema = z.object({ handfuls: safeIntField('handfuls') }, { error: 'handfuls must be an integer' });
export type Gold = z.infer<typeof goldSchema>;

// Atomic gold change: $1 = handfuls delta, $2 = id. Locks the row; updates only if the new total is >= 0.
export const GOLD_SQL = `
WITH old AS (
	SELECT id, gold_chests::bigint * 100 + gold_bags::bigint * 10 + gold_handfuls + $1::bigint AS total
	FROM characters WHERE id = $2 FOR UPDATE
), upd AS (
	UPDATE characters c SET
		gold_chests = (old.total / 100)::int,
		gold_bags = ((old.total / 10) % 10)::int,
		gold_handfuls = (old.total % 10)::int
	FROM old WHERE c.id = old.id AND old.total >= 0
	RETURNING ${BASE_COLS.replace(/\b([a-z_]+)\b/g, 'c.$1')}, ${ITEMS_SUBQUERY('c.id')}
)
SELECT old.total AS gold_total, upd.* FROM old LEFT JOIN upd ON true`;

export const cardIdSchema = z.object(
	{
		cardId: z
			.string({ error: 'cardId must be an SRD domain card id' })
			.refine((id) => !!getSrd('domain-cards', id, 'en'), { error: 'cardId must be an SRD domain card id' })
	},
	{ error: OBJECT_ERROR }
);
export type CardId = z.infer<typeof cardIdSchema>;
