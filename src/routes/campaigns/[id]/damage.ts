export type DamageType = 'PHYSICAL' | 'MAGICAL' | 'PHYSICAL_OR_MAGICAL';

/** "1d12+2 phy" split into dice and the `damage.*` catalog key suffix. */
export function splitDamage(d: string): { dice: string; type: DamageType | null } {
	const m = /^(\S+)\s+(phy|mag)(?:\/(phy|mag))?/i.exec(d.trim());
	if (!m) return { dice: d, type: null };
	const first = m[2].toLowerCase();
	const second = m[3]?.toLowerCase();
	if (second && second !== first) return { dice: m[1], type: 'PHYSICAL_OR_MAGICAL' };
	return { dice: m[1], type: first === 'phy' ? 'PHYSICAL' : 'MAGICAL' };
}
