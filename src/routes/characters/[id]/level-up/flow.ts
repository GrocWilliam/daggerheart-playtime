import type { LevelUpPlan } from '../../../../lib/server/features/levelup';

export const LEVELUP_STEPS = ['achievements', 'advancements', 'details', 'card', 'review'] as const;

const FIELDS = [
	'newExperience', 'pick1', 'pick2',
	'p1trait1', 'p1trait2', 'p1exp1', 'p1exp2', 'p1card',
	'p2trait1', 'p2trait2', 'p2exp1', 'p2exp2', 'p2card',
	'domainCard'
] as const;

export type FlowValues = Partial<Record<(typeof FIELDS)[number], string>>;
type Step = 1 | 2 | 3 | 4 | 5;

export function parseStep(raw: string | null): Step {
	return raw !== null && /^[1-5]$/.test(raw) ? (Number(raw) as Step) : 1;
}

export function readValues(params: URLSearchParams | FormData): FlowValues {
	const out: FlowValues = {};
	for (const f of FIELDS) {
		const v = params.get(f);
		out[f] = typeof v === 'string' ? v.trim() : '';
	}
	return out;
}

type Pick = { option: string; traits?: string[]; experiences?: string[]; cardId?: string };

export function levelUpBody(values: FlowValues) {
	const v = (k: keyof FlowValues) => values[k] ?? '';
	const advancements: Pick[] = [];
	for (const n of [1, 2] as const) {
		const option = v(`pick${n}`);
		if (!option) continue;
		if (option === 'traits') advancements.push({ option, traits: [v(`p${n}trait1`), v(`p${n}trait2`)] });
		else if (option === 'experiences') advancements.push({ option, experiences: [v(`p${n}exp1`), v(`p${n}exp2`)] });
		else if (option === 'card') advancements.push({ option, cardId: v(`p${n}card`) });
		else advancements.push({ option });
	}
	return {
		...(v('newExperience') ? { newExperience: v('newExperience') } : {}),
		advancements,
		domainCard: v('domainCard')
	};
}

type Invalid = { step: Step; field: string };

function step2(values: FlowValues, plan: LevelUpPlan): string | null {
	const p1 = values.pick1 ?? '';
	const p2 = values.pick2 ?? '';
	const slots = (o: string) => plan.options.find((x) => x.option === o)?.slotsLeft;
	if (slots(p1) === undefined) return 'pick1';
	if (p1 === 'proficiency') return p2 ? 'pick2' : null;
	if (!p2 || p2 === 'proficiency' || slots(p2) === undefined) return 'pick2';
	if (p1 === p2 && (slots(p1) ?? 0) < 2) return 'pick2';
	return null;
}

function step3(values: FlowValues, plan: LevelUpPlan): string | null {
	const get = (k: string) => values[k as keyof FlowValues] ?? '';
	const usedTraits = new Set<string>();
	const cards = new Set(plan.cards.map((c) => c.id));
	for (const n of [1, 2]) {
		const option = get(`pick${n}`);
		if (option === 'traits') {
			const t = [get(`p${n}trait1`), get(`p${n}trait2`)];
			const ok = t.every((x) => (plan.unmarkedTraits as string[]).includes(x) && !usedTraits.has(x)) && t[0] !== t[1];
			if (!ok) return `p${n}trait1`;
			t.forEach((x) => usedTraits.add(x));
		} else if (option === 'experiences') {
			const e = [get(`p${n}exp1`), get(`p${n}exp2`)];
			if (!e[0] || !e[1] || e[0] === e[1]) return `p${n}exp1`;
		} else if (option === 'card') {
			if (!cards.has(get(`p${n}card`))) return `p${n}card`;
		}
	}
	return null;
}

function step4(values: FlowValues, plan: LevelUpPlan): string | null {
	const d = values.domainCard ?? '';
	if (!plan.cards.some((c) => c.id === d)) return 'domainCard';
	for (const n of [1, 2]) {
		if (values[`pick${n}` as 'pick1'] === 'card' && values[`p${n}card` as 'p1card'] === d) return 'domainCard';
	}
	return null;
}

export function firstInvalid(values: FlowValues, plan: LevelUpPlan, upTo: number): Invalid | null {
	const exp = values.newExperience ?? '';
	const checks: (() => string | null)[] = [
		() => (plan.achievements.experience ? (exp.length >= 1 && exp.length <= 100 ? null : 'newExperience') : exp ? 'newExperience' : null),
		() => step2(values, plan),
		() => step3(values, plan),
		() => step4(values, plan)
	];
	for (let i = 0; i < Math.min(upTo, 4); i++) {
		const field = checks[i]();
		if (field) return { step: (i + 1) as Step, field };
	}
	return null;
}

export function stepOfField(field: string): Step {
	if (field === 'newExperience') return 1;
	if (field === 'pick1' || field === 'pick2') return 2;
	if (/^p[12](trait|exp)[12]$|^p[12]card$/.test(field)) return 3;
	if (field === 'domainCard') return 4;
	return 5;
}

export function fieldOfMessage(msg: string): string {
	if (msg.startsWith('newExperience') || msg === 'experience already exists' || msg === 'a character has at most 10 experiences')
		return 'newExperience';
	if (msg === 'advancements must spend exactly two slots' || msg.startsWith('advancement is not available')) return 'pick1';
	if (msg.startsWith('traits must')) return 'p1trait1';
	if (msg.startsWith('experiences must')) return 'p1exp1';
	if (msg.startsWith('cardId')) return 'p1card';
	if (msg.startsWith('domainCard') || msg === 'the two cards must be different') return 'domainCard';
	return 'review';
}

export function levelUpHref(id: string, step: number, values: FlowValues, invalid?: string): string {
	const q = new URLSearchParams({ step: String(step) });
	for (const f of FIELDS) if (values[f]) q.set(f, values[f]!);
	if (invalid) q.set('invalid', invalid);
	return `/characters/${id}/level-up?${q}`;
}
