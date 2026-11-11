/** The four character trackers, in display order. */
export const TRACKERS = ['hp', 'stress', 'hope', 'armor'] as const;

/** Tracker props from a character value: Hope is a plain number out of 6, the others are `{ marked, max }`. */
export const trackerValues = (v: number | { marked: number; max: number }) =>
	typeof v === 'number'
		? { value: `${v}`, filled: v, max: 6 }
		: { value: `${v.marked}/${v.max}`, filled: v.marked, max: v.max };
