import { api, parse } from '$lib/server/errors';
import { idSchema } from '$lib/utils/validation';
import { deleteJournalEntry } from '$lib/server/features/journal';
type RequestHandler = import('./$types').RequestHandler;

export const DELETE: RequestHandler = api(async ({ params }) => {
	await deleteJournalEntry(parse(idSchema, params.id), parse(idSchema, params.entryId));
	return new Response(null, { status: 204 });
});
