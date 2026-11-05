import { error, fail } from '@sveltejs/kit';
import { getSrd, listSrd } from '$lib/server/features/srd';
import type { Scene } from '$lib/server/features/scenes';
import type { LootEntry } from '$lib/server/features/loot';
import type { Lang } from '$lib/i18n';
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

type Raw = { description?: { paragraph?: Record<string, string> }[] };

/** A loot entry with its localized name and the English SRD feature texts. */
function lootView(l: LootEntry, lang: Lang) {
	const el = getSrd(l.table, l.srdId, lang) as (Record<string, unknown> & { nameLocalized: string }) | null;
	const features = ((el?.features as Raw[] | undefined) ?? []).flatMap((f) =>
		(f.description ?? []).map((d) => d.paragraph?.['en-US']).filter((x): x is string => typeof x === 'string')
	);
	return { id: l.id, roll: l.roll, given: l.given, name: el?.nameLocalized ?? l.name, features };
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
		const loot = (Array.isArray(s.loot) ? (s.loot as LootEntry[]) : []).map((l) => lootView(l, lang));
		return { ...s, environment, loot };
	});
	const c = await call(fetch, 'GET', `/api/campaigns/${encodeURIComponent(params.id)}`);
	const characters = ((c.ok && Array.isArray(c.data?.characters) ? c.data.characters : []) as { id: string; name: string }[]).map(
		(ch) => ({ id: ch.id, name: ch.name })
	);
	return { campaignId: params.id, scenes, characters, environments: listSrd('environments', lang) };
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
	roll: async (e) => {
		const f = await e.request.formData();
		return run(e, 'POST', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}/loot`, {
			table: text(f.get('table')),
			rarity: text(f.get('rarity')),
			count: text(f.get('count')) === '' ? undefined : Number(f.get('count'))
		});
	},
	give: async (e) => {
		const f = await e.request.formData();
		const loot = `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}/loot/${encodeURIComponent(text(f.get('lootId')))}`;
		return run(e, 'POST', `${loot}/give`, { characterId: text(f.get('characterId')) });
	},
	deleteLoot: async (e) => {
		const f = await e.request.formData();
		return run(e, 'DELETE', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}/loot/${encodeURIComponent(text(f.get('lootId')))}`);
	},
	delete: async (e) => {
		const f = await e.request.formData();
		return run(e, 'DELETE', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}`);
	}
};
