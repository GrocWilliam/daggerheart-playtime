import { and, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import { characters, experiences } from '../schema';
import { strField } from '../../utils/validation';
import { MAX_EXPERIENCES, TRAITS, armorStats, characterJson, characterSelect, tierOfLevel } from './characters';
import type { Advancement, AdvancementOption, CharacterJson, Trait } from './characters';
import { cardGroups, domainsOfClass, getSrd, idByName } from './srd';

/** The advancement options, in the order of the level-up table. */
export const OPTIONS = ['traits', 'hp', 'stress', 'experiences', 'card', 'evasion', 'subclass', 'proficiency'] as const satisfies readonly AdvancementOption[];

/** Picks of each option per tier, for tiers 2, 3 and 4 (tier 1 has none). */
export const SLOTS: Record<AdvancementOption, [number, number, number]> = {
	traits: [3, 3, 3],
	hp: [2, 2, 2],
	stress: [2, 2, 2],
	experiences: [1, 1, 1],
	card: [1, 1, 1],
	evasion: [1, 1, 1],
	subclass: [0, 1, 1],
	proficiency: [0, 1, 1]
};

/** Advancement entries one pick writes: proficiency takes two slots. */
export const SLOT_COST: Record<AdvancementOption, number> = {
	traits: 1,
	hp: 1,
	stress: 1,
	experiences: 1,
	card: 1,
	evasion: 1,
	subclass: 1,
	proficiency: 2
};

export const MAX_LEVEL = 10;
export const MAX_TRAIT = 5;
export const MAX_EXPERIENCE_MODIFIER = 5;
export const MAX_TRACKER = 12;
export const MAX_EVASION = 30;

export const MAX_LEVEL_ERROR = 'character is already at the maximum level';
export const SRD_CLASS_ERROR = 'class must be an SRD class';

/** The character fields the level-up rules read. */
export type LevelUpCharacter = Pick<
	CharacterJson,
	| 'class'
	| 'level'
	| 'evasion'
	| 'majorThreshold'
	| 'severeThreshold'
	| 'hp'
	| 'stress'
	| 'subclass'
	| 'cards'
	| 'traits'
	| 'armorId'
	| 'advancements'
	| 'markedTraits'
	| 'experiences'
>;

export type EligibleCard = { id: string; name: string; level: number; domain: string };

export type LevelUpPlan = {
	fromLevel: number;
	toLevel: number;
	tier: number;
	achievements: { experience: boolean; proficiency: boolean; clearTraits: boolean };
	options: { option: AdvancementOption; slotsLeft: number; slots: number }[];
	unmarkedTraits: Trait[];
	cards: EligibleCard[];
	subclassNext: 'specialization' | 'mastery' | null;
};

/** Picks of `option` already used at tier `t`. */
function usedPicks(c: Pick<LevelUpCharacter, 'advancements'>, option: AdvancementOption, t: number) {
	const entries = (c.advancements ?? []).filter((a) => a.option === option && a.tier === t).length;
	return entries / SLOT_COST[option];
}

/** Picks of `option` still free over tiers 2..T. */
export function slotsLeft(c: Pick<LevelUpCharacter, 'advancements'>, option: AdvancementOption, T: number) {
	let left = 0;
	for (let t = 2; t <= Math.min(T, 4); t++) left += SLOTS[option][t - 2] - usedPicks(c, option, t);
	return left;
}

/** Damage thresholds at `newLevel`: from the armor, level-based when unarmored at the defaults, else both +1. */
export function thresholdsAfter(
	c: Pick<LevelUpCharacter, 'armorId' | 'level' | 'majorThreshold' | 'severeThreshold'>,
	newLevel: number
) {
	if (c.armorId) {
		const s = armorStats(c.armorId, newLevel);
		return { majorThreshold: s.majorThreshold, severeThreshold: s.severeThreshold };
	}
	if (c.majorThreshold === c.level && c.severeThreshold === 2 * c.level)
		return { majorThreshold: newLevel, severeThreshold: 2 * newLevel };
	return { majorThreshold: c.majorThreshold + 1, severeThreshold: c.severeThreshold + 1 };
}

/** SRD domain cards of the class's domains up to `newLevel`, not held and not in `exclude`. */
export function eligibleCards(
	c: Pick<LevelUpCharacter, 'class' | 'cards'>,
	newLevel: number,
	exclude: string[] = []
): EligibleCard[] {
	const domains = domainsOfClass(c.class, 'en').map((d) => d.id);
	const skip = new Set([...(c.cards ?? []), ...exclude]);
	return cardGroups(c.class, 'en')
		.filter((g) => domains.includes(g.domain))
		.flatMap((g) => g.cards)
		.filter((card) => card.level <= newLevel && !skip.has(card.id))
		.map((card) => ({ id: card.id, name: card.name, level: card.level, domain: card.domain }));
}

const isSrdClass = (name: string) => !!idByName('classes', name);
const isSrdSubclass = (id: string | null) => !!id && !!getSrd('subclasses', id, 'en');

/** What a character may choose when it levels up from N to N+1, or the refusal message. */
export function planLevelUp(c: CharacterJson | LevelUpCharacter): LevelUpPlan | string {
	if (c.level >= MAX_LEVEL) return MAX_LEVEL_ERROR;
	if (!isSrdClass(c.class)) return SRD_CLASS_ERROR;
	const fromLevel = c.level;
	const toLevel = fromLevel + 1;
	const tier = tierOfLevel(toLevel);
	const milestone = [2, 5, 8].includes(toLevel);
	const clearTraits = toLevel === 5 || toLevel === 8;
	const ch = { ...c, markedTraits: clearTraits ? [] : [...(c.markedTraits ?? [])] };

	const unmarkedTraits = TRAITS.filter((t) => !ch.markedTraits.includes(t));
	const cards = eligibleCards(ch, toLevel);
	const subclassEntries = (ch.advancements ?? []).filter((a) => a.option === 'subclass').length;
	const srdSubclass = isSrdSubclass(ch.subclass);

	const applies: Record<AdvancementOption, boolean> = {
		traits: unmarkedTraits.filter((t) => (ch.traits[t] ?? 0) < MAX_TRAIT).length >= 2,
		hp: ch.hp.max < MAX_TRACKER,
		stress: ch.stress.max < MAX_TRACKER,
		experiences:
			(ch.experiences ?? []).filter((e: { modifier: number }) => e.modifier < MAX_EXPERIENCE_MODIFIER).length >= 2,
		card: cards.length >= 1,
		evasion: ch.evasion < MAX_EVASION,
		subclass: srdSubclass && subclassEntries < 2,
		proficiency: true
	};

	const options = OPTIONS.flatMap((option) => {
		const left = slotsLeft(ch, option, tier);
		return left >= 1 && applies[option] ? [{ option, slotsLeft: left, slots: SLOT_COST[option] }] : [];
	});

	return {
		fromLevel,
		toLevel,
		tier,
		achievements: { experience: milestone, proficiency: milestone, clearTraits },
		options,
		unmarkedTraits,
		cards,
		subclassNext: !srdSubclass ? null : subclassEntries === 0 ? 'specialization' : subclassEntries === 1 ? 'mastery' : null
	};
}

// ---------------------------------------------------------------------------
// Level-up body: validation (checkLevelUp) and effects (applyLevelUp).

export const SLOTS_ERROR = 'advancements must spend exactly two slots';
export const TRAITS_ERROR = 'traits must be two different unmarked traits';
export const EXPERIENCES_ERROR = 'experiences must be two different experiences of this character';
export const CARD_ERROR = 'cardId is not an eligible card';
export const DOMAIN_CARD_ERROR = 'domainCard is not an eligible card';
export const SAME_CARDS_ERROR = 'the two cards must be different';
export const notAvailable = (option: unknown) => `advancement is not available: ${String(option)}`;

const pickSchema = z.object({
	option: z.enum(OPTIONS, { error: (iss) => notAvailable(iss.input) }),
	traits: z.array(z.string()).optional(),
	experiences: z.array(z.string()).optional(),
	cardId: z.string().optional()
});

export const levelUpBodySchema = z.object({
	newExperience: strField('newExperience', 1, 100).optional(),
	advancements: z
		.array(pickSchema, { error: SLOTS_ERROR })
		.min(1, { error: SLOTS_ERROR })
		.max(2, { error: SLOTS_ERROR }),
	domainCard: z.string({ error: 'domainCard must be a string' })
});
export type LevelUpBody = z.infer<typeof levelUpBodySchema>;
export type LevelUpPick = LevelUpBody['advancements'][number];

export type Stats = {
	level: number;
	proficiency: number;
	hpMax: number;
	stressMax: number;
	evasion: number;
	majorThreshold: number;
	severeThreshold: number;
	traits: Record<Trait, number>;
	experiences: { id: string; name: string; modifier: number }[];
};

export type LevelUpSet = {
	level: number;
	agility: number;
	strength: number;
	finesse: number;
	instinct: number;
	presence: number;
	knowledge: number;
	markedTraits: Trait[];
	hpMax: number;
	stressMax: number;
	evasion: number;
	proficiency: number;
	majorThreshold: number;
	severeThreshold: number;
	cards: string[];
	advancements: Advancement[];
};

export type LevelUpResult = {
	set: LevelUpSet;
	newExperience?: { name: string; modifier: 2 };
	bumpExperiences: string[];
	before: Stats;
	after: Stats;
};

type LevelUpSource = LevelUpCharacter & Pick<CharacterJson, 'proficiency'>;
type Experience = { id: string; name: string; modifier: number };

/** Mutable state a level-up's picks are applied to, one after the other. */
type State = {
	hpMax: number;
	stressMax: number;
	evasion: number;
	traits: Record<Trait, number>;
	markedTraits: Trait[];
	experiences: Experience[];
	advancements: Advancement[];
};

const isTrait = (t: unknown): t is Trait => (TRAITS as readonly unknown[]).includes(t);

function context(c: LevelUpCharacter) {
	const toLevel = c.level + 1;
	const clearTraits = toLevel === 5 || toLevel === 8;
	const state: State = {
		hpMax: c.hp.max,
		stressMax: c.stress.max,
		evasion: c.evasion,
		traits: Object.fromEntries(TRAITS.map((t) => [t, Number(c.traits?.[t] ?? 0)])) as Record<Trait, number>,
		markedTraits: clearTraits ? [] : [...(c.markedTraits ?? [])],
		experiences: ((c.experiences ?? []) as Experience[]).map((e) => ({
			id: e.id,
			name: e.name,
			modifier: e.modifier
		})),
		advancements: [...(c.advancements ?? [])]
	};
	return {
		toLevel,
		tier: tierOfLevel(toLevel),
		milestone: [2, 5, 8].includes(toLevel),
		clearTraits,
		state
	};
}

/** Lowest tier 2..T with a free pick of `option`, or null. */
function freeTier(s: Pick<State, 'advancements'>, option: AdvancementOption, T: number) {
	for (let t = 2; t <= Math.min(T, 4); t++) if (SLOTS[option][t - 2] - usedPicks(s, option, t) >= 1) return t;
	return null;
}

/** Applies one pick's effect to the state (only valid names count) and records its entries. */
function applyPick(s: State, p: LevelUpPick, toLevel: number, T: number) {
	const tier = freeTier(s, p.option, T) ?? T;
	for (let i = 0; i < SLOT_COST[p.option]; i++) s.advancements.push({ level: toLevel, tier, option: p.option });
	if (p.option === 'hp') s.hpMax++;
	if (p.option === 'stress') s.stressMax++;
	if (p.option === 'evasion') s.evasion++;
	if (p.option === 'traits')
		for (const t of p.traits ?? [])
			if (isTrait(t)) {
				s.traits[t]++;
				if (!s.markedTraits.includes(t)) s.markedTraits.push(t);
			}
	if (p.option === 'experiences')
		for (const id of p.experiences ?? []) {
			const e = s.experiences.find((x) => x.id === id);
			if (e) e.modifier++;
		}
}

/**
 * Whether `option` can still apply its effect to the state. Traits, experiences and cards are refused by their own
 * messages (checks 7 to 10), so only their slots count here.
 */
function applies(s: State, c: LevelUpCharacter, option: AdvancementOption) {
	switch (option) {
		case 'hp':
			return s.hpMax < MAX_TRACKER;
		case 'stress':
			return s.stressMax < MAX_TRACKER;
		case 'evasion':
			return s.evasion < MAX_EVASION;
		case 'subclass':
			return isSrdSubclass(c.subclass) && s.advancements.filter((a) => a.option === 'subclass').length < 2;
		default:
			return true;
	}
}

/** The first refusal message for this level-up body, or null when it can be applied. */
export function checkLevelUp(c: CharacterJson | LevelUpCharacter, body: LevelUpBody): string | null {
	if (c.level >= MAX_LEVEL) return MAX_LEVEL_ERROR;
	if (!isSrdClass(c.class)) return SRD_CLASS_ERROR;
	const { toLevel, tier, milestone, state } = context(c);
	if (milestone && body.newExperience === undefined) return 'newExperience is required at this level';
	if (!milestone && body.newExperience !== undefined) return 'newExperience is not allowed at this level';
	const picks = body.advancements ?? [];
	if (picks.reduce((n, p) => n + (SLOT_COST[p.option] ?? 0), 0) !== 2) return SLOTS_ERROR;

	const eligibleIds = new Set(eligibleCards(c, toLevel).map((e) => e.id));

	// 6. Availability, each pick against the state after the earlier ones.
	const s = structuredClone(state);
	for (const p of picks) {
		if (!OPTIONS.includes(p.option)) return notAvailable(p.option);
		if (slotsLeft(s, p.option, tier) < 1 || !applies(s, c, p.option)) return notAvailable(p.option);
		applyPick(s, p, toLevel, tier);
	}

	// 7. Traits: two different, unmarked, below the maximum; two picks share none.
	const marked = new Set(state.markedTraits);
	for (const p of picks.filter((x) => x.option === 'traits')) {
		const ts = p.traits ?? [];
		const ok =
			ts.length === 2 &&
			ts[0] !== ts[1] &&
			ts.every((t) => isTrait(t) && !marked.has(t) && state.traits[t] < MAX_TRAIT);
		if (!ok) return TRAITS_ERROR;
		ts.forEach((t) => marked.add(t as Trait));
	}

	// 8. Experiences: two different ids of this character, below the maximum; two picks share none.
	const used = new Set<string>();
	for (const p of picks.filter((x) => x.option === 'experiences')) {
		const ids = p.experiences ?? [];
		const ok =
			ids.length === 2 &&
			ids[0] !== ids[1] &&
			ids.every((id) => {
				const e = state.experiences.find((x) => x.id === id);
				return !!e && !used.has(id) && e.modifier < MAX_EXPERIENCE_MODIFIER;
			});
		if (!ok) return EXPERIENCES_ERROR;
		ids.forEach((id) => used.add(id));
	}

	// 9–11. Cards.
	const cardIds: string[] = [];
	for (const p of picks.filter((x) => x.option === 'card')) {
		if (!p.cardId || !eligibleIds.has(p.cardId) || cardIds.includes(p.cardId)) return CARD_ERROR;
		cardIds.push(p.cardId);
	}
	if (!eligibleIds.has(body.domainCard)) return DOMAIN_CARD_ERROR;
	if (cardIds.includes(body.domainCard)) return SAME_CARDS_ERROR;
	return null;
}

function stats(
	level: number,
	proficiency: number,
	s: Pick<State, 'hpMax' | 'stressMax' | 'evasion' | 'traits' | 'experiences'>,
	t: { majorThreshold: number; severeThreshold: number }
): Stats {
	return {
		level,
		proficiency,
		hpMax: s.hpMax,
		stressMax: s.stressMax,
		evasion: s.evasion,
		majorThreshold: t.majorThreshold,
		severeThreshold: t.severeThreshold,
		traits: { ...s.traits },
		experiences: s.experiences.map((e) => ({ ...e }))
	};
}

/** The effects of a level-up body that passed `checkLevelUp`: new column values and before/after stats. */
export function applyLevelUp(c: CharacterJson | LevelUpSource, body: LevelUpBody): LevelUpResult {
	const { toLevel, tier, milestone, state } = context(c);
	const before = stats(
		c.level,
		c.proficiency,
		{
			...state,
			traits: { ...state.traits },
			experiences: structuredClone(state.experiences)
		},
		c
	);
	const s = structuredClone(state);
	const picks = body.advancements ?? [];
	for (const p of picks) applyPick(s, p, toLevel, tier);

	const proficiency = c.proficiency + picks.filter((p) => p.option === 'proficiency').length + (milestone ? 1 : 0);
	const thresholds = thresholdsAfter(c, toLevel);
	const cards = [
		...(c.cards ?? []),
		...picks.flatMap((p) => (p.option === 'card' && p.cardId ? [p.cardId] : [])),
		body.domainCard
	];
	const bumpExperiences = picks.flatMap((p) => (p.option === 'experiences' ? (p.experiences ?? []) : []));

	return {
		set: {
			level: toLevel,
			...s.traits,
			markedTraits: s.markedTraits,
			hpMax: s.hpMax,
			stressMax: s.stressMax,
			evasion: s.evasion,
			proficiency,
			...thresholds,
			cards,
			advancements: s.advancements
		},
		...(milestone && body.newExperience !== undefined
			? { newExperience: { name: body.newExperience, modifier: 2 as const } }
			: {}),
		bumpExperiences,
		before,
		after: stats(toLevel, proficiency, s, thresholds)
	};
}

// ---------------------------------------------------------------------------
// Level-up transaction.

export const MAX_EXPERIENCES_ERROR = 'a character has at most 10 experiences';
export const DUPLICATE_EXPERIENCE_ERROR = 'experience already exists';

/** The new Experience's refusal under the existing Experience rules (at most 10, unique name ignoring case and spaces). */
export function newExperienceError(existing: { name: string }[], name: string | undefined): string | null {
	if (name === undefined) return null;
	if (existing.length >= MAX_EXPERIENCES) return MAX_EXPERIENCES_ERROR;
	const key = name.trim().toLowerCase();
	if (existing.some((e) => e.name.trim().toLowerCase() === key)) return DUPLICATE_EXPERIENCE_ERROR;
	return null;
}

export type LevelUpOutcome =
	| { status: 'ok'; character: CharacterJson }
	| { status: 'not-found' }
	| { status: 'invalid'; error: string };

/** Levels the character up by one, all or nothing, under a row lock on the character. */
export async function levelUp(id: string, body: LevelUpBody): Promise<LevelUpOutcome> {
	const { getDrizzle } = await import('../db');
	const db = await getDrizzle();
	return db.transaction(async (tx) => {
		const [row] = await tx.select(characterSelect).from(characters).where(eq(characters.id, id)).for('update');
		if (!row) return { status: 'not-found' as const };
		const cur = characterJson(row) as CharacterJson;
		const refusal = checkLevelUp(cur, body) ?? newExperienceError(cur.experiences ?? [], body.newExperience);
		if (refusal) return { status: 'invalid' as const, error: refusal };

		const r = applyLevelUp(cur, body);
		await tx.update(characters).set(r.set).where(eq(characters.id, id));
		if (r.newExperience) await tx.insert(experiences).values({ characterId: id, ...r.newExperience });
		for (const expId of r.bumpExperiences)
			await tx
				.update(experiences)
				.set({ modifier: sql`${experiences.modifier} + 1` })
				.where(and(eq(experiences.id, expId), eq(experiences.characterId, id)));
		const [after] = await tx.select(characterSelect).from(characters).where(eq(characters.id, id));
		return { status: 'ok' as const, character: characterJson(after) as CharacterJson };
	});
}
