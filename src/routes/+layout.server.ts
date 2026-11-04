type LayoutServerLoad = import('./$types').LayoutServerLoad;

export const load: LayoutServerLoad = ({ locals }) => ({ lang: locals.lang });
