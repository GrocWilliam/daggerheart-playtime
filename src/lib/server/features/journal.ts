import { and, desc, eq } from 'drizzle-orm';
import * as z from 'zod';
import { campaigns, journalEntries } from '../schema';
import { ApiError, parse } from '../errors';
import { strField } from '../../utils/validation';

export const journalCreateSchema = z.object({ text: strField('text', 1, 2000) }, { error: 'body must be a JSON object' });
export type JournalCreate = z.infer<typeof journalCreateSchema>;

export type JournalEntry = { id: string; text: string; createdAt: string };

async function conn() {
	const { getDrizzle } = await import('../db');
	return getDrizzle();
}

type Db = Awaited<ReturnType<typeof conn>>;

async function requireCampaign(db: Db, campaignId: string) {
	const [c] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId));
	if (!c) throw new ApiError(404, 'campaign not found');
}

const toEntry = (r: { id: string; text: string; createdAt: Date }): JournalEntry => ({
	id: r.id,
	text: r.text,
	createdAt: r.createdAt.toISOString()
});

export async function listJournal(campaignId: string): Promise<JournalEntry[]> {
	const db = await conn();
	await requireCampaign(db, campaignId);
	const rows = await db
		.select({ id: journalEntries.id, text: journalEntries.text, createdAt: journalEntries.createdAt })
		.from(journalEntries)
		.where(eq(journalEntries.campaignId, campaignId))
		.orderBy(desc(journalEntries.createdAt), desc(journalEntries.id));
	return rows.map(toEntry);
}

export async function addJournalEntry(campaignId: string, body: unknown): Promise<JournalEntry> {
	const db = await conn();
	await requireCampaign(db, campaignId);
	const { text } = parse(journalCreateSchema, body);
	const [row] = await db
		.insert(journalEntries)
		.values({ campaignId, text })
		.returning({ id: journalEntries.id, text: journalEntries.text, createdAt: journalEntries.createdAt });
	return toEntry(row);
}

export async function deleteJournalEntry(campaignId: string, entryId: string): Promise<void> {
	const db = await conn();
	await requireCampaign(db, campaignId);
	const rows = await db
		.delete(journalEntries)
		.where(and(eq(journalEntries.id, entryId), eq(journalEntries.campaignId, campaignId)))
		.returning({ id: journalEntries.id });
	if (rows.length === 0) throw new ApiError(404, 'journal entry not found');
}
