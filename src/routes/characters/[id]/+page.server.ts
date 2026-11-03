import { error, fail } from '@sveltejs/kit';
import { pickList, pickOf, subclassesOf, getSrd, cardsByIds, cardGroups, itemGroups, itemPicks } from '$lib/server/srd';
import { conditionFieldSchema, trackerFieldSchema } from '$lib/server/characters';
import type { Actions, PageServerLoad } from './$types';

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

function failure(r: { status: number; data: { error?: string } | null }, extra: object = {}) {
	return fail(r.status, { error: r.data?.error ?? 'request failed', ...extra });
}

const enc = encodeURIComponent;

export const load: PageServerLoad = async ({ params, fetch, locals }) => {
	const r = await call(fetch, 'GET', `/api/characters/${enc(params.id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'Character not found');
	if (!r.ok) error(r.status, 'Could not load character');
	const lang = locals?.lang ?? 'en';
	const ch = r.data;
	return {
		character: ch,
		picks: {
			classes: pickList('classes', lang).map((p, i) => ({ ...p, value: pickList('classes', 'en')[i].name })),
			subclasses: subclassesOf(String(ch.class), lang),
			ancestries: pickList('ancestries', lang),
			communities: pickList('communities', lang)
		},
		cards: cardsByIds(Array.isArray(ch.cards) ? ch.cards : [], lang),
		cardGroups: cardGroups(String(ch.class), lang),
		itemGroups: itemGroups(lang),
		itemPicks: itemPicks(
			(Array.isArray(ch.items) ? ch.items : []).flatMap((i: { srdId?: string | null }) => (i.srdId ? [i.srdId] : [])),
			lang
		),
		chosen: {
			subclass: pickOf('subclasses', ch.subclass, lang),
			ancestry: pickOf('ancestries', ch.ancestry, lang),
			community: pickOf('communities', ch.community, lang)
		}
	};
};

export const actions: Actions = {
	tracker: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const t = trackerFieldSchema.safeParse(form.get('tracker'));
		if (!t.success) return fail(400, { error: t.error.issues[0].message });
		const tracker = t.data;
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/${tracker}`, {
			delta: Number(form.get('delta'))
		});
		return r.ok ? { ok: true } : failure(r);
	},
	damage: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/damage`, {
			amount: num(form.get('amount')),
			useArmor: form.get('useArmor') !== null
		});
		return r.ok ? { ok: true } : failure(r);
	},
	edit: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const body: Record<string, unknown> = {
			name: form.get('name') ?? '',
			class: form.get('class') ?? ''
		};
		for (const k of NUMERIC) body[k] = num(form.get(k));
		for (const k of ['subclass', 'ancestry', 'community']) {
			const v = form.get(k);
			if (v !== null) body[k] = typeof v === 'string' && v !== '' ? v : null;
		}
		// a subclass belongs to one class: drop it when the class changed
		if (typeof body.subclass === 'string') {
			const sc = getSrd('subclasses', body.subclass, 'en');
			if (sc && String(sc.class) !== String(body.class).toUpperCase()) body.subclass = null;
		}
		const r = await call(fetch, 'PATCH', `/api/characters/${enc(params.id)}`, body);
		return r.ok ? { ok: true } : failure(r);
	},
	condition: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const c = conditionFieldSchema.safeParse(form.get('condition'));
		if (!c.success) return fail(400, { error: c.error.issues[0].message });
		const key = c.data;
		const r = await call(fetch, 'PUT', `/api/characters/${enc(params.id)}/conditions`, {
			[key]: form.get('value') === 'on'
		});
		return r.ok ? { ok: true } : failure(r);
	},
	notes: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'PATCH', `/api/characters/${enc(params.id)}`, {
			notes: String(form.get('notes') ?? '')
		});
		return r.ok ? { ok: true } : failure(r);
	},
	gold: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/gold`, {
			handfuls: num(form.get('handfuls'))
		});
		return r.ok ? { ok: true } : failure(r);
	},
	addItem: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const srdId = form.get('srdId');
		const body: Record<string, unknown> =
			typeof srdId === 'string' && srdId !== '' ? { srdId } : { name: form.get('name') ?? '' };
		const q = form.get('quantity');
		if (typeof q === 'string' && q.trim() !== '') body.quantity = num(q);
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/items`, body);
		return r.ok ? { ok: true } : failure(r);
	},
	setQuantity: async ({ request, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'PATCH', `/api/items/${enc(String(form.get('itemId')))}`, {
			quantity: num(form.get('quantity'))
		});
		return r.ok ? { ok: true } : failure(r);
	},
	removeItem: async ({ request, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'DELETE', `/api/items/${enc(String(form.get('itemId')))}`);
		return r.ok ? { ok: true } : failure(r);
	},
	addCard: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/cards`, {
			cardId: String(form.get('cardId') ?? '')
		});
		return r.ok ? { ok: true } : failure(r);
	},
	removeCard: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const r = await call(
			fetch,
			'DELETE',
			`/api/characters/${enc(params.id)}/cards/${enc(String(form.get('cardId') ?? ''))}`
		);
		return r.ok ? { ok: true } : failure(r);
	}
};
