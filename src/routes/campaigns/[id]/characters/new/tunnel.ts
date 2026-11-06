import { createFields, THRESHOLDS_ERROR, thresholdsOk } from '../../../../../lib/server/features/characters';
import { idByName } from '../../../../../lib/server/features/srd';

export const TUNNEL_STEPS = [
	{ key: 'identity', fields: ['name', 'class', 'level'] },
	{ key: 'heritage', fields: ['ancestry', 'community'] },
	{ key: 'statistics', fields: ['evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots'] },
	{ key: 'review', fields: [] as string[] }
] as const;

const FIELDS: string[] = TUNNEL_STEPS.flatMap((s) => [...s.fields]);
const NUMERIC = new Set(['level', 'evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots']);

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
	if (!NUMERIC.has(field)) return v;
	return v.trim() === '' ? Number.NaN : Number(v);
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
		if (fields.length === 0) continue;
		const shape = Object.fromEntries(fields.map((f) => [f, true])) as Record<string, true>;
		const input = Object.fromEntries(fields.map((f) => [f, coerce(f, values[f])]));
		const r = createFields.pick(shape as never).safeParse(input);
		if (!r.success) {
			const path = r.error.issues[0].path[0];
			return { step, field: typeof path === 'string' ? path : fields[0] };
		}
		if (step === 3 && !thresholdsOk(Number(values.majorThreshold), Number(values.severeThreshold))) {
			return { step, field: 'severeThreshold' };
		}
	}
	return null;
}

export function stepOfField(field: string): Step {
	const i = TUNNEL_STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field));
	return i < 0 ? 4 : ((i + 1) as Step);
}

export function fieldOfMessage(msg: string): string | null {
	if (msg === THRESHOLDS_ERROR) return 'severeThreshold';
	const first = msg.split(' ')[0];
	return FIELDS.includes(first) ? first : null;
}

export function tunnelHref(id: string, step: number, values: TunnelValues, invalid?: string): string {
	const q = new URLSearchParams({ step: String(step) });
	for (const f of FIELDS) if (values[f]) q.set(f, values[f]!);
	if (invalid) q.set('invalid', invalid);
	return `/campaigns/${encodeURIComponent(id)}/characters/new?${q}`;
}
