import { json } from '@sveltejs/kit';
import { api, parse, readJson } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { addJournalEntry, listJournal } from '$lib/server/features/journal';
type RequestHandler = import('./$types').RequestHandler;

export const GET: RequestHandler = api(async ({ params }) => json(await listJournal(parse(idSchema, params.id))));

export const POST: RequestHandler = api(async ({ params, request }) => {
	// Invalid JSON gets the same message as a non-object body (story contract).
	const body = await readJson(request).catch(() => undefined);
	return json(await addJournalEntry(parse(idSchema, params.id), body), { status: 201 });
});
