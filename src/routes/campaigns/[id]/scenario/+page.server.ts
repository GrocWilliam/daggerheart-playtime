import { redirect } from '@sveltejs/kit';
type PageServerLoad = import('./$types').PageServerLoad;

export const load: PageServerLoad = ({ params }) => {
	redirect(308, `/campaigns/${encodeURIComponent(params.id)}?step=build`);
};
