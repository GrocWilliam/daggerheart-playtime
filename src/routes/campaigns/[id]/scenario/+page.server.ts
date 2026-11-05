import { error, fail } from '@sveltejs/kit';
import { getSrd, listSrd } from '$lib/server/features/srd';
import type { Scene } from '$lib/server/features/scenes';
type Actions = import('./$types').Actions;
type PageServerLoad = import('./$types').PageServerLoad;

type Fetch = typeof fetch;

async function call(fetchFn: Fetch, method: string, path: string, body?: unknown) {
	const res = await fetchFn(path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await res.json().catch(() => null);
	return { ok: res.ok, status: res.status, data };
}

/** The API's English message never reaches the page: the page translates this catalog key. */
function errorKey(status: number): string {
	if (status === 404) return 'error.notFound';
	return status >= 500 ? 'error.server' : 'error.invalid';
}

const base = (id: string) => `/api/campaigns/${encodeURIComponent(id)}/scenes`;
const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const envOf = (v: FormDataEntryValue | null) => (text(v) === '' ? null : text(v));

export const load: PageServerLoad = async ({ params, fetch, locals }) => {
	const r = await call(fetch, 'GET', base(params.id));
	if (r.status === 404 || r.status === 400) error(404, 'not found');
	if (!r.ok || !Array.isArray(r.data)) error(r.status, 'load failed');
	const lang = locals?.lang ?? 'en';
	const scenes = (r.data as Scene[]).map((s) => {
		const e = s.environmentId ? getSrd('environments', s.environmentId, 'en') : null;
		const environment = e
			? {
					name: String(e.name),
					type: String(e.type ?? ''),
					difficulty: String(e.difficulty ?? ''),
					impulses: String(e.impulses ?? ''),
					// Name and guiding question only: the full rules text stays in the SRD reference.
					features: ((e.feature as { name: string; question?: string }[] | undefined) ?? []).map(
						(f) => (f.question ? `${f.name.trim()}: ${f.question}` : f.name.trim())
					)
				}
			: null;
		return { ...s, environment };
	});
	return { campaignId: params.id, scenes, environments: listSrd('environments', lang) };
};

type Event = Parameters<NonNullable<Actions[string]>>[0];

async function run(
	{ fetch }: Event,
	method: string,
	path: string,
	body?: unknown
) {
	const r = await call(fetch, method, path, body);
	return r.ok ? { ok: true } : fail(r.status, { error: errorKey(r.status) });
}

export const actions: Actions = {
	add: async (e) => {
		const f = await e.request.formData();
		return run(e, 'POST', base(e.params.id), {
			title: text(f.get('title')),
			notes: text(f.get('notes')),
			environmentId: envOf(f.get('environmentId'))
		});
	},
	edit: async (e) => {
		const f = await e.request.formData();
		return run(e, 'PATCH', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}`, {
			title: text(f.get('title')),
			notes: text(f.get('notes')),
			environmentId: envOf(f.get('environmentId'))
		});
	},
	move: async (e) => {
		const f = await e.request.formData();
		const position = Number(f.get('position'));
		return run(e, 'POST', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}/move`, {
			position: text(f.get('position')) === '' ? '' : position
		});
	},
	status: async (e) => {
		const f = await e.request.formData();
		return run(e, 'PATCH', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}`, {
			status: text(f.get('status'))
		});
	},
	delete: async (e) => {
		const f = await e.request.formData();
		return run(e, 'DELETE', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}`);
	}
};
