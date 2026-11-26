import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const docs = fs.readFileSync('docs/ui.md', 'utf8');
// `make test` passing is checked by the CI job, not here.
test('docs/ui.md lists adversary-pips and battle-add-more and keeps the battle-add ids', () => {
	for (const id of ['adversary-pips', 'battle-add-more', 'battle-add', 'battle-add-adversary', 'battle-add-count', 'battle-add-submit'])
		assert.ok(docs.includes('`' + id + '`'), id);
});
