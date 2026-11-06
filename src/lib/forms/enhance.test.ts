import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pages = ['src/routes/+page.svelte', 'src/routes/campaigns/[id]/+page.svelte', 'src/routes/characters/[id]/+page.svelte'];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

describe('use:enhance', () => {
	it.each(pages)('every POST form in %s is enhanced', (file) => {
		const forms = readFileSync(file, 'utf8').match(/<form\b[^<]*?>/gs)?.filter((f) => /method="POST"/.test(f)) ?? [];
		expect(forms.length).toBeGreaterThan(0);
		for (const f of forms) expect(f).toContain('use:enhance');
	});

	it('never opts out of client-side navigation', () => {
		for (const f of walk('src').filter((p) => !p.endsWith('enhance.test.ts')))
			expect(readFileSync(f, 'utf8')).not.toContain(['data', 'sveltekit', 'reload'].join('-'));
	});
});
