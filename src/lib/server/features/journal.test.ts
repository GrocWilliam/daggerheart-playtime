import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { journalCreateSchema } from './journal';

const msg = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0].message;

describe('journalCreateSchema', () => {
	it('trims', () => {
		expect(journalCreateSchema.parse({ text: '  Door found  ' })).toEqual({ text: 'Door found' });
	});
	it('rejects bad text', () => {
		for (const t of ['', 'x'.repeat(2001)])
			expect(msg(journalCreateSchema.safeParse({ text: t }))).toBe('text must be 1 to 2000 characters');
		expect(msg(journalCreateSchema.safeParse({ text: 5 }))).toBe('text must be a string');
		expect(msg(journalCreateSchema.safeParse([]))).toBe('body must be a JSON object');
	});
});

describe('journal on PGlite', () => {
	let m: typeof import('./journal');
	let c: typeof import('./campaigns');
	beforeAll(async () => {
		process.env.PGLITE_DATA_DIR = 'memory://';
		delete process.env.DATABASE_URL;
		m = await import('./journal');
		c = await import('./campaigns');
	});
	afterAll(async () => {
		await (await (await import('../db')).getDb()).close?.();
	});

	it('adds, lists newest first, deletes', async () => {
		const a = await c.createCampaign({ name: 'A' });
		const b = await c.createCampaign({ name: 'B' });
		expect(await m.listJournal(a.id)).toEqual([]);
		const e1 = await m.addJournalEntry(a.id, { text: ' one ' });
		const e2 = await m.addJournalEntry(a.id, { text: 'two' });
		expect(e1).toEqual({ id: expect.any(String), text: 'one', createdAt: expect.stringMatching(/Z$/) });
		expect((await m.listJournal(a.id)).map((e) => e.text)).toEqual(['two', 'one']);
		await expect(m.deleteJournalEntry(b.id, e1.id)).rejects.toMatchObject({ status: 404, message: 'journal entry not found' });
		await m.deleteJournalEntry(a.id, e1.id);
		expect((await m.listJournal(a.id)).map((e) => e.id)).toEqual([e2.id]);
	});

	it('404s on unknown campaign and cascades on campaign delete', async () => {
		await expect(m.listJournal('nope')).rejects.toBeInstanceOf(ApiError);
		await expect(m.addJournalEntry('nope', { text: 'x' })).rejects.toMatchObject({ message: 'campaign not found' });
		const k = await c.createCampaign({ name: 'K' });
		await m.addJournalEntry(k.id, { text: 'x' });
		await c.deleteCampaign(k.id);
		const db = await (await import('../db')).getDb();
		const r = await db.query('select 1 from journal_entries where campaign_id = $1', [k.id]);
		expect(r.rows).toHaveLength(0);
	});
});
