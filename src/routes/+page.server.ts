import { fail, redirect } from '@sveltejs/kit';
import { ApiError, createCampaign, listCampaigns } from '$lib/server/campaigns';
import type { Actions, PageServerLoad } from './$types';

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
