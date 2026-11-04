import { and, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { characters, items } from './schema';
import { OBJECT_ERROR, intField, safeIntField, strField } from './campaigns';
import { getSrd } from './srd';

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
		FROM items i WHERE i.character_id = ${sql.raw('"characters"."id"')})`.as('items')
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
			armorMax: f.armorSlots,
			ancestry: f.ancestry ?? null,
			community: f.community ?? null
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
			armorSlots: intField('armorSlots', 0, 12),
			ancestry: srdId('ancestry', 'ancestries').optional(),
			community: srdId('community', 'communities').optional()
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

export const damageSchema = z.object(
	{
		amount: safeIntField('amount'),
		useArmor: z.boolean({ error: 'useArmor must be a boolean' })
	},
	{ error: 'amount must be an integer' }
);
export type Damage = z.infer<typeof damageSchema>;

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

export const cardIdSchema = z.object(
	{
		cardId: z
			.string({ error: 'cardId must be an SRD domain card id' })
			.refine((id) => !!getSrd('domain-cards', id, 'en'), { error: 'cardId must be an SRD domain card id' })
	},
	{ error: OBJECT_ERROR }
);
export type CardId = z.infer<typeof cardIdSchema>;

// ---- Database operations. Each is one atomic statement (or a row-locking transaction). ----

async function conn() {
	const { getDrizzle } = await import('./db');
	return getDrizzle();
}

const jsonOf = (rows: any[]) => (rows[0] ? characterJson(rows[0]) : undefined);

/** The character as API JSON, or undefined when it does not exist. */
export async function getCharacter(id: string) {
	const db = await conn();
	return jsonOf(await db.select(characterSelect).from(characters).where(eq(characters.id, id)));
}

/** Applies the supplied PATCH fields; lowering a max also lowers the marked value. Undefined when not found. */
export async function patchCharacter(id: string, p: PatchCharacter) {
	const set: Record<string, unknown> = {};
	const plain = ['name', 'class', 'level', 'evasion', 'majorThreshold', 'severeThreshold', 'notes', 'subclass', 'ancestry', 'community'] as const;
	for (const k of plain) if (p[k] !== undefined) set[k] = p[k];
	if (p.maxHp !== undefined) {
		set.hpMax = p.maxHp;
		set.hpMarked = sql`LEAST(${characters.hpMarked}, ${p.maxHp}::int)`;
	}
	if (p.maxStress !== undefined) {
		set.stressMax = p.maxStress;
		set.stressMarked = sql`LEAST(${characters.stressMarked}, ${p.maxStress}::int)`;
	}
	if (p.armorSlots !== undefined) {
		set.armorMax = p.armorSlots;
		set.armorMarked = sql`LEAST(${characters.armorMarked}, ${p.armorSlots}::int)`;
	}
	if (Object.keys(set).length === 0) return getCharacter(id);
	const db = await conn();
	return jsonOf(await db.update(characters).set(set).where(eq(characters.id, id)).returning(characterSelect));
}

/** Deletes the character; false when it does not exist. */
export async function deleteCharacter(id: string) {
	const db = await conn();
	const rows = await db.delete(characters).where(eq(characters.id, id)).returning({ id: characters.id });
	return rows.length > 0;
}

/** Adds `delta` to a tracker, clamped, in one UPDATE (SET expressions read the old row). */
export async function adjustTracker(id: string, tracker: Tracker, delta: number) {
	const d = sql`${delta}::bigint`;
	const c = characters;
	const clamp = (cur: unknown, max: unknown) => sql`LEAST(${max}, GREATEST(0, ${cur} + ${d}))::int`;
	let set;
	if (tracker === 'hp') set = { hpMarked: clamp(c.hpMarked, c.hpMax) };
	else if (tracker === 'armor') set = { armorMarked: clamp(c.armorMarked, c.armorMax) };
	else if (tracker === 'hope') set = { hope: clamp(c.hope, sql`6`) };
	else {
		const next = sql`LEAST(${c.stressMax}, GREATEST(0, ${c.stressMarked} + ${d}))`;
		set = {
			stressMarked: sql`${next}::int`,
			// Stress overflowing the track marks HP.
			hpMarked: sql`LEAST(${c.hpMax}, ${c.hpMarked} + CASE WHEN ${d} > 0
				THEN GREATEST(0, ${c.stressMarked} + ${d} - ${c.stressMax}) ELSE 0 END)::int`,
			vulnerable: sql`CASE WHEN ${next} = ${c.stressMax} THEN true
				WHEN ${c.stressMarked} = ${c.stressMax} THEN false ELSE ${c.vulnerable} END`
		};
	}
	const db = await conn();
	return jsonOf(await db.update(characters).set(set).where(eq(c.id, id)).returning(characterSelect));
}

/** Takes a hit (armor absorbs one HP when available and wanted). Undefined when not found. */
export async function applyDamage(id: string, amount: number, useArmor: boolean) {
	const db = await conn();
	return db.transaction(async (tx) => {
		const [cur] = await tx.select().from(characters).where(eq(characters.id, id)).for('update');
		if (!cur) return undefined;
		const armorUsed = useArmor && cur.armorMarked < cur.armorMax;
		const base = amount <= 0 ? 0 : amount < cur.majorThreshold ? 1 : amount < cur.severeThreshold ? 2 : 3;
		const hpHit = Math.max(0, base - (armorUsed ? 1 : 0));
		const [row] = await tx
			.update(characters)
			.set({
				hpMarked: Math.min(cur.hpMax, Math.max(0, cur.hpMarked + hpHit)),
				armorMarked: cur.armorMarked + (armorUsed ? 1 : 0)
			})
			.where(eq(characters.id, id))
			.returning(characterSelect);
		return { hpHit, armorUsed, character: characterJson(row) };
	});
}

/** Adds handfuls (negative to spend), normalised to chests/bags/handfuls. Never goes below zero. */
export async function adjustGold(id: string, handfuls: number) {
	const db = await conn();
	return db.transaction(async (tx) => {
		const [cur] = await tx.select().from(characters).where(eq(characters.id, id)).for('update');
		if (!cur) return { status: 'not-found' as const };
		const total = cur.goldChests * 100 + cur.goldBags * 10 + cur.goldHandfuls + handfuls;
		if (total < 0) return { status: 'insufficient' as const };
		const [row] = await tx
			.update(characters)
			.set({
				goldChests: Math.floor(total / 100),
				goldBags: Math.floor(total / 10) % 10,
				goldHandfuls: total % 10
			})
			.where(eq(characters.id, id))
			.returning(characterSelect);
		return { status: 'ok' as const, character: characterJson(row) };
	});
}

/** Sets the supplied conditions. Undefined when not found. */
export async function setConditions(id: string, c: Conditions) {
	const set = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
	if (Object.keys(set).length === 0) return getCharacter(id);
	const db = await conn();
	return jsonOf(await db.update(characters).set(set).where(eq(characters.id, id)).returning(characterSelect));
}

/** Appends a card unless held (atomic). Undefined when not added: use `getCharacter` to tell why. */
export async function addCard(id: string, cardId: string) {
	const db = await conn();
	const held = sql`jsonb_exists(${characters.cards}, ${cardId}::text)`;
	return jsonOf(
		await db
			.update(characters)
			.set({ cards: sql`${characters.cards} || to_jsonb(${cardId}::text)` })
			.where(and(eq(characters.id, id), sql`NOT ${held}`))
			.returning(characterSelect)
	);
}

/** Removes a held card; false when the character does not hold it. */
export async function removeCard(id: string, cardId: string) {
	const db = await conn();
	const rows = await db
		.update(characters)
		.set({
			cards: sql`COALESCE((SELECT jsonb_agg(e ORDER BY n)
				FROM jsonb_array_elements_text(${characters.cards}) WITH ORDINALITY AS t(e, n)
				WHERE e <> ${cardId}::text), '[]'::jsonb)`
		})
		.where(and(eq(characters.id, id), sql`jsonb_exists(${characters.cards}, ${cardId}::text)`))
		.returning({ id: characters.id });
	return rows.length > 0;
}

const itemCols = { id: items.id, name: items.name, quantity: items.quantity, srd_id: items.srdId };

/** Adds an item, merging by case-insensitive name (atomic upsert). Undefined for an unknown character. */
export async function addItem(characterId: string, it: ItemCreate) {
	const db = await conn();
	if (!(await getCharacter(characterId))) return undefined;
	// The unique index is on lower(btrim(name)), which onConflictDoUpdate cannot target: insert, else merge.
	for (let attempt = 0; attempt < 3; attempt++) {
		const [fresh] = await db
			.insert(items)
			.values({ characterId, name: it.name, quantity: it.quantity, srdId: it.srdId })
			.onConflictDoNothing()
			.returning(itemCols);
		if (fresh) return { item: itemJson(fresh), created: true };
		const [merged] = await db
			.update(items)
			.set({
				quantity: sql`${items.quantity} + ${it.quantity}::int`,
				srdId: sql`COALESCE(${items.srdId}, ${it.srdId}::text)`
			})
			.where(and(eq(items.characterId, characterId), sql`lower(btrim(${items.name})) = lower(btrim(${it.name}::text))`))
			.returning(itemCols);
		if (merged) return { item: itemJson(merged), created: false };
	}
	throw new Error('item upsert contention');
}

/** Sets an item's quantity (0 deletes it). Returns the item JSON, null when deleted, undefined when not found. */
export async function setItemQuantity(id: string, quantity: number) {
	const db = await conn();
	if (quantity === 0) {
		const rows = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
		return rows.length ? null : undefined;
	}
	const [row] = await db.update(items).set({ quantity }).where(eq(items.id, id)).returning(itemCols);
	return row ? itemJson(row) : undefined;
}

/** Deletes an item; false when it does not exist. */
export async function deleteItem(id: string) {
	const db = await conn();
	const rows = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
	return rows.length > 0;
}
