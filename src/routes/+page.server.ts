import { error, fail, redirect } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { createCampaign, listCampaigns } from '$lib/server/features/campaigns';
type Actions = import('./$types').Actions;
type PageServerLoad = import('./$types').PageServerLoad;

export const load: PageServerLoad = async ({ fetch, locals }) => {
	const get = async (url: string) => {
		const r = await fetch(url);
		if (!r.ok) error(500);
		return r.json();
	};
	const fmt = new Intl.DateTimeFormat(locals.lang, { dateStyle: 'medium' });
	const campaigns = await Promise.all(
		(await listCampaigns()).map(async (c) => {
			const base = `/api/campaigns/${encodeURIComponent(c.id)}`;
			const [detail, scenes, journal] = await Promise.all([get(base), get(`${base}/scenes`), get(`${base}/journal`)]);
			const current = (scenes as { title: string; status: string }[]).find((s) => s.status === 'current');
			const last = (journal as { createdAt: string }[])[0]?.createdAt;
			return {
				id: c.id,
				name: c.name,
				characters: (detail.characters as unknown[]).length,
				scene: current ? current.title : null,
				lastJournal: last ? fmt.format(new Date(last)) : null
			};
		})
	);
	return { campaigns };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const name = form.get('name');
		let id: string;
		try {
			({ id } = await createCampaign({ name }));
		} catch (e) {
			if (e instanceof ApiError) {
				return fail(400, { error: 'home.error', modal: 'campaign', values: { name: typeof name === 'string' ? name : '' } });
			}
			throw e;
		}
		redirect(303, `/campaigns/${encodeURIComponent(id)}?step=build`);
	}
};
