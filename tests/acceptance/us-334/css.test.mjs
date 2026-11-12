import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appCss, lineCount, rules, oneLineRules, srcFilesContaining } from '../support/css.mjs';

test('app.css has fewer than 150 lines', () => {
	assert.ok(lineCount(appCss()) < 150, `${lineCount(appCss())} lines`);
});

test('app.css has @layer components with the four .btn-* rules, each on one line', () => {
	const css = appCss();
	assert.match(css, /@layer\s+components\s*\{/);
	const layered = rules(css).filter((r) => r.layers.includes('components'));
	for (const v of ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger']) {
		assert.ok(layered.some((r) => r.selector.split(',').some((s) => s.trim() === `.${v}`)), `.${v} in @layer components`);
		assert.ok(oneLineRules(css, `.${v}`).length >= 1, `.${v} rule on one line`);
	}
});

test('no unlayered rule sets background-color on button', () => {
	const offending = rules(appCss()).filter((r) => r.layers.length === 0
		&& r.selector.split(',').some((s) => /(^|[\s>+~(])button(?![\w-])/.test(s.trim()))
		&& /(^|[;\s])background(-color)?\s*:/.test(r.body));
	assert.deepEqual(offending.map((r) => r.selector), []);
});

test('src contains no color-mix(', () => {
	assert.deepEqual(srcFilesContaining('color-mix('), []);
});
