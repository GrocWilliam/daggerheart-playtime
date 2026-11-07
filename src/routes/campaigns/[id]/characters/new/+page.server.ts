import { error, fail, redirect } from '@sveltejs/kit';
import { listSrd, pickOptions } from '$lib/server/features/srd';
import type { Lang } from '$lib/i18n';
import { DEFAULTS, RANGES, TUNNEL_STEPS, characterBody, fieldOfMessage, firstInvalid, parseStep, readValues, stepOfField, tunnelHref } from './tunnel';
type Actions = import('./$types').Actions;
type PageServerLoad = import('./$types').PageServerLoad;

const FIELDS: string[] = TUNNEL_STEPS.flatMap((s) => [...s.fields]);

async function call(fetchFn: typeof fetch, method: string, path: string, body?: unknown) {
	const res = await fetchFn(path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await res.json().catch(() => null);
	return { ok: res.ok, status: res.status, data };
}

/** `invalid` names a field (or `review`); anything else is ignored. */
function readInvalid(v: string | null): string | null {
	return v !== null && (FIELDS.includes(v) || v === 'review') ? v : null;
}

/** Select options with the language of each label (same SRD order as `listSrd`). */
function withLang(kind: 'classes' | 'ancestries' | 'communities', lang: Lang) {
	const langs = listSrd(kind, lang);
	return pickOptions(kind, lang).map((o, i) => ({ ...o, lang: langs[i].nameLang }));
}

export const load: PageServerLoad = async ({ params, fetch, locals, url }) => {
	const r = await call(fetch, 'GET', `/api/campaigns/${encodeURIComponent(params.id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'not found');
	if (!r.ok) error(r.status, 'load failed');
	const lang = locals?.lang ?? 'en';
	const step = parseStep(url.searchParams.get('step'));
	const values = readValues(url.searchParams);
	const bad = firstInvalid(values, step - 1);
	if (bad) redirect(303, tunnelHref(params.id, bad.step, values, bad.field));
	return {
		campaign: { id: String(r.data.id), name: String(r.data.name) },
		step,
		values,
		invalid: readInvalid(url.searchParams.get('invalid')),
		steps: TUNNEL_STEPS,
		ranges: RANGES,
		defaults: DEFAULTS,
		// hrefs[k] is step k with the current values (index 0 unused).
		hrefs: [0, 1, 2, 3, 4].map((k) => tunnelHref(params.id, k, values)),
		picks: {
			class: withLang('classes', lang),
			ancestry: withLang('ancestries', lang),
			community: withLang('communities', lang)
		}
	};
};

export const actions: Actions = {
	default: async ({ request, params, fetch }) => {
		const values = readValues(await request.formData());
		const r = await call(fetch, 'POST', `/api/campaigns/${encodeURIComponent(params.id)}/characters`, characterBody(values));
		if (r.status === 201 && r.data?.id) redirect(303, `/characters/${encodeURIComponent(r.data.id)}`);
		if (r.status === 400) {
			const f = fieldOfMessage(String(r.data?.error ?? ''));
			redirect(303, tunnelHref(params.id, stepOfField(f ?? 'review'), values, f ?? 'review'));
		}
		const status = r.status >= 400 ? r.status : 500;
		return fail(status, { error: status === 404 ? 'error.notFound' : 'error.server' });
	}
};
