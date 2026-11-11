import { error, fail, redirect } from '@sveltejs/kit';
import { pickList, pickOf, subclassesOf, getSrd, cardsByIds, cardGroups, domainsOfClass, itemGroups, itemPicks, weaponGroups, armorGroups, gearDetail } from '$lib/server/features/srd';
import { TRAITS, tierOfLevel, conditionFieldSchema, trackerFieldSchema } from '$lib/server/features/characters';
type Actions = import('./$types').Actions;
type PageServerLoad = import('./$types').PageServerLoad;

import { parseTab, ACTION_SECTION, type ActionName } from './tabs';

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

/** Form field to number; empty/non-numeric stays a string so the API rejects it. */
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

function failure(
	r: { status: number; data: { error?: string } | null },
	extra: { modal?: string; values?: Record<string, string>; section: string | null }
) {
	return fail(r.status, { error: errorKey(r.status), modal: extra.modal, values: extra.values, section: extra.section });
}

/** Success: no-JS posts redirect to the sheet tab of the action URL, enhanced ones update in place. */
function done(event: { request: Request; params: { id: string }; url: URL }, _name: ActionName) {
	if (!event.request.headers.has('x-sveltekit-action'))
		redirect(303, `/characters/${enc(event.params.id)}?tab=${parseTab(event.url.searchParams.get('tab'))}`);
	return { ok: true };
}

const enc = encodeURIComponent;

export const load: PageServerLoad = async ({ params, fetch, locals, url }) => {
	const r = await call(fetch, 'GET', `/api/characters/${enc(params.id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'not found');
	if (!r.ok) error(r.status, 'load failed');
	const lang = locals?.lang ?? 'en';
	const ch = r.data;
	return {
		tab: parseTab(url.searchParams.get('tab')),
		character: ch,
		picks: {
			classes: pickList('classes', lang).map((p, i) => ({ ...p, value: pickList('classes', 'en')[i].name })),
			subclasses: subclassesOf(String(ch.class), lang),
			ancestries: pickList('ancestries', lang),
			communities: pickList('communities', lang)
		},
		domains: domainsOfClass(String(ch.class), lang),
		cards: cardsByIds(Array.isArray(ch.cards) ? ch.cards : [], lang),
		cardGroups: cardGroups(String(ch.class), lang),
		itemGroups: itemGroups(lang),
		// SRD items are stored under their English name; `itemPicks` has the name in the page language.
		itemPicks: itemPicks(
			(Array.isArray(ch.items) ? ch.items : []).flatMap((i: { srdId?: string | null }) => (i.srdId ? [i.srdId] : [])),
			lang
		),
		equipment: {
			primary: weaponGroups('primary', tierOfLevel(ch.level), lang),
			secondary: weaponGroups('secondary', tierOfLevel(ch.level), lang),
			armors: armorGroups(tierOfLevel(ch.level), lang),
			primaryWeapon: gearDetail('weapons', ch.primaryWeapon, lang),
			secondaryWeapon: gearDetail('weapons', ch.secondaryWeapon, lang),
			armor: gearDetail('armors', ch.armorId, lang),
			secondaryBlocked: gearDetail('weapons', ch.primaryWeapon, 'en')?.burden === 'TWO_HANDED'
		},
		chosen: {
			subclass: pickOf('subclasses', ch.subclass, lang),
			ancestry: pickOf('ancestries', ch.ancestry, lang),
			community: pickOf('communities', ch.community, lang)
		}
	};
};

export const actions: Actions = {
	tracker: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const t = trackerFieldSchema.safeParse(form.get('tracker'));
		if (!t.success) return fail(400, { error: 'error.invalid', section: ACTION_SECTION.tracker });
		const tracker = t.data;
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/${tracker}`, {
			delta: Number(form.get('delta'))
		});
		return r.ok ? done(event, 'tracker') : failure(r, { section: ACTION_SECTION.tracker });
	},
	damage: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/damage`, {
			amount: num(form.get('amount')),
			useArmor: form.get('useArmor') !== null
		});
		return r.ok ? done(event, 'damage') : failure(r, { section: ACTION_SECTION.damage });
	},
	edit: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const body: Record<string, unknown> = {
			name: form.get('name') ?? '',
			class: form.get('class') ?? ''
		};
		for (const k of NUMERIC) body[k] = num(form.get(k));
		if (TRAITS.some((k) => form.has(`traits.${k}`)))
			body.traits = Object.fromEntries(TRAITS.map((k) => [k, num(form.get(`traits.${k}`))]));
		const KINDS = { subclass: 'subclasses', ancestry: 'ancestries', community: 'communities' } as const;
		let stored: Record<string, unknown> | null | undefined;
		for (const k of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
			const v = form.get(k);
			if (v === null) continue;
			if (typeof v === 'string' && v !== '') {
				// a legacy (non-SRD) value the character already has stays as it is: the API only accepts SRD ids
				if (!getSrd(KINDS[k], v, 'en')) {
					stored ??= (await call(fetch, 'GET', `/api/characters/${enc(params.id)}`)).data ?? null;
					if (stored?.[k] === v) continue;
				}
				body[k] = v;
			} else body[k] = null;
		}
		// a level change with untouched thresholds lets the API recompute them
		if (form.get('level') !== null) {
			stored ??= (await call(fetch, 'GET', `/api/characters/${enc(params.id)}`)).data ?? null;
			if (
				stored &&
				body.level !== stored.level &&
				body.majorThreshold === stored.majorThreshold &&
				body.severeThreshold === stored.severeThreshold
			) {
				delete body.majorThreshold;
				delete body.severeThreshold;
			}
		}
		// a subclass belongs to one class: drop it when the class changed
		if (typeof body.subclass === 'string') {
			const sc = getSrd('subclasses', body.subclass, 'en');
			if (sc && String(sc.class) !== String(body.class).toUpperCase()) body.subclass = null;
		}
		const r = await call(fetch, 'PATCH', `/api/characters/${enc(params.id)}`, body);
		if (r.ok) return done(event, 'edit');
		const values: Record<string, string> = {};
		for (const [k, v] of form.entries()) if (typeof v === 'string') values[k] = v;
		return failure(r, { modal: 'edit', values, section: null });
	},
	condition: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const c = conditionFieldSchema.safeParse(form.get('condition'));
		if (!c.success) return fail(400, { error: 'error.invalid', section: ACTION_SECTION.condition });
		const key = c.data;
		const r = await call(fetch, 'PUT', `/api/characters/${enc(params.id)}/conditions`, {
			[key]: form.get('value') === 'on'
		});
		return r.ok ? done(event, 'condition') : failure(r, { section: ACTION_SECTION.condition });
	},
	notes: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'PATCH', `/api/characters/${enc(params.id)}`, {
			notes: String(form.get('notes') ?? '')
		});
		return r.ok ? done(event, 'notes') : failure(r, { section: ACTION_SECTION.notes });
	},
	gold: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/gold`, {
			handfuls: num(form.get('handfuls'))
		});
		return r.ok ? done(event, 'gold') : failure(r, { section: ACTION_SECTION.gold });
	},
	addItem: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const srdId = form.get('srdId');
		const body: Record<string, unknown> =
			typeof srdId === 'string' && srdId !== '' ? { srdId } : { name: form.get('name') ?? '' };
		const q = form.get('quantity');
		if (typeof q === 'string' && q.trim() !== '') body.quantity = num(q);
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/items`, body);
		const str = (k: string) => (typeof form.get(k) === 'string' ? String(form.get(k)) : '');
		return r.ok
			? done(event, 'addItem')
			: failure(r, { modal: 'item', values: { name: str('name'), srdId: str('srdId'), quantity: str('quantity') }, section: null });
	},
	setQuantity: async (event) => {
		const { request, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'PATCH', `/api/items/${enc(String(form.get('itemId')))}`, {
			quantity: num(form.get('quantity'))
		});
		return r.ok ? done(event, 'setQuantity') : failure(r, { section: ACTION_SECTION.setQuantity });
	},
	removeItem: async (event) => {
		const { request, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'DELETE', `/api/items/${enc(String(form.get('itemId')))}`);
		return r.ok ? done(event, 'removeItem') : failure(r, { section: ACTION_SECTION.removeItem });
	},
	addCard: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/cards`, {
			cardId: String(form.get('cardId') ?? '')
		});
		return r.ok ? done(event, 'addCard') : failure(r, { modal: 'card', values: { cardId: String(form.get('cardId') ?? '') }, section: null });
	},
	removeCard: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(
			fetch,
			'DELETE',
			`/api/characters/${enc(params.id)}/cards/${enc(String(form.get('cardId') ?? ''))}`
		);
		return r.ok ? done(event, 'removeCard') : failure(r, { section: ACTION_SECTION.removeCard });
	},
	equip: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const field = ['primaryWeapon', 'secondaryWeapon', 'armorId'].find((k) => form.has(k));
		if (!field) return fail(400, { error: 'error.invalid', section: ACTION_SECTION.equip });
		const v = form.get(field);
		const r = await call(fetch, 'PATCH', `/api/characters/${enc(params.id)}`, {
			[field]: typeof v === 'string' && v !== '' ? v : null
		});
		return r.ok ? done(event, 'equip') : failure(r, { section: ACTION_SECTION.equip });
	},
	addExperience: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/experiences`, {
			name: form.get('name') ?? '',
			modifier: num(form.get('modifier'))
		});
		const val = (k: string) => (typeof form.get(k) === 'string' ? String(form.get(k)) : '');
		return r.ok
			? done(event, 'addExperience')
			: failure(r, { modal: 'experience', values: { name: val('name'), modifier: val('modifier') }, section: null });
	},
	setExperience: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(
			fetch,
			'PATCH',
			`/api/characters/${enc(params.id)}/experiences/${enc(String(form.get('expId') ?? ''))}`,
			{ modifier: num(form.get('modifier')) }
		);
		return r.ok ? done(event, 'setExperience') : failure(r, { section: ACTION_SECTION.setExperience });
	},
	removeExperience: async (event) => {
		const { request, params, fetch } = event;
		const form = await request.formData();
		const r = await call(
			fetch,
			'DELETE',
			`/api/characters/${enc(params.id)}/experiences/${enc(String(form.get('expId') ?? ''))}`
		);
		return r.ok ? done(event, 'removeExperience') : failure(r, { section: ACTION_SECTION.removeExperience });
	}
};
