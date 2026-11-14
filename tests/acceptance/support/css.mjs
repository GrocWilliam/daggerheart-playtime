// Reads src/app.css and src as text, split into rules. No expected values here.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../../', import.meta.url).pathname;
export const appCss = () => readFileSync(join(ROOT, 'src/app.css'), 'utf8');
export const lineCount = (text) => text.replace(/\n$/, '').split('\n').length;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat list of style rules: { selector, body, layers: [...enclosing @layer names], line } (at-rules like @media are walked through). */
export const rules = (css) => {
	const src = stripComments(css);
	const out = [];
	const walk = (text, layers) => {
		let i = 0;
		while (i < text.length) {
			const open = text.indexOf('{', i);
			if (open < 0) break;
			const semi = text.indexOf(';', i);
			if (semi >= 0 && semi < open) { i = semi + 1; continue; } // statement at-rule such as @import
			let depth = 1, j = open + 1;
			while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
			const head = text.slice(i, open).trim();
			const body = text.slice(open + 1, j - 1);
			if (head.startsWith('@layer')) walk(body, [...layers, head.slice(6).trim()]);
			else if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, layers);
			else if (head.startsWith('@theme')) { /* tokens */ }
			else out.push({ selector: head, body, layers });
			i = j;
		}
	};
	walk(src, []);
	return out;
};

/** Lines of the raw file that hold a whole rule for `selector` on one line. */
export const oneLineRules = (css, selector) => css.split('\n').filter((l) => l.trim().startsWith(selector) && /\{.*\}/.test(l));

/** Every file under src whose text contains `needle`. */
export const srcFilesContaining = (needle) => {
	const found = [];
	const walk = (dir) => {
		for (const f of readdirSync(dir)) {
			const p = join(dir, f);
			if (statSync(p).isDirectory()) walk(p);
			else if (readFileSync(p, 'utf8').includes(needle)) found.push(p.slice(ROOT.length));
		}
	};
	walk(join(ROOT, 'src'));
	return found;
};
