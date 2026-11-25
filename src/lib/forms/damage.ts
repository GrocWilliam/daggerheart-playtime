import { translate, formatNumber, type Lang } from '../i18n/index.ts';

function num(v: FormDataEntryValue | null): number | string {
	if (typeof v !== 'string' || v.trim() === '') return '';
	const n = Number(v);
	return Number.isFinite(n) ? n : v;
}

/** API body of the damage forms: a non-empty `quick` (severity button) wins over `amount`. */
export function damageBody(form: FormData): { amount: number | string; useArmor: boolean } {
	const quick = form.get('quick');
	const raw = typeof quick === 'string' && quick.trim() !== '' ? quick : form.get('amount');
	return { amount: num(raw), useArmor: form.get('useArmor') !== null };
}

export type DamageResult = { name: string; hpHit: number; armorUsed: boolean };

/** The damage API's answer as a result line (null when it has no usable character). */
export function damageResult(data: unknown): DamageResult | null {
	const d = data as { hpMarked?: unknown; armorUsed?: unknown; character?: { name?: unknown } } | null;
	if (!d || typeof d.hpMarked !== 'number' || typeof d.character?.name !== 'string') return null;
	return { name: d.character.name, hpHit: d.hpMarked, armorUsed: d.armorUsed === true };
}

/** `?hit=2&armor=1` of the sheet's no-JS redirect; null unless `hit` is an integer 0..3. */
export function parseDamageQuery(url: URL, name: string): DamageResult | null {
	const hit = url.searchParams.get('hit');
	if (hit === null || !/^[0-3]$/.test(hit)) return null;
	return { name, hpHit: Number(hit), armorUsed: url.searchParams.get('armor') === '1' };
}

export function damageText(lang: Lang, r: DamageResult): string {
	return translate(lang, r.armorUsed ? 'damage.resultArmor' : 'damage.result', { name: r.name, hp: formatNumber(lang, r.hpHit) });
}
