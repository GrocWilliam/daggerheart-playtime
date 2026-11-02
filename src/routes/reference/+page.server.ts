import { isSrdKind, searchSrd } from '$lib/server/srd';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals }) => {
	const k = url.searchParams.get('kind') ?? '';
	const q = url.searchParams.get('q') ?? '';
	const kind = isSrdKind(k) ? k : undefined;
	return { kind: kind ?? '', q, sections: searchSrd(kind, q, locals.lang) };
};
