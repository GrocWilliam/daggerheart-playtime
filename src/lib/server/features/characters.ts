import { and, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { characters, experiences, items } from '../schema';
import { OBJECT_ERROR, intField, safeIntField, strField } from '../../utils/validation';
import { domainsOfClass, getSrd, idByName } from './srd';

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
	agility: characters.agility,
	strength: characters.strength,
	finesse: characters.finesse,
	instinct: characters.instinct,
	presence: characters.presence,
	knowledge: characters.knowledge,
	primary_weapon: characters.primaryWeapon,
	secondary_weapon: characters.secondaryWeapon,
	armor_id: characters.armorId,
	experiences: sql<unknown>`(SELECT COALESCE(json_agg(json_build_object(
		'id', e.id, 'name', e.name, 'modifier', e.modifier) ORDER BY e.created_at, e.seq), '[]'::json)
		FROM experiences e WHERE e.character_id = ${sql.raw('"characters"."id"')})`.as('experiences'),
	items: sql<unknown>`(SELECT COALESCE(json_agg(json_build_object(
		'id', i.id, 'name', i.name, 'quantity', i.quantity, 'srdId', i.srd_id) ORDER BY i.created_at, i.id), '[]'::json)
		FROM items i WHERE i.character_id = ${sql.raw('"characters"."id"')})`.as('items')
};

/** The characters of a campaign, oldest first, as API JSON. */
export async function campaignCharacters(campaignId: string) {
	const { getDrizzle } = await import('../db');
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
	const { getDrizzle } = await import('../db');
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
			armorId: f.armorId ?? null,
			ancestry: f.ancestry ?? null,
			community: f.community ?? null,
			...f.traits
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
		domains: domainsOfClass(r.class, 'en').map((d) => d.id),
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
		traits: Object.fromEntries(TRAITS.map((k) => [k, r[k] ?? 0])),
		primaryWeapon: r.primary_weapon ?? null,
		secondaryWeapon: r.secondary_weapon ?? null,
		armorId: r.armor_id ?? null,
		experiences: r.experiences ?? [],
		items: r.items ?? [],
		down: r.hp_marked === r.hp_max
	};
}

export const TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const;

/** Optional subset of the six traits; unknown names are rejected, supplied ones kept. */
export const traitsSchema = z
	.looseObject(
		Object.fromEntries(TRAITS.map((k) => [k, intField(k, -5, 5).optional()])) as Record<
			(typeof TRAITS)[number],
			z.ZodOptional<z.ZodNumber>
		>,
		{ error: 'traits must be an object' }
	)
	.superRefine((t, ctx) => {
		const unknown = Object.keys(t).find((k) => !(TRAITS as readonly string[]).includes(k));
		if (unknown !== undefined) ctx.addIssue({ code: 'custom', message: `traits has an unknown trait: ${unknown}` });
	})
	.transform((t) => Object.fromEntries(TRAITS.flatMap((k) => (t[k] === undefined ? [] : [[k, t[k]]]))) as Partial<Record<(typeof TRAITS)[number], number>>);

export const THRESHOLDS_ERROR = 'thresholds must satisfy 1 <= majorThreshold < severeThreshold <= 100';
export const thresholdsOk = (major: number, severe: number) => major >= 1 && major < severe && severe <= 100;

type SrdKind = 'subclasses' | 'ancestries' | 'communities';

/** An SRD id of `kind`, or null. */
function srdId(field: string, kind: SrdKind) {
	return z.custom<string | null>((v) => v === null || (typeof v === 'string' && !!getSrd(kind, v, 'en')), {
		error: `${field} must be an SRD ${kind} id or null`
	});
}

/** Tier of a character level: 1, 2-4, 5-7 and 8-10 map to tiers 1 to 4. */
export function tierOfLevel(level: number) {
	return level <= 1 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4;
}

const PRIMARY_TYPES = ['PRIMARY_PHYSICAL', 'PRIMARY_MAGIC'];

function gearField(error: string, ok: (e: Record<string, any>) => boolean) {
	return z.custom<string | null>(
		(v) => {
			if (v === null) return true;
			const e = typeof v === 'string' ? getSrd('weapons', v, 'en') ?? getSrd('armors', v, 'en') : null;
			return !!e && ok(e);
		},
		{ error }
	);
}
const isWeapon = (types: string[]) => (e: Record<string, any>) => types.includes(e.type);

export const createFields = z.object(
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
			community: srdId('community', 'communities').optional(),
			traits: traitsSchema.optional(),
			armorId: gearField('armorId must be an armor', (e) => e.baseScore !== undefined).optional()
		},
		{ error: OBJECT_ERROR }
);
export const createSchema = createFields.superRefine((f, ctx) => {
	const issue = gearTierIssue('armorId', 'armors', f.armorId, f.level);
	if (issue) return void ctx.addIssue({ code: 'custom', message: issue });
	if (!thresholdsOk(f.majorThreshold, f.severeThreshold)) ctx.addIssue({ code: 'custom', message: THRESHOLDS_ERROR });
});
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
		community: srdId('community', 'communities').optional(),
		traits: traitsSchema.optional(),
		primaryWeapon: gearField('primaryWeapon must be a primary weapon', isWeapon(PRIMARY_TYPES)).optional(),
		secondaryWeapon: gearField('secondaryWeapon must be a secondary weapon', isWeapon(['SECONDARY'])).optional(),
		armorId: gearField('armorId must be an armor', (e) => e.baseScore !== undefined).optional()
	},
	{ error: OBJECT_ERROR }
);

/** Armor thresholds plus the level, as set by equipping the armor; unarmored (null) gives level-based ones. */
export function armorStats(armorId: string | null, level: number) {
	const a = armorId ? getSrd('armors', armorId, 'en') : null;
	if (!a) return { armorMax: 0, majorThreshold: level, severeThreshold: 2 * level };
	return {
		armorMax: a.baseScore as number,
		majorThreshold: (a.baseMajorThreshold as number) + level,
		severeThreshold: (a.baseSevereThreshold as number) + level
	};
}

const FEATURE_EVASION: Record<string, number> = { Flexible: 1, Heavy: -1, 'Very Heavy': -2, Difficult: -1 };

/** Evasion modifier of an armor, from its features matched by English name. */
export function armorEvasionModifier(armorId: string | null) {
	const a = armorId ? getSrd('armors', armorId, 'en') : null;
	let sum = 0;
	for (const f of (a?.features as any[] | undefined) ?? []) sum += FEATURE_EVASION[f?.name?.['en-US']] ?? 0;
	return sum;
}

export const TRAIT_ARRAY = [2, 1, 1, 0, 0, -1] as const;
export function traitsFollowArray(values: number[]) {
	const a = [...values].sort((x, y) => x - y);
	const b = [...TRAIT_ARRAY].sort((x, y) => x - y);
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

export const MAX_STRESS = 6;

/** Starting Evasion and HP of an SRD class by English name; null when unknown. */
export function classStart(className: string) {
	const id = idByName('classes', className);
	const c = id ? getSrd('classes', id, 'en') : null;
	if (!c) return null;
	return { evasion: c.startingEvasion as number, hp: c.startingHitPoints as number };
}

export function derivedStats(className: string, level: number, armorId: string | null) {
	const start = classStart(className);
	if (!start) return null;
	const armor = armorStats(armorId, level);
	return {
		evasion: Math.min(30, Math.max(0, start.evasion + armorEvasionModifier(armorId))),
		majorThreshold: armor.majorThreshold,
		severeThreshold: armor.severeThreshold,
		maxHp: start.hp,
		maxStress: MAX_STRESS,
		armorSlots: armor.armorMax
	};
}

/** Message when the gear's tier is above the character's tier at this level; null when fine. */
export function gearTierIssue(field: string, kind: 'weapons' | 'armors', id: string | null | undefined, level: number) {
	const tier = tierOfLevel(level);
	const gearTier = id ? (getSrd(kind, id, 'en')?.tier as number) : 0;
	return gearTier > tier ? `${field} is tier ${gearTier}, above the character's tier ${tier}` : null;
}

/** PATCH body schema; returns only supplied fields. `current` supplies the other threshold and the class. */
export function patchSchema(current: {
	majorThreshold: number;
	severeThreshold: number;
	class?: string;
	level?: number;
	primaryWeapon?: string | null;
	secondaryWeapon?: string | null;
}) {
	return patchFields.superRefine((p, ctx) => {
		if (p.subclass) {
			const cls = (p.class ?? current.class ?? '').toUpperCase();
			if (getSrd('subclasses', p.subclass, 'en')?.class !== cls) {
				ctx.addIssue({ code: 'custom', message: "subclass must belong to the character's class" });
				return;
			}
		}
		const level = p.level ?? current.level ?? 1;
		for (const [field, kind] of [['primaryWeapon', 'weapons'], ['secondaryWeapon', 'weapons'], ['armorId', 'armors']] as const) {
			const issue = gearTierIssue(field, kind, p[field], level);
			if (issue) {
				ctx.addIssue({ code: 'custom', message: issue });
				return;
			}
		}
		const primary = p.primaryWeapon !== undefined ? p.primaryWeapon : (current.primaryWeapon ?? null);
		const secondary = p.secondaryWeapon !== undefined ? p.secondaryWeapon : (current.secondaryWeapon ?? null);
		if (primary && secondary && getSrd('weapons', primary, 'en')?.burden === 'TWO_HANDED') {
			ctx.addIssue({ code: 'custom', message: 'a two-handed primary weapon leaves no hand for a secondary weapon' });
			return;
		}
		const auto = p.armorId ? armorStats(p.armorId, level) : null;
		const major = p.majorThreshold ?? auto?.majorThreshold;
		const severe = p.severeThreshold ?? auto?.severeThreshold;
		if (p.majorThreshold !== undefined || p.severeThreshold !== undefined) {
			const ok = thresholdsOk(major ?? current.majorThreshold, severe ?? current.severeThreshold);
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

export const MAX_EXPERIENCES = 10;

const modifierField = intField('modifier', 1, 5);

export const experienceSchema = z.object(
	{ name: strField('name', 1, 100), modifier: modifierField },
	{ error: OBJECT_ERROR }
);
export type ExperienceCreate = z.infer<typeof experienceSchema>;

export const patchExperienceSchema = z.object(
	{ name: strField('name', 1, 100).optional(), modifier: modifierField.optional() },
	{ error: OBJECT_ERROR }
);
export type ExperiencePatch = z.infer<typeof patchExperienceSchema>;

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
	const { getDrizzle } = await import('../db');
	return getDrizzle();
}

const jsonOf = (rows: any[]) => (rows[0] ? characterJson(rows[0]) : undefined);

/** The character as API JSON, or undefined when it does not exist. */
export async function getCharacter(id: string) {
	const db = await conn();
	return jsonOf(await db.select(characterSelect).from(characters).where(eq(characters.id, id)));
}

export type CharacterJson = NonNullable<ReturnType<typeof characterJson>>;

const clampEvasion = (n: number) => Math.min(30, Math.max(0, n));

/** Thresholds, Evasion and armor slots that follow from an armor or level change (pure). Explicit fields are merged by the caller. */
export function recomputeOnPatch(
	cur: CharacterJson,
	p: PatchCharacter
): Partial<{ majorThreshold: number; severeThreshold: number; evasion: number; armorSlots: number }> {
	const level = p.level ?? cur.level;
	if (typeof p.armorId === 'string') {
		const a = armorStats(p.armorId, level);
		return {
			majorThreshold: a.majorThreshold,
			severeThreshold: a.severeThreshold,
			armorSlots: a.armorMax,
			evasion: clampEvasion(cur.evasion + armorEvasionModifier(p.armorId) - armorEvasionModifier(cur.armorId))
		};
	}
	if (p.armorId === null) {
		if (!cur.armorId) return {};
		return {
			majorThreshold: level,
			severeThreshold: 2 * level,
			armorSlots: 0,
			evasion: clampEvasion(cur.evasion - armorEvasionModifier(cur.armorId))
		};
	}
	if (p.level !== undefined && p.level !== cur.level) {
		if (cur.armorId) {
			const a = armorStats(cur.armorId, p.level);
			return { majorThreshold: a.majorThreshold, severeThreshold: a.severeThreshold };
		}
		if (cur.majorThreshold === cur.level && cur.severeThreshold === 2 * cur.level)
			return { majorThreshold: p.level, severeThreshold: 2 * p.level };
	}
	return {};
}

/** Applies the supplied PATCH fields; lowering a max also lowers the marked value. Undefined when not found. */
export async function patchCharacter(id: string, p: PatchCharacter, current?: CharacterJson) {
	const cur = current ?? (await getCharacter(id));
	if (!cur) return undefined;
	const r = recomputeOnPatch(cur, p);
	const q: PatchCharacter = {
		...p,
		majorThreshold: p.majorThreshold ?? r.majorThreshold,
		severeThreshold: p.severeThreshold ?? r.severeThreshold,
		evasion: p.evasion ?? r.evasion,
		armorSlots: p.armorSlots ?? r.armorSlots
	};
	p = q;
	const set: Record<string, unknown> = {};
	const plain = ['name', 'class', 'level', 'evasion', 'majorThreshold', 'severeThreshold', 'notes', 'subclass', 'ancestry', 'community', 'primaryWeapon', 'secondaryWeapon', 'armorId'] as const;
	for (const k of plain) if (p[k] !== undefined) set[k] = p[k];
	if (p.traits) Object.assign(set, p.traits);
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

const sameName = (characterId: string, name: string) =>
	and(eq(experiences.characterId, characterId), sql`lower(btrim(${experiences.name})) = lower(btrim(${name}::text))`);

export type ExperienceResult =
	| { status: 'ok'; character: ReturnType<typeof characterJson> }
	| { status: 'not-found' }
	| { status: 'full' }
	| { status: 'duplicate' };

/** Adds an experience (at most 10, unique name ignoring case and spaces) under a row lock on the character. */
export async function addExperience(characterId: string, e: ExperienceCreate): Promise<ExperienceResult> {
	const db = await conn();
	return db.transaction(async (tx) => {
		const [cur] = await tx.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).for('update');
		if (!cur) return { status: 'not-found' };
		const existing = await tx.select({ id: experiences.id }).from(experiences).where(eq(experiences.characterId, characterId));
		if (existing.length >= MAX_EXPERIENCES) return { status: 'full' };
		const [dup] = await tx.select({ id: experiences.id }).from(experiences).where(sameName(characterId, e.name));
		if (dup) return { status: 'duplicate' };
		await tx.insert(experiences).values({ characterId, name: e.name, modifier: e.modifier });
		const [row] = await tx.select(characterSelect).from(characters).where(eq(characters.id, characterId));
		return { status: 'ok', character: characterJson(row) };
	});
}

/** Changes an experience of the character. 'not-found' when the character or experience is missing. */
export async function patchExperience(characterId: string, expId: string, p: ExperiencePatch): Promise<ExperienceResult> {
	const db = await conn();
	return db.transaction(async (tx) => {
		const [cur] = await tx.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).for('update');
		if (!cur) return { status: 'not-found' };
		const own = and(eq(experiences.id, expId), eq(experiences.characterId, characterId));
		const [exp] = await tx.select({ id: experiences.id }).from(experiences).where(own);
		if (!exp) return { status: 'not-found' };
		if (p.name !== undefined) {
			const [dup] = await tx
				.select({ id: experiences.id })
				.from(experiences)
				.where(and(sameName(characterId, p.name), sql`${experiences.id} <> ${expId}`));
			if (dup) return { status: 'duplicate' };
		}
		const set: Record<string, unknown> = {};
		if (p.name !== undefined) set.name = p.name;
		if (p.modifier !== undefined) set.modifier = p.modifier;
		if (Object.keys(set).length > 0) await tx.update(experiences).set(set).where(own);
		const [row] = await tx.select(characterSelect).from(characters).where(eq(characters.id, characterId));
		return { status: 'ok', character: characterJson(row) };
	});
}

/** Removes an experience of the character; undefined when the character or experience is missing. */
export async function removeExperience(characterId: string, expId: string) {
	const db = await conn();
	const rows = await db
		.delete(experiences)
		.where(and(eq(experiences.id, expId), eq(experiences.characterId, characterId)))
		.returning({ id: experiences.id });
	return rows.length > 0 ? getCharacter(characterId) : undefined;
}
