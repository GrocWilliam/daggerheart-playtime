import * as z from 'zod';

/** Trimmed string field; every rejection carries the field's exact legacy message. */
export function strField(field: string, min: number, max: number) {
	const range = { error: `${field} must be ${min} to ${max} characters` };
	return z
		.string({ error: `${field} must be a string` })
		.trim()
		.min(min, range)
		.max(max, range);
}

/** Integer field in [min, max] with one message for every rejection. */
export function intField(field: string, min: number, max: number) {
	const error = `${field} must be an integer from ${min} to ${max}`;
	return z
		.number({ error })
		.refine((n) => Number.isInteger(n) && n >= min && n <= max, { error });
}

/** Safe-integer field with no range (deltas, amounts). */
export function safeIntField(field: string) {
	const error = `${field} must be an integer`;
	return z.number({ error }).refine(Number.isSafeInteger, { error });
}

/** Strict JSON-object body for schemas that reject other shapes. */
export const OBJECT_ERROR = 'body must be a JSON object';

/** A route param (campaign, character, item or card id): any non-empty string without NUL (which SQL rejects). */
export const idSchema = z
	.string({ error: 'invalid id' })
	.min(1, { error: 'invalid id' })
	.refine((s) => !s.includes('\0'), { error: 'invalid id' });
