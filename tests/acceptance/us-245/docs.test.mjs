// Acceptance tests for US-245: the Help popover exception in docs/architecture.md.
// Run from the repository root: node --test tests/acceptance/us-245/docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = process.cwd();
const ARCH = 'docs/architecture.md';

// US-254 deliberately replaced docs/architecture.md (and changed src/), so criteria 1-5 check what the #245 commit
// itself delivered: its version of the file, and its diff against its parent. They are skipped when that commit
// (or its parent) is not in the checkout, e.g. a shallow clone. Criteria 6-7 still check the current files.
function git(args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function tryGit(args) {
	try {
		return git(args);
	} catch {
		return null;
	}
}
const SHA = (tryGit(['log', '--format=%H', '--grep=(#245)', '-n', '1', 'HEAD']) ?? '').trim() || null;
const PARENT = SHA ? (tryGit(['rev-parse', '--verify', '-q', `${SHA}^`]) ?? '').trim() || null : null;
const current = SHA ? tryGit(['show', `${SHA}:${ARCH}`]) : null;
const now = readFileSync(`${root}/${ARCH}`, 'utf8');
const noCommit = current === null ? 'the #245 commit is not in this checkout' : false;
const noParent = PARENT === null ? 'the parent of the #245 commit is not in this checkout' : false;
function baseline() {
	return git(['show', `${PARENT}:${ARCH}`]);
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

test('criterion 1: the Modal bullet says "No other dialog implementation, except help panels below."', { skip: noCommit }, () => {
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

test('criterion 2: the help panel rule names popover="auto", help-open, help-panel, help-close, $props.id() and the size limit', { skip: noCommit }, () => {
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

test('criterion 3: the old SRD help bullet is gone', { skip: noCommit }, () => {
	assert.ok(
		!current.split('\n').some((line) => line.trim() === OLD_HELP_BULLET),
		`docs/architecture.md must no longer contain the line: ${OLD_HELP_BULLET}`,
	);
});

test('criterion 4: the inline bullet lists the <details> feature lists of scenes, encounters and loot', { skip: noCommit }, () => {
	assert.ok(
		current.includes('the `<details>` feature lists of scenes, encounters and loot'),
		'docs/architecture.md must contain "the `<details>` feature lists of scenes, encounters and loot"',
	);
	assert.ok(
		current.includes(NEW_INLINE_BULLET_END),
		`the inline bullet must end with: ${NEW_INLINE_BULLET_END}`,
	);
});

test('criterion 5: every section outside ## UI patterns is unchanged from the base, and the section order is kept', { skip: noCommit || noParent }, () => {
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

test('criterion 5: no file under src/ or tests/ is changed (apart from this story\'s own tests)', { skip: noCommit || noParent }, () => {
	const changed = git(['diff', '--name-only', PARENT, SHA, '--', 'src', 'tests'])
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

// us-281 documents the level-up rules before their code exists: this one planned path is exempt until its story adds it.
const PLANNED_PATHS = new Set(['src/lib/server/features/levelup.ts']);

test('criterion 7 (documented rule): every backticked path in docs/architecture.md exists', () => {
	const missing = [];
	for (const [, token] of now.matchAll(/`([^`\s]+)`/g)) {
		if (!/^(src|tests|docs|drizzle|migrations|scripts)\//.test(token)) continue;
		if (/[*{<>]/.test(token)) continue; // globs and placeholders such as <kind>
		const path = token.replace(/\/$/, '');
		if (PLANNED_PATHS.has(path)) continue;
		if (!existsSync(`${root}/${path}`)) missing.push(token);
	}
	assert.deepEqual(missing, [], `backticked paths that do not exist: ${missing.join(', ')}`);
});
