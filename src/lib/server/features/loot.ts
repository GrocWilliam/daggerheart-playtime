import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import { campaigns, characters, scenes } from '../schema';
import { ApiError, parse } from '../errors';
import { seededRandom } from '../../utils/prng';
import { listSrd } from './srd';
import { addItem, getCharacter, itemCreateSchema } from './characters';
import { idSchema, OBJECT_ERROR } from '../../utils/validation';

export const LOOT_TABLES = ['items', 'consumables'] as const;
export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type LootTable = (typeof LOOT_TABLES)[number];
export type Rarity = (typeof RARITIES)[number];

const COUNT_ERROR = 'count must be an integer from 1 to 10';

export const lootRollSchema = z.object(
	{
		table: z.enum(LOOT_TABLES, { error: 'table must be items or consumables' }),
		rarity: z.enum(RARITIES, { error: 'rarity must be common, uncommon, rare or legendary' }),
		count: z
			.number({ error: COUNT_ERROR })
			.refine((n) => Number.isInteger(n) && n >= 1 && n <= 10, { error: COUNT_ERROR })
			.default(1),
		seed: z
			.number({ error: 'seed must be an integer' })
			.refine((n) => Number.isSafeInteger(n), { error: 'seed must be an integer' })
			.optional()
	},
	{ error: 'body must be a JSON object' }
);

export const lootPatchSchema = z.object(
	{ given: z.boolean({ error: 'given must be true or false' }) },
	{ error: 'body must be a JSON object' }
);

export type LootEntry = {
	id: string;
	table: LootTable;
	rarity: Rarity;
	roll: number;
	srdId: string;
	name: string;
	given: boolean;
};

const DICE: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, legendary: 4 };

/** Sum of the rarity's d12s (1d12 … 4d12). */
export function rollDice(rarity: Rarity, random: () => number): number {
	let sum = 0;
	for (let i = 0; i < DICE[rarity]; i++) sum += 1 + Math.floor(random() * 12);
	return sum;
}

/** Rolls `count` entries; the same seed gives the same rolls. */
export function rollLoot(table: LootTable, rarity: Rarity, count: number, seed?: number): Omit<LootEntry, 'id'>[] {
	const random = seededRandom(seed ?? Math.floor(Math.random() * 2 ** 32));
	const entries = listSrd(table, 'en');
	return Array.from({ length: count }, () => {
		const roll = rollDice(rarity, random);
		const e = entries[roll - 1];
		return { table, rarity, roll, srdId: e.id, name: e.name, given: false };
	});
}

async function conn() {
	const { getDrizzle } = await import('../db');
	return getDrizzle();
}
type Db = Awaited<ReturnType<typeof conn>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Locks the scene row and returns its loot; 404 when campaign or scene is absent. */
async function lockLoot(tx: Tx, campaignId: string, sceneId: string): Promise<LootEntry[]> {
	const [c] = await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId));
	if (!c) throw new ApiError(404, 'campaign not found');
	const [s] = await tx
		.select({ loot: scenes.loot })
		.from(scenes)
		.where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)))
		.for('update');
	if (!s) throw new ApiError(404, 'scene not found');
	return (s.loot as LootEntry[]) ?? [];
}

const save = (tx: Tx, sceneId: string, loot: LootEntry[]) =>
	tx.update(scenes).set({ loot }).where(eq(scenes.id, sceneId));

export async function rollSceneLoot(campaignId: string, sceneId: string, body: unknown): Promise<LootEntry[]> {
	const f = parse(lootRollSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		const loot = await lockLoot(tx, campaignId, sceneId);
		const made = rollLoot(f.table, f.rarity, f.count, f.seed).map((e) => ({ id: crypto.randomUUID(), ...e }));
		await save(tx, sceneId, [...loot, ...made]);
		return made;
	});
}

export async function patchLoot(campaignId: string, sceneId: string, lootId: string, body: unknown): Promise<LootEntry> {
	const p = parse(lootPatchSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		const loot = await lockLoot(tx, campaignId, sceneId);
		const e = loot.find((l) => l.id === lootId);
		if (!e) throw new ApiError(404, 'loot not found');
		e.given = p.given;
		await save(tx, sceneId, loot);
		return e;
	});
}

export async function deleteLoot(campaignId: string, sceneId: string, lootId: string): Promise<void> {
	const db = await conn();
	await db.transaction(async (tx) => {
		const loot = await lockLoot(tx, campaignId, sceneId);
		if (!loot.some((l) => l.id === lootId)) throw new ApiError(404, 'loot not found');
		await save(tx, sceneId, loot.filter((l) => l.id !== lootId));
	});
}

export const lootGiveSchema = z.object({ characterId: idSchema }, { error: OBJECT_ERROR });

/** Adds the loot item to the character's inventory, marks the entry given and returns the character. */
export async function giveLoot(campaignId: string, sceneId: string, lootId: string, body: unknown) {
	const { characterId } = parse(lootGiveSchema, body);
	const db = await conn();
	const entry = await db.transaction(async (tx) => {
		const loot = await lockLoot(tx, campaignId, sceneId);
		const e = loot.find((l) => l.id === lootId);
		if (!e) throw new ApiError(404, 'loot not found');
		return e;
	});
	const [c] = await db.select({ campaignId: characters.campaignId }).from(characters).where(eq(characters.id, characterId));
	if (!c) throw new ApiError(404, 'character not found');
	if (c.campaignId !== campaignId) throw new ApiError(400, 'character is not in this campaign');
	await addItem(characterId, parse(itemCreateSchema, { srdId: entry.srdId }));
	await db.transaction(async (tx) => {
		const loot = await lockLoot(tx, campaignId, sceneId);
		const e = loot.find((l) => l.id === lootId);
		if (e) {
			e.given = true;
			await save(tx, sceneId, loot);
		}
	});
	return (await getCharacter(characterId))!;
}
