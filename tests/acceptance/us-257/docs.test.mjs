// US-257: docs/ui.md lists the add form test ids; catalog keys exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('docs/ui.md lists the battle add test ids', () => {
	const md = fs.readFileSync('docs/ui.md', 'utf8');
	for (const id of ['battle-add', 'battle-add-adversary', 'battle-add-count', 'battle-add-submit']) assert.ok(md.includes('`' + id + '`'), id);
});

test('catalog has the battle.add keys in en and fr', () => {
	const en = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
	const fr = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
	const want = { 'battle.add': ['Add adversary', 'Ajouter un adversaire'], 'battle.addQuantity': ['Quantity', 'Quantité'], 'battle.addWhich': ['Adversary to add', 'Adversaire à ajouter'] };
	for (const [k, [e, f]] of Object.entries(want)) { assert.equal(en[k], e); assert.equal(fr[k], f); }
});
