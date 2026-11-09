// US-254 criterion: docs/architecture.md is replaced by the story's content (section "## Encounters and battle tracking").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../..');
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const normalize = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\s+$/, '');
const actual = normalize(read(path.join(ROOT, 'docs/architecture.md')));
const expected = normalize(read(path.join(HERE, 'architecture.expected.md')));

// Body of a "## " section, up to the next "#"/"##" heading.
function section(text, heading) {
	const lines = text.split('\n');
	const i = lines.findIndex((l) => l === heading);
	if (i < 0) return null;
	const out = [];
	for (const l of lines.slice(i + 1)) {
		if (/^#{1,2} /.test(l)) break;
		out.push(l);
	}
	return out.join('\n').trim();
}

test('docs/architecture.md has the "## Encounters and battle tracking" section with the specified text', () => {
	const want = section(expected, '## Encounters and battle tracking');
	assert.ok(want, 'expected file lacks the section (test bug)');
	assert.equal(section(actual, '## Encounters and battle tracking'), want);
});

test('docs/architecture.md equals exactly the content given in the story', () => {
	assert.equal(actual, expected);
});

test('CLAUDE.md still links docs/architecture.md', () => {
	assert.match(read(path.join(ROOT, 'CLAUDE.md')), /\]\((\.\/)?docs\/architecture\.md\)/);
});
