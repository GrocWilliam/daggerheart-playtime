// US-256: docs/ui.md lists the new test ids and describes the battle tracker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('docs/ui.md lists the battle tracker test ids', () => {
	const md = fs.readFileSync('docs/ui.md', 'utf8');
	for (const id of ['battle-unit', 'unit-hp', 'unit-defeated', 'unit-damage', 'unit-hit', 'unit-hp-plus', 'unit-hp-minus'])
		assert.ok(md.includes('`' + id + '`'), id);
	assert.match(md, /battle/i);
});

test('catalog has the battle keys in en and fr', () => {
	const en = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
	const fr = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
	const want = { 'battle.defeated': ['Defeated', 'Vaincu'], 'battle.amount': ['Damage to {name}', 'Dégâts infligés à {name}'], 'battle.hit': ['Apply damage', 'Infliger'], 'battle.hpUp': ['Mark one HP on {name}', 'Marquer un PV sur {name}'], 'battle.hpDown': ['Clear one HP on {name}', 'Effacer un PV sur {name}'] };
	for (const [k, [e, f]] of Object.entries(want)) { assert.equal(en[k], e); assert.equal(fr[k], f); }
});
