// US-248: docs/architecture.md equals the story's content (copy kept in us-190/architecture.expected.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const normalize = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\s+$/, '');
const actual = normalize(read(path.join(ROOT, 'docs/architecture.md')));
const expected = normalize(read(path.join(ROOT, 'tests/acceptance/us-190/architecture.expected.md')));

test('docs/architecture.md has the Character rules section', () => {
	assert.match(actual, /^## Character rules$/m);
});
test('docs/architecture.md equals exactly the content given in the story', () => {
	assert.ok(expected.includes('## Character rules'), 'expected copy lacks the section (test bug)');
	assert.equal(actual, expected);
});
test('CLAUDE.md still links docs/architecture.md', () => {
	assert.match(read(path.join(ROOT, 'CLAUDE.md')), /\]\((\.\/)?docs\/architecture\.md\)/);
});
