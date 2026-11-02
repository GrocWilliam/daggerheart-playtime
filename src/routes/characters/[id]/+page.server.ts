import { error, fail } from '@sveltejs/kit';
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

const TRACKERS = ['hp', 'stress', 'hope', 'armor'];
const NUMERIC = ['level', 'evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots'];
const CONDITIONS = ['vulnerable', 'restrained', 'hidden'];

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

export const load: PageServerLoad = async ({ params, fetch }) => {
	const r = await call(fetch, 'GET', `/api/characters/${enc(params.id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'Character not found');
	if (!r.ok) error(r.status, 'Could not load character');
	return { character: r.data };
};

export const actions: Actions = {
	tracker: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const tracker = String(form.get('tracker'));
		if (!TRACKERS.includes(tracker)) return fail(400, { error: 'unknown tracker' });
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
		const r = await call(fetch, 'PATCH', `/api/characters/${enc(params.id)}`, body);
		return r.ok ? { ok: true } : failure(r);
	},
	condition: async ({ request, params, fetch }) => {
		const form = await request.formData();
		const key = String(form.get('condition'));
		if (!CONDITIONS.includes(key)) return fail(400, { error: 'unknown condition' });
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
		const body: Record<string, unknown> = { name: form.get('name') ?? '' };
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
	}
};
