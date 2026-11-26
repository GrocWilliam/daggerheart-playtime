/** Lowercase and strip accents so "epee" finds "Épée". */
export function fold(s: string): string {
	return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** True when the folded query is empty or appears in the folded name or in any line's text or label. */
export function matches(query: string, name: string, lines: { text: string; label?: string }[]): boolean {
	const q = fold(query);
	if (q === '') return true;
	if (fold(name).includes(q)) return true;
	return lines.some((l) => fold(l.text).includes(q) || (l.label !== undefined && fold(l.label).includes(q)));
}
