import { error, fail } from '@sveltejs/kit';
import { idByName, pickList, pickOf } from '$lib/server/features/srd';
import { trackerFieldSchema } from '$lib/server/features/characters';
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

const NUMERIC = ['level', 'evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots'];

/** Form field to number; empty/non-numeric becomes NaN-like string so the API rejects it. */
function num(v: FormDataEntryValue | null): number | string {
	if (typeof v !== 'string' || v.trim() === '') return '';
	const n = Number(v);
	return Number.isFinite(n) ? n : v;
}

/** The API's English message never reaches the page: the page translates this catalog key. */
function errorKey(status: number): string {
	if (status === 404) return 'error.notFound';
	return status >= 500 ? 'error.server' : 'error.invalid';
}

function failure(r: { status: number; data: { error?: string } | null }, extra: object = {}) {
	return fail(r.status, { error: errorKey(r.status), ...extra });
}

export const load: PageServerLoad = async ({ params, fetch, locals }) => {
	const r = await call(fetch, 'GET', `/api/campaigns/${encodeURIComponent(params.id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'not found');
	if (!r.ok) error(r.status, 'load failed');
	const lang = locals?.lang ?? 'en';
	const chosen: Record<string, unknown> = {};
	for (const ch of r.data.characters ?? []) {
		chosen[ch.id] = {
			subclass: pickOf('subclasses', ch.subclass, lang),
			ancestry: pickOf('ancestries', ch.ancestry, lang),
			community: pickOf('communities', ch.community, lang)
		};
	}
	const en = (kind: 'classes' | 'ancestries' | 'communities') => pickList(kind, 'en');
	const options = (kind: 'classes' | 'ancestries' | 'communities') =>
		pickList(kind, lang).map((p, i) => ({ value: en(kind)[i].name, label: p.name }));
	const picks = {
		class: options('classes'),
		ancestry: options('ancestries'),
		community: options('communities')
	};
	const sc = await call(fetch, 'GET', `/api/campaigns/${encodeURIComponent(params.id)}/scenes`);
	const current = Array.isArray(sc.data) ? sc.data.find((s: { status: string }) => s.status === 'current') : undefined;
	return { campaign: r.data, chosen, picks, currentScene: (current?.title as string | undefined) ?? null };
};

export const actions: Actions = {
	fear: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/campaigns/${encodeURIComponent(params.id)}/fear`, {
			delta: Number(form.get('delta'))
		});
		return r.ok ? { ok: true } : failure(r);
	},
	tracker: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = String(form.get('characterId'));
		const t = trackerFieldSchema.safeParse(form.get('tracker'));
		if (!t.success) return fail(400, { error: 'error.invalid' });
		const tracker = t.data;
		const r = await call(
			fetch,
			'POST',
			`/api/characters/${encodeURIComponent(id)}/${tracker}`,
			{ delta: Number(form.get('delta')) }
		);
		return r.ok ? { ok: true } : failure(r);
	},
	damage: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = String(form.get('characterId'));
		const r = await call(fetch, 'POST', `/api/characters/${encodeURIComponent(id)}/damage`, {
			amount: num(form.get('amount')),
			useArmor: form.get('useArmor') !== null
		});
		return r.ok ? { ok: true } : failure(r, { damageFor: id });
	},
	addCharacter: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const body: Record<string, unknown> = {
			name: form.get('name') ?? '',
			class: form.get('class') ?? ''
		};
		for (const k of ['ancestry', 'community'] as const) {
			const id = idByName(k === 'ancestry' ? 'ancestries' : 'communities', String(form.get(k) ?? ''));
			if (id) body[k] = id;
		}
		for (const k of NUMERIC) body[k] = num(form.get(k));
		const r = await call(fetch, 'POST', `/api/campaigns/${encodeURIComponent(params.id)}/characters`, body);
		return r.ok ? { ok: true } : failure(r);
	}
};
