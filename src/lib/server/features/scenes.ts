import { and, asc, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { campaigns, scenes } from '../schema';
import { ApiError, parse } from '../errors';
import { strField } from '../../utils/validation';
import { getSrd } from './srd';

export const SCENE_STATUSES = ['planned', 'current', 'done'] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];

const ENV_ERROR = 'environmentId must be an environment';

const title = strField('title', 1, 100);
const notes = z
	.string({ error: 'notes must be a string' })
	.max(5000, { error: 'notes must be at most 5000 characters' });
const environmentId = z
	.string({ error: ENV_ERROR })
	.refine((id) => id.startsWith('env_') && getSrd('environments', id, 'en') !== null, { error: ENV_ERROR })
	.nullable();
const status = z.enum(SCENE_STATUSES, { error: 'status must be planned, current or done' });

export const sceneCreateSchema = z.object(
	{ title, notes: notes.default(''), environmentId: environmentId.default(null) },
	{ error: 'body must be a JSON object' }
);
export type SceneCreate = z.infer<typeof sceneCreateSchema>;

export const scenePatchSchema = z.object(
	{ title: title.optional(), notes: notes.optional(), environmentId: environmentId.optional(), status: status.optional() },
	{ error: 'body must be a JSON object' }
);
export type ScenePatch = z.infer<typeof scenePatchSchema>;

/** Move body for a list of `count` scenes. */
export function moveSchema(count: number) {
	const error = `position must be an integer from 0 to ${count - 1}`;
	return z.object(
		{ position: z.number({ error }).refine((n) => Number.isInteger(n) && n >= 0 && n < count, { error }) },
		{ error: 'body must be a JSON object' }
	);
}

export type Scene = {
	id: string;
	title: string;
	notes: string;
	environmentId: string | null;
	status: SceneStatus;
	encounter: unknown;
	loot: unknown[];
};

const cols = {
	id: scenes.id,
	title: scenes.title,
	notes: scenes.notes,
	environmentId: scenes.environmentId,
	status: scenes.status,
	encounter: scenes.encounter,
	loot: scenes.loot
};

async function conn() {
	const { getDrizzle } = await import('../db');
	return getDrizzle();
}

type Db = Awaited<ReturnType<typeof conn>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function toScene(r: Record<keyof typeof cols, unknown>): Scene {
	return { ...r, encounter: r.encounter ?? null, loot: (r.loot as unknown[]) ?? [] } as Scene;
}

/** Locks the campaign row so concurrent scene edits serialise; 404 when absent. */
async function lock(tx: Tx, campaignId: string) {
	const [c] = await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId)).for('update');
	if (!c) throw new ApiError(404, 'campaign not found');
}

const ordered = (tx: Tx, campaignId: string) =>
	tx.select(cols).from(scenes).where(eq(scenes.campaignId, campaignId)).orderBy(asc(scenes.position));

export async function listScenes(campaignId: string): Promise<Scene[]> {
	const db = await conn();
	return db.transaction(async (tx) => {
		const [c] = await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId));
		if (!c) throw new ApiError(404, 'campaign not found');
		return (await ordered(tx, campaignId)).map(toScene);
	});
}

export async function addScene(campaignId: string, body: unknown): Promise<Scene> {
	const f = parse(sceneCreateSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		await lock(tx, campaignId);
		const [{ next }] = await tx
			.select({ next: sql<number>`COALESCE(MAX(${scenes.position}) + 1, 0)::int` })
			.from(scenes)
			.where(eq(scenes.campaignId, campaignId));
		const [row] = await tx.insert(scenes).values({ ...f, campaignId, position: next }).returning(cols);
		return toScene(row);
	});
}

export async function patchScene(campaignId: string, sceneId: string, body: unknown): Promise<Scene> {
	const p = parse(scenePatchSchema, body);
	const db = await conn();
	return db.transaction(async (tx) => {
		await lock(tx, campaignId);
		const own = and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId));
		const [cur] = await tx.select({ id: scenes.id }).from(scenes).where(own);
		if (!cur) throw new ApiError(404, 'scene not found');
		if (p.status === 'current')
			await tx
				.update(scenes)
				.set({ status: 'done' })
				.where(and(eq(scenes.campaignId, campaignId), eq(scenes.status, 'current'), sql`${scenes.id} <> ${sceneId}`));
		const set = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
		if (Object.keys(set).length > 0) await tx.update(scenes).set(set).where(own);
		const [row] = await tx.select(cols).from(scenes).where(own);
		return toScene(row);
	});
}

export async function deleteScene(campaignId: string, sceneId: string): Promise<void> {
	const db = await conn();
	await db.transaction(async (tx) => {
		await lock(tx, campaignId);
		const rows = await tx
			.delete(scenes)
			.where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)))
			.returning({ id: scenes.id });
		if (rows.length === 0) throw new ApiError(404, 'scene not found');
		const rest = await ordered(tx, campaignId);
		for (const [i, s] of rest.entries()) await tx.update(scenes).set({ position: i }).where(eq(scenes.id, s.id));
	});
}

/** Moves a scene to a 0-based position and returns the list in its new order. */
export async function moveScene(campaignId: string, sceneId: string, body: unknown): Promise<Scene[]> {
	const db = await conn();
	return db.transaction(async (tx) => {
		await lock(tx, campaignId);
		const list = await ordered(tx, campaignId);
		const from = list.findIndex((s) => s.id === sceneId);
		if (from < 0) throw new ApiError(404, 'scene not found');
		const { position } = parse(moveSchema(list.length), body);
		const [moved] = list.splice(from, 1);
		list.splice(position, 0, moved);
		for (const [i, s] of list.entries()) await tx.update(scenes).set({ position: i }).where(eq(scenes.id, s.id));
		return list.map(toScene);
	});
}

/** Marks the current scene done and makes the next one by position current; none when it was the last. */
export async function nextScene(campaignId: string): Promise<Scene[]> {
	const db = await conn();
	return db.transaction(async (tx) => {
		await lock(tx, campaignId);
		const list = await ordered(tx, campaignId);
		const i = list.findIndex((s) => s.status === 'current');
		if (i >= 0) {
			await tx.update(scenes).set({ status: 'done' }).where(eq(scenes.id, list[i].id));
			list[i] = { ...list[i], status: 'done' };
			const next = list[i + 1];
			if (next) {
				await tx.update(scenes).set({ status: 'current' }).where(eq(scenes.id, next.id));
				list[i + 1] = { ...next, status: 'current' };
			}
		}
		return list.map(toScene);
	});
}
