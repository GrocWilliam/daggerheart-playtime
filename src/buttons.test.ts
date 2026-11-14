import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const VARIANTS = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger'];
const TERNARY = /\?\s*(['"`])([^'"`]*)\1\s*:\s*(['"`])([^'"`]*)\3/;

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? svelteFiles(join(dir, e.name)) : e.name.endsWith('.svelte') ? [join(dir, e.name)] : []
	);
}

/** Every reading of a class text once each `a ? 'x' : 'y'` has been replaced by one of its branches. */
export function readings(text: string): string[] {
	const m = TERNARY.exec(text);
	if (!m) return [text];
	const head = text.slice(0, m.index);
	const tail = text.slice(m.index + m[0].length);
	return [m[2], m[4]].flatMap((branch) => readings(`${head} ${branch} ${tail}`));
}

export function variantCount(text: string): number[] {
	return readings(text).map((r) => VARIANTS.filter((v) => new RegExp(`(?<![\\w-])${v}(?![\\w-])`).test(r)).length);
}

/** Finds `<button ...>` start tags, skipping braces and quotes inside attribute values. */
export function buttonTags(src: string): { tag: string; line: number }[] {
	const out: { tag: string; line: number }[] = [];
	const re = /<button(?=[\s>])/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src))) {
		let i = m.index + 7;
		let depth = 0;
		let quote = '';
		for (; i < src.length; i++) {
			const c = src[i];
			if (quote) {
				if (c === quote) quote = '';
			} else if (c === '"' || c === "'" || c === '`') quote = c;
			else if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '>' && depth <= 0) break;
		}
		out.push({ tag: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
	}
	return out;
}

function classText(tag: string): string {
	const m = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\}(?=\s|>|\/))/.exec(tag);
	return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

describe('button variants', () => {
	it('every <button> has exactly one btn-* variant', () => {
		const bad: string[] = [];
		for (const file of svelteFiles('src')) {
			for (const { tag, line } of buttonTags(readFileSync(file, 'utf8'))) {
				if (!variantCount(classText(tag)).every((n) => n === 1))
					bad.push(`${file}:${line} needs exactly one of ${VARIANTS.join(', ')}`);
			}
		}
		expect(bad, bad.join('\n')).toEqual([]);
	});

	it('detects missing, double and ternary classes', () => {
		expect(variantCount('')).toEqual([0]);
		expect(variantCount('btn-primary btn-ghost')).toEqual([2]);
		expect(variantCount("btn-danger p-2")).toEqual([1]);
		expect(variantCount("[a ? 'btn-primary x' : 'btn-ghost', 'min-h-11']")).toEqual([1, 1]);
		expect(variantCount("[a ? 'btn-primary' : 'x']")).toEqual([1, 0]);
	});
});
