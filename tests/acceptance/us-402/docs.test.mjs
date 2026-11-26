import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// `make test` passing is checked by the CI job, not here.
test('docs/ui.md lists the adversary count test ids', () => {
	const docs = fs.readFileSync('docs/ui.md', 'utf8');
	for (const id of ['adversary-count', 'adversary-count-minus', 'adversary-count-plus']) assert.ok(docs.includes('`' + id + '`'), id);
});

test('neither catalog has encounter.update, both have the new stepper labels with different values', () => {
	const en = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
	const fr = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
	for (const c of [en, fr]) assert.ok(!('encounter.update' in c));
	assert.equal(en['encounter.countDown'], 'One fewer {name}');
	assert.equal(fr['encounter.countDown'], 'Retirer un {name}');
	assert.equal(en['encounter.countUp'], 'One more {name}');
	assert.equal(fr['encounter.countUp'], 'Ajouter un {name}');
});
