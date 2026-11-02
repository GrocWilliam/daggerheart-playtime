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

/** Form field to number; empty/non-numeric becomes NaN-like string so the API rejects it. */
function num(v: FormDataEntryValue | null): number | string {
	if (typeof v !== 'string' || v.trim() === '') return '';
	const n = Number(v);
	return Number.isFinite(n) ? n : v;
}

function failure(r: { status: number; data: { error?: string } | null }, extra: object = {}) {
	return fail(r.status, { error: r.data?.error ?? 'request failed', ...extra });
}

export const load: PageServerLoad = async ({ params, fetch }) => {
	const r = await call(fetch, 'GET', `/api/campaigns/${encodeURIComponent(params.id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'Campaign not found');
	if (!r.ok) error(r.status, 'Could not load campaign');
	return { campaign: r.data };
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
		const tracker = String(form.get('tracker'));
		const id = String(form.get('characterId'));
		if (!TRACKERS.includes(tracker)) return fail(400, { error: 'unknown tracker' });
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
		for (const k of NUMERIC) body[k] = num(form.get(k));
		const r = await call(fetch, 'POST', `/api/campaigns/${encodeURIComponent(params.id)}/characters`, body);
		return r.ok ? { ok: true } : failure(r);
	}
};
