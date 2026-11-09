// Acceptance tests for US-245: the Help popover exception in docs/architecture.md.
// Run from the repository root: node --test tests/acceptance/us-245/docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = process.cwd();
const ARCH = 'docs/architecture.md';
const current = readFileSync(`${root}/${ARCH}`, 'utf8');

// Baseline: the story's base, the merge-base of HEAD and main. CI checks out a shallow clone, where the
// commit that added this story's tests can be the clone's root (no parent), so that lookup cannot be used.
// Falls back to origin/main, then HEAD, when the branch is not a git checkout or the base is not fetched.
function git(args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function baselineRev() {
	for (const ref of ['main', 'origin/main']) {
		try {
			const base = git(['merge-base', 'HEAD', ref]).trim();
			if (base) return base;
		} catch {
			/* ref not present in this checkout: try the next one */
		}
	}
	return 'HEAD';
}
const BASE = baselineRev();
function baseline() {
	return git(['show', `${BASE}:${ARCH}`]);
}

// Split a Markdown file into sections keyed by their heading line ('# Architecture', '## UI patterns', ...).
// The preamble before the first heading is keyed ''.
function sections(text) {
	const out = new Map();
	let key = '';
	let buf = [];
	for (const line of text.split('\n')) {
		if (/^#{1,2} /.test(line)) {
			out.set(key, buf.join('\n'));
			key = line;
			buf = [];
		} else {
			buf.push(line);
		}
	}
	out.set(key, buf.join('\n'));
	return out;
}

const OLD_HELP_BULLET = '- SRD help text is shown through `src/lib/components/Help.svelte` with `lines: Line[]`.';
const OLD_MODAL_END = 'No other dialog implementation.';
const NEW_MODAL_END = 'No other dialog implementation, except help panels below.';
const NEW_INLINE_BULLET_END = 'character edit, and the `<details>` feature lists of scenes, encounters and loot.';

test('criterion 1: the Modal bullet says "No other dialog implementation, except help panels below."', () => {
	assert.ok(
		current.split('\n').some((line) => line.includes(NEW_MODAL_END)),
		`docs/architecture.md must contain the line text "${NEW_MODAL_END}"`,
	);
	const oldSentenceAtEndOfLine = current.split('\n').filter((line) => line.endsWith(OLD_MODAL_END));
	assert.deepEqual(
		oldSentenceAtEndOfLine,
		[],
		`no line may still end with the old sentence "${OLD_MODAL_END}"`,
	);
});

test('criterion 2: the help panel rule names popover="auto", help-open, help-panel, help-close, $props.id() and the size limit', () => {
	for (const term of [
		'popover="auto"',
		'help-open',
		'help-panel',
		'help-close',
		'$props.id()',
		'at most 32rem wide and 80dvh high',
	]) {
		assert.ok(current.includes(term), `docs/architecture.md must contain ${JSON.stringify(term)}`);
	}
});

test('criterion 3: the old SRD help bullet is gone', () => {
	assert.ok(
		!current.split('\n').some((line) => line.trim() === OLD_HELP_BULLET),
		`docs/architecture.md must no longer contain the line: ${OLD_HELP_BULLET}`,
	);
});

test('criterion 4: the inline bullet lists the <details> feature lists of scenes, encounters and loot', () => {
	assert.ok(
		current.includes('the `<details>` feature lists of scenes, encounters and loot'),
		'docs/architecture.md must contain "the `<details>` feature lists of scenes, encounters and loot"',
	);
	assert.ok(
		current.includes(NEW_INLINE_BULLET_END),
		`the inline bullet must end with: ${NEW_INLINE_BULLET_END}`,
	);
});

test('criterion 5: every section outside ## UI patterns is unchanged from the base, and the section order is kept', () => {
	const before = sections(baseline());
	const after = sections(current);
	assert.deepEqual([...after.keys()], [...before.keys()], 'section headings and their order must not change');
	for (const key of before.keys()) {
		if (key === '## UI patterns') continue;
		assert.equal(after.get(key), before.get(key), `section "${key || '(preamble)'}" must be byte-for-byte unchanged`);
	}
	for (const key of ['# Architecture', '## Layers and dependencies', '## SRD content and its translation', '## Data model']) {
		assert.ok(after.has(key), `section "${key}" must still exist`);
	}
});

test('criterion 5: no file under src/ or tests/ is changed (apart from this story\'s own tests)', () => {
	const changed = git(['diff', '--name-only', BASE, '--', 'src', 'tests'])
		.split('\n')
		.filter((f) => f && !f.startsWith('tests/acceptance/us-245/'))
		// us-190's frozen snapshot pins the two lines this story changes; the tester updated it to the us-245 wording.
		.filter((f) => f !== 'tests/acceptance/us-190/architecture.expected.md')
		// us-208's first test pinned the bullet this story replaces; the tester pointed it at the replacement wording.
		.filter((f) => f !== 'tests/acceptance/us-208/docs.test.mjs');
	assert.deepEqual(changed, [], `files changed under src/ or tests/: ${changed.join(', ')}`);
});

test('criterion 6: CLAUDE.md still links to docs/architecture.md', () => {
	const claude = readFileSync(`${root}/CLAUDE.md`, 'utf8');
	assert.ok(claude.includes('](docs/architecture.md)'), 'CLAUDE.md must link to docs/architecture.md');
});

test('criterion 7 (documented rule): every backticked path in docs/architecture.md exists', () => {
	const missing = [];
	for (const [, token] of current.matchAll(/`([^`\s]+)`/g)) {
		if (!/^(src|tests|docs|drizzle|migrations|scripts)\//.test(token)) continue;
		if (/[*{<>]/.test(token)) continue; // globs and placeholders such as <kind>
		const path = token.replace(/\/$/, '');
		if (!existsSync(`${root}/${path}`)) missing.push(token);
	}
	assert.deepEqual(missing, [], `backticked paths that do not exist: ${missing.join(', ')}`);
});
