// US-209 file criteria (run from the repository root, no server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FR_DIR = 'src/lib/srd/fr';
const FILES = ['adversaries', 'environments', 'ancestries', 'armors', 'classes', 'communities', 'consumables', 'domain-cards', 'domains', 'items', 'rules', 'subclasses', 'weapons'];
const CORE = ['ancestries', 'armors', 'classes', 'communities', 'consumables', 'domain-cards', 'items', 'rules', 'subclasses', 'weapons'];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const overlay = (kind) => readJson(`${FR_DIR}/${kind}.json`);

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(ts|js|mjs|cjs|svelte)$/.test(e.name)) out.push(p);
	}
	return out;
}

test('no file under src/ reads the legacy French file (srd/fr.json)', () => {
	const offenders = walk('src').filter((f) => /srd\/fr\.json|['"`]fr\.json['"`]/.test(fs.readFileSync(f, 'utf8')));
	assert.deepEqual(offenders, []);
});

test('src/lib/srd/fr/ holds the 13 files, each a JSON object', () => {
	for (const kind of FILES) {
		const p = `${FR_DIR}/${kind}.json`;
		assert.ok(fs.existsSync(p), `${p} missing`);
		const d = readJson(p);
		assert.ok(d && typeof d === 'object' && !Array.isArray(d), `${p} is not a JSON object`);
	}
});

test('the 13 files hold 612 names, each on an element of its kind', () => {
	const kindOf = {};
	for (const kind of CORE) for (const e of readJson(`src/lib/srd/core/${kind}.json`)) kindOf[e.id] = kind;
	let n = 0;
	for (const kind of [...CORE, 'domains']) {
		for (const [id, e] of Object.entries(overlay(kind))) {
			if (!e || !('name' in e)) continue;
			n++;
			const expected = kindOf[id] ?? (id.startsWith('core_domain_') ? 'domains' : undefined);
			assert.equal(expected, kind, `${id} is not an element of ${kind}`);
		}
	}
	// adversaries.json and environments.json start empty here; later stories add their names, so they are not counted.
	assert.equal(n, 612);
});

test('examples: Barde, Épée large, Arcanes', () => {
	assert.deepEqual(overlay('classes').core_class_bard, { name: 'Barde' });
	assert.deepEqual(overlay('weapons').core_weapon_broadsword, { name: 'Épée large' });
	assert.deepEqual(overlay('domains').core_domain_arcana, { name: 'Arcanes' });
});
