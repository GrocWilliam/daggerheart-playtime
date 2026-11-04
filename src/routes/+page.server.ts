import { fail, redirect } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { createCampaign, listCampaigns } from '$lib/server/features/campaigns';
type Actions = import('./$types').Actions;
type PageServerLoad = import('./$types').PageServerLoad;

export const load: PageServerLoad = async () => ({ campaigns: await listCampaigns() });

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const name = form.get('name');
		try {
			await createCampaign({ name });
		} catch (e) {
			if (e instanceof ApiError) {
				return fail(e.status, { error: e.message, name: typeof name === 'string' ? name : '' });
			}
			throw e;
		}
		redirect(303, '/');
	}
};
