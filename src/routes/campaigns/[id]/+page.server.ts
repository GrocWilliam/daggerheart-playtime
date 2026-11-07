import { error, fail, redirect } from '@sveltejs/kit';
import { getSrd, listSrd, localizedSrd, pickOf, type Line } from '$lib/server/features/srd';
import type { Scene } from '$lib/server/features/scenes';
import type { LootEntry } from '$lib/server/features/loot';
import type { Lang } from '$lib/i18n';
import { partyDefaults, ADJUSTMENTS, type Encounter } from '$lib/server/features/encounters';
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

type Raw = { description?: { paragraph?: Record<string, string> }[] };

/** Adversary and environment stats on this screen are the SRD's English (their own story localizes them). */
const SOURCE_LANG: Lang = 'en';

/** A loot entry with its localized name and SRD feature texts, each with its language. */
function lootView(l: LootEntry, lang: Lang) {
	const r = localizedSrd(l.table, l.srdId, lang);
	const el = r?.element;
	const featLang: Lang = r?.langs.features ?? SOURCE_LANG;
	const features: Line[] = ((el?.features as Raw[] | undefined) ?? []).flatMap((f) =>
		(f.description ?? [])
			.map((d) => d.paragraph?.['en-US'])
			.filter((x): x is string => typeof x === 'string')
			.map((text) => ({ text, lang: featLang }))
	);
	return {
		id: l.id, roll: l.roll, given: l.given,
		name: el?.nameLocalized ?? l.name, nameLang: r?.langs.name ?? SOURCE_LANG, features
	};
}

type Feature = { name: string; text: string };

/** An encounter entry with its English SRD stats. */
function adversaryView(a: { id: string; name: string; role: string; count: number; cost: number }) {
	const d = (getSrd('adversaries', a.id, 'en') ?? {}) as Record<string, unknown>;
	const s = (k: string) => String(d[k] ?? '');
	const features = ((d.feature as Feature[] | undefined) ?? []).map((f) => ({ name: f.name, text: f.text }));
	return {
		id: a.id, name: a.name, role: a.role, count: a.count, cost: a.cost, lang: SOURCE_LANG,
		difficulty: s('difficulty'), hp: s('hp'), stress: s('stress'), thresholds: s('thresholds'),
		attack: s('attack'), damage: s('damage'), features
	};
}

const base = (id: string) => `/api/campaigns/${encodeURIComponent(id)}/scenes`;
const journalBase = (id: string) => `/api/campaigns/${encodeURIComponent(id)}/journal`;
const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const envOf = (v: FormDataEntryValue | null) => (text(v) === '' ? null : text(v));

export const load: PageServerLoad = async ({ params, fetch, locals, url }) => {
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
	const sc = await call(fetch, 'GET', base(params.id));
	const scenesRaw = (Array.isArray(sc.data) ? sc.data : []) as Scene[];
	const current = scenesRaw.find((s) => s.status === 'current');
const scenes = scenesRaw.map((s) => {
		const e = s.environmentId ? getSrd('environments', s.environmentId, 'en') : null;
		const environment = e
			? {
					name: String(e.name),
					type: String(e.type ?? ''),
					difficulty: String(e.difficulty ?? ''),
					impulses: String(e.impulses ?? ''),
					lang: SOURCE_LANG,
					// Name and guiding question only: the full rules text stays in the SRD reference.
					features: ((e.feature as { name: string; question?: string }[] | undefined) ?? []).map(
						(f): Line => ({ text: f.question ? `${f.name.trim()}: ${f.question}` : f.name.trim(), lang: SOURCE_LANG })
					)
				}
			: null;
		const enc = s.encounter as Encounter | null;
		const encounter = enc ? { ...enc, over: enc.spent > enc.budget, adversaries: enc.adversaries.map(adversaryView) } : null;
		const loot = (Array.isArray(s.loot) ? (s.loot as LootEntry[]) : []).map((l) => lootView(l, lang));
		return { ...s, environment, loot, encounter };
	});
	const jr = await call(fetch, 'GET', `/api/campaigns/${encodeURIComponent(params.id)}/journal`);
	const journal = (Array.isArray(jr.data) ? (jr.data as { id: string; text: string; createdAt: string }[]) : []).map((j) => {
		const d = new Date(j.createdAt);
		const p = (n: number) => String(n).padStart(2, '0');
		return { id: j.id, text: j.text, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
	});
	const raw = (r.data.characters ?? []) as { id: string; name: string; level?: number }[];
	const characters = raw.map((ch) => ({ id: ch.id, name: ch.name }));
	const party = partyDefaults(raw.map((ch) => (typeof ch.level === 'number' ? ch.level : 1)));
	return {
		campaign: r.data, chosen, currentScene: (current?.title as string | undefined) ?? null,
		step: url?.searchParams.get('step') === 'build' ? ('build' as const) : ('run' as const),
		scenes, journal, characters, party, environments: listSrd('environments', lang)
	};
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

const encPath = (e: Event, f: FormData) => `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}/encounter`;

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
add: async (e) => {
		const f = await e.request.formData();
		const values = {
			title: text(f.get('title')),
			notes: text(f.get('notes')),
			environmentId: text(f.get('environmentId'))
		};
		const r = await call(e.fetch, 'POST', base(e.params.id), {
			title: values.title,
			notes: values.notes,
			environmentId: envOf(f.get('environmentId'))
		});
		if (!r.ok) return failure(r, { modal: 'scene', values });
		// Without JavaScript, land back on the step (enhance requests set this header and get { ok }).
		if (!e.request.headers.has('x-sveltekit-action')) redirect(303, `/campaigns/${encodeURIComponent(e.params.id)}?step=build`);
		return { ok: true };
	},
	edit: async (e) => {
		const f = await e.request.formData();
		// Only the fields present in the form change (the Run step posts notes alone).
		const body: Record<string, unknown> = {};
		if (f.has('title')) body.title = text(f.get('title'));
		if (f.has('notes')) body.notes = text(f.get('notes'));
		if (f.has('environmentId')) body.environmentId = envOf(f.get('environmentId'));
		return run(e, 'PATCH', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}`, body);
	},
	nextScene: async (e) => run(e, 'POST', `${base(e.params.id)}/next`),
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
	generate: async (e) => {
		const f = await e.request.formData();
		const adjustments = ADJUSTMENTS.filter((a) => f.getAll('adjustments').includes(a));
		const num = (k: string) => (text(f.get(k)) === '' ? undefined : Number(f.get(k)));
		return run(e, 'POST', `${encPath(e, f)}`, { partySize: num('partySize'), tier: num('tier'), adjustments });
	},
	setCount: async (e) => {
		const f = await e.request.formData();
		const counts = f.getAll('id').map((id, i) => ({ id: text(id), count: Number(f.getAll('count')[i]) }));
		return run(e, 'PATCH', encPath(e, f), { adversaries: counts });
	},
	removeAdversary: async (e) => {
		const f = await e.request.formData();
		const gone = text(f.get('remove'));
		const counts = f.getAll('id').map((id, i) => ({ id: text(id), count: Number(f.getAll('count')[i]) })).filter((a) => a.id !== gone);
		return run(e, 'PATCH', encPath(e, f), { adversaries: counts });
	},
	deleteEncounter: async (e) => {
		const f = await e.request.formData();
		return run(e, 'DELETE', encPath(e, f));
	},
	addJournal: async (e) => {
		const f = await e.request.formData();
		return run(e, 'POST', journalBase(e.params.id), { text: text(f.get('text')) });
	},
	deleteJournal: async (e) => {
		const f = await e.request.formData();
		return run(e, 'DELETE', `${journalBase(e.params.id)}/${encodeURIComponent(text(f.get('entryId')))}`);
	},
	delete: async (e) => {
		const f = await e.request.formData();
		return run(e, 'DELETE', `${base(e.params.id)}/${encodeURIComponent(text(f.get('sceneId')))}`);
	}
};
