/** Reads the `id`/`count` pairs of an encounter form. */
export function countsFrom(f: FormData): { id: string; count: number }[] {
	const counts = f.getAll('count');
	return f.getAll('id').map((id, i) => ({ id: String(id).trim(), count: Number(counts[i]) }));
}

/** One step up (below 20) or down (above 1); anything else leaves the count alone. */
export function stepCount(count: number, delta: number): number {
	if (delta === 1 && count < 20) return count + 1;
	if (delta === -1 && count > 1) return count - 1;
	return count;
}
