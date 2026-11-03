import { searchSrd, srdSearchSchema } from '$lib/server/srd';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals }) => {
	const { kind, q } = srdSearchSchema.parse({
		kind: url.searchParams.get('kind') ?? undefined,
		q: url.searchParams.get('q') ?? ''
	});
	return { kind: kind ?? '', q, sections: searchSrd(kind, q, locals.lang) };
};
