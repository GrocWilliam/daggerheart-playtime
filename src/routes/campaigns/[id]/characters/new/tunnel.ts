import { TRAITS, classStart, createFields, derivedStats, tierOfLevel, traitsFollowArray } from '../../../../../lib/server/features/characters';
import { getSrd, idByName } from '../../../../../lib/server/features/srd';

export const TUNNEL_STEPS = [
	{ key: 'identity', fields: ['name', 'class', 'level'] },
	{ key: 'heritage', fields: ['ancestry', 'community'] },
	{ key: 'statistics', fields: ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge', 'armorId'] },
	{ key: 'review', fields: [] as string[] }
] as const;

const FIELDS: string[] = TUNNEL_STEPS.flatMap((s) => [...s.fields]);

/** Values a trait select offers (the starting array is +2, +1, +1, +0, +0, -1). */
export const TRAIT_OPTIONS = [2, 1, 0, -1] as const;

export type TunnelValues = Partial<Record<string, string>>;
type Step = 1 | 2 | 3 | 4;

export function parseStep(raw: string | null): Step {
	return raw !== null && /^[1-4]$/.test(raw) ? (Number(raw) as Step) : 1;
}

export function readValues(params: URLSearchParams | FormData): TunnelValues {
	const out: TunnelValues = {};
	for (const f of FIELDS) {
		const v = params.get(f);
		if (typeof v === 'string') out[f] = v;
	}
	return out;
}

/** Strings become numbers as a JSON API body would carry them; blanks and junk become NaN. */
function coerce(field: string, v: string | undefined): unknown {
	if (v === undefined) return undefined;
	if (field !== 'level') return v;
	return v.trim() === '' ? Number.NaN : Number(v);
}

/** A trait value from TRAIT_OPTIONS, or null (blank, junk, out of range). */
function traitValue(v: string | undefined): number | null {
	if (v === undefined || !/^-?\d+$/.test(v.trim())) return null;
	const n = Number(v);
	return (TRAIT_OPTIONS as readonly number[]).includes(n) ? n : null;
}

/** An SRD armor allowed at this level (unarmored when blank). */
function armorOk(armorId: string | undefined, level: number): boolean {
	if (!armorId) return true;
	const a = getSrd('armors', armorId, 'en');
	return !!a && a.baseScore !== undefined && Number(a.tier) <= tierOfLevel(level);
}

function step3Invalid(values: TunnelValues): string | null {
	const traits = TRAITS.map((k) => traitValue(values[k]));
	if (traits.some((v) => v === null) || !traitsFollowArray(traits as number[])) return 'traits';
	if (!armorOk(values.armorId, Number(values.level ?? '1'))) return 'armorId';
	return null;
}

export function firstInvalid(values: TunnelValues, upTo: number): { step: Step; field: string } | null {
	for (let i = 0; i < Math.min(upTo, TUNNEL_STEPS.length); i++) {
		const step = (i + 1) as Step;
		const fields = TUNNEL_STEPS[i].fields as readonly string[];
		if (step === 2) {
			for (const f of fields) {
				const v = values[f];
				if (v && !idByName(f === 'ancestry' ? 'ancestries' : 'communities', v)) return { step, field: f };
			}
			continue;
		}
		if (step === 3) {
			const field = step3Invalid(values);
			if (field) return { step, field };
			continue;
		}
		if (fields.length === 0) continue;
		const shape = Object.fromEntries(fields.map((f) => [f, true])) as Record<string, true>;
		const input = Object.fromEntries(fields.map((f) => [f, coerce(f, values[f])]));
		const r = createFields.pick(shape as never).safeParse(input);
		if (!r.success) {
			const path = r.error.issues[0].path[0];
			return { step, field: typeof path === 'string' ? path : fields[0] };
		}
		if (step === 1 && classStart(values.class ?? '') === null) return { step, field: 'class' };
	}
	return null;
}

export function stepOfField(field: string): Step {
	if (field === 'traits') return 3;
	const i = TUNNEL_STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field));
	return i < 0 ? 4 : ((i + 1) as Step);
}

/** The tunnel field an API 400 message is about: `armorId`, `traits`, or `review` for anything else. */
export function fieldOfMessage(msg: string): string {
	const first = msg.split(' ')[0];
	return first === 'armorId' || first === 'traits' ? first : 'review';
}

export function tunnelHref(id: string, step: number, values: TunnelValues, invalid?: string): string {
	const q = new URLSearchParams({ step: String(step) });
	for (const f of FIELDS) if (values[f]) q.set(f, values[f]!);
	if (invalid) q.set('invalid', invalid);
	return `/campaigns/${encodeURIComponent(id)}/characters/new?${q}`;
}

/** The API's ranges for the numeric fields, as `[min, max]` (kept in sync with `createFields` by tunnel.test.ts). */
export const RANGES: Record<string, readonly [number, number]> = { level: [1, 10] };

/** Values shown when a field is absent from the URL. */
export const DEFAULTS: TunnelValues = { level: '1' };

/** Number for the API; blank stays '' and junk stays a string so the API rejects it. */
function num(v: string | undefined): number | string {
	if (v === undefined || v.trim() === '') return '';
	const n = Number(v);
	return Number.isFinite(n) ? n : v;
}

/** Statistics computed from the class, level and armor; null for an unknown class or a bad level. */
export function tunnelDerived(values: TunnelValues) {
	const level = Number(values.level ?? '1');
	if (!Number.isInteger(level)) return null;
	return derivedStats(values.class ?? '', level, values.armorId || null);
}

/** The `POST /api/campaigns/:id/characters` body: SRD names become ids, stats come from `derivedStats`. */
export function characterBody(values: TunnelValues): Record<string, unknown> {
	const body: Record<string, unknown> = { name: values.name ?? '', class: values.class ?? '', level: num(values.level) };
	for (const k of ['ancestry', 'community'] as const) {
		const id = idByName(k === 'ancestry' ? 'ancestries' : 'communities', values[k] ?? '');
		if (id) body[k] = id;
	}
	Object.assign(body, tunnelDerived(values) ?? {});
	body.traits = Object.fromEntries(TRAITS.map((k) => [k, num(values[k])]));
	if (values.armorId) body.armorId = values.armorId;
	return body;
}
