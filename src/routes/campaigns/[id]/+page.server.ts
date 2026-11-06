import { error, fail } from '@sveltejs/kit';
import { getSrd, idByName, listSrd, pickList, pickOf } from '$lib/server/features/srd';
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

type Raw = { description?: { paragraph?: Record<string, string> }[] };

/** A loot entry with its localized name and the English SRD feature texts. */
function lootView(l: LootEntry, lang: Lang) {
	const el = getSrd(l.table, l.srdId, lang) as (Record<string, unknown> & { nameLocalized: string }) | null;
	const features = ((el?.features as Raw[] | undefined) ?? []).flatMap((f) =>
		(f.description ?? []).map((d) => d.paragraph?.['en-US']).filter((x): x is string => typeof x === 'string')
	);
	return { id: l.id, roll: l.roll, given: l.given, name: el?.nameLocalized ?? l.name, features };
}

type Feature = { name: string; text: string };

/** An encounter entry with its English SRD stats. */
function adversaryView(a: { id: string; name: string; role: string; count: number; cost: number }) {
	const d = (getSrd('adversaries', a.id, 'en') ?? {}) as Record<string, unknown>;
	const s = (k: string) => String(d[k] ?? '');
	const features = ((d.feature as Feature[] | undefined) ?? []).map((f) => ({ name: f.name, text: f.text }));
	return {
		id: a.id, name: a.name, role: a.role, count: a.count, cost: a.cost,
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
	const en = (kind: 'classes' | 'ancestries' | 'communities') => pickList(kind, 'en');
	const options = (kind: 'classes' | 'ancestries' | 'communities') =>
		pickList(kind, lang).map((p, i) => ({ value: en(kind)[i].name, label: p.name }));
	const picks = {
		class: options('classes'),
		ancestry: options('ancestries'),
		community: options('communities')
	};
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
					// Name and guiding question only: the full rules text stays in the SRD reference.
					features: ((e.feature as { name: string; question?: string }[] | undefined) ?? []).map(
						(f) => (f.question ? `${f.name.trim()}: ${f.question}` : f.name.trim())
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
		campaign: r.data, chosen, picks, currentScene: (current?.title as string | undefined) ?? null,
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
	},
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
