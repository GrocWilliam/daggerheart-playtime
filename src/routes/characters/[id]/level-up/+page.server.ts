import { error, fail, redirect } from '@sveltejs/kit';
import { cardGroups, subclassStageText } from '$lib/server/features/srd';
import { applyLevelUp, type LevelUpBody, type LevelUpPlan } from '$lib/server/features/levelup';
import type { Lang } from '$lib/i18n';
import { LEVELUP_STEPS, fieldOfMessage, firstInvalid, levelUpBody, levelUpHref, parseStep, readValues, stepOfField } from './flow';
type Actions = import('./$types').Actions;
type PageServerLoad = import('./$types').PageServerLoad;

const FIELDS = [
	'newExperience', 'pick1', 'pick2',
	'p1trait1', 'p1trait2', 'p1exp1', 'p1exp2', 'p1card',
	'p2trait1', 'p2trait2', 'p2exp1', 'p2exp2', 'p2card',
	'domainCard', 'review'
];

async function call(fetchFn: typeof fetch, method: string, path: string, body?: unknown) {
	const res = await fetchFn(path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await res.json().catch(() => null);
	return { ok: res.ok, status: res.status, data };
}

const enc = encodeURIComponent;

/** The character and its plan, or a redirect to the sheet (400: no level-up possible) or a 404. */
async function loadPlan(fetchFn: typeof fetch, id: string) {
	const r = await call(fetchFn, 'GET', `/api/characters/${enc(id)}`);
	if (r.status === 404 || r.status === 400) error(404, 'not found');
	if (!r.ok) error(r.status, 'load failed');
	const p = await call(fetchFn, 'GET', `/api/characters/${enc(id)}/level-up`);
	if (p.status === 400) redirect(303, `/characters/${enc(id)}`);
	if (p.status === 404) error(404, 'not found');
	if (!p.ok) error(p.status, 'load failed');
	return { character: r.data, plan: p.data as LevelUpPlan };
}

/** The plan's eligible cards in the page language, grouped by domain (same order as `cardGroups`). */
function cardOptions(className: string, plan: LevelUpPlan, lang: Lang) {
	const ids = new Set(plan.cards.map((c) => c.id));
	return cardGroups(className, lang)
		.map((g) => ({
			domain: g.domain,
			label: g.label,
			cards: g.cards.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, name: c.name, nameLang: c.nameLang, level: c.level }))
		}))
		.filter((g) => g.cards.length > 0);
}

export const load: PageServerLoad = async ({ params, fetch, locals, url }) => {
	const lang: Lang = locals?.lang ?? 'en';
	const { character, plan } = await loadPlan(fetch, params.id);
	const step = parseStep(url.searchParams.get('step'));
	const values = readValues(url.searchParams);
	const bad = firstInvalid(values, plan, step - 1);
	if (bad) redirect(303, levelUpHref(params.id, bad.step, values, bad.field));
	const invalid = url.searchParams.get('invalid');
	const result = step === 5 ? applyLevelUp(character, levelUpBody(values) as LevelUpBody) : null;
	const groups = step >= 3 ? cardOptions(String(character.class), plan, lang) : [];
	const cardName = (id: string) => groups.flatMap((g) => g.cards).find((c) => c.id === id);
	return {
		character: { id: String(character.id), name: String(character.name) },
		step,
		steps: LEVELUP_STEPS,
		plan,
		values,
		invalid: invalid !== null && FIELDS.includes(invalid) ? invalid : null,
		// hrefs[k] is step k with the current values (index 0 unused).
		hrefs: [0, 1, 2, 3, 4, 5].map((k) => levelUpHref(params.id, k, values)),
		experiences: ((character.experiences ?? []) as { id: string; name: string; modifier: number }[]).map((e) => ({
			id: e.id,
			name: e.name,
			modifier: e.modifier
		})),
		cardGroups: groups,
		subclass:
			step === 3 && plan.subclassNext ? subclassStageText(character.subclass, plan.subclassNext, lang) : null,
		review: result
			? {
					before: result.before,
					after: result.after,
					newExperience: result.newExperience?.name ?? null,
					newCards: result.set.cards.slice((character.cards ?? []).length).flatMap((id) => {
						const c = cardName(id);
						return c ? [{ id, name: c.name, nameLang: c.nameLang }] : [];
					})
				}
			: null
	};
};

export const actions: Actions = {
	default: async ({ request, params, fetch }) => {
		const values = readValues(await request.formData());
		const { plan } = await loadPlan(fetch, params.id);
		const bad = firstInvalid(values, plan, 4);
		if (bad) redirect(303, levelUpHref(params.id, bad.step, values, bad.field));
		const r = await call(fetch, 'POST', `/api/characters/${enc(params.id)}/level-up`, levelUpBody(values));
		if (r.ok) redirect(303, `/characters/${enc(params.id)}`);
		if (r.status === 400) {
			const f = fieldOfMessage(String(r.data?.error ?? ''));
			redirect(303, levelUpHref(params.id, stepOfField(f), values, f));
		}
		const status = r.status >= 400 ? r.status : 500;
		return fail(status, { error: status === 404 ? 'error.notFound' : 'error.server' });
	}
};
