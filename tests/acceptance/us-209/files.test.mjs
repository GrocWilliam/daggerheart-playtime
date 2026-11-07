// US-209 file criteria (run from the repository root, no server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FR_DIR = 'src/lib/srd/fr';
const FILES = ['adversaries', 'environments', 'ancestries', 'armors', 'classes', 'communities', 'consumables', 'domain-cards', 'domains', 'items', 'rules', 'subclasses', 'weapons'];
const CORE = ['ancestries', 'armors', 'classes', 'communities', 'consumables', 'domain-cards', 'items', 'rules', 'subclasses', 'weapons'];
// sha256 of src/lib/srd/fr.json before this story: the file is kept unchanged.
const FR_JSON_SHA = '39814ec8b0fac5b9d13e8cb0e99f5d1cd760f8ae62dbc493379fd4e009994f01';
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

test('no file under src/ reads src/lib/srd/fr.json', () => {
	const offenders = walk('src').filter((f) => /srd\/fr\.json|['"`]fr\.json['"`]/.test(fs.readFileSync(f, 'utf8')));
	assert.deepEqual(offenders, []);
});

test('src/lib/srd/fr.json is kept unchanged', () => {
	assert.equal(crypto.createHash('sha256').update(fs.readFileSync('src/lib/srd/fr.json')).digest('hex'), FR_JSON_SHA);
});

test('src/lib/srd/fr/ holds the 13 files, each a JSON object', () => {
	for (const kind of FILES) {
		const p = `${FR_DIR}/${kind}.json`;
		assert.ok(fs.existsSync(p), `${p} missing`);
		const d = readJson(p);
		assert.ok(d && typeof d === 'object' && !Array.isArray(d), `${p} is not a JSON object`);
	}
});

test('the 13 files hold the 612 former fr.json names, each in its kind file', () => {
	const fr = readJson('src/lib/srd/fr.json');
	const kindOf = {};
	for (const kind of CORE) for (const e of readJson(`src/lib/srd/core/${kind}.json`)) kindOf[e.id] = kind;
	for (const id of Object.keys(fr)) if (!kindOf[id] && id.startsWith('core_domain_')) kindOf[id] = 'domains';
	for (const [id, name] of Object.entries(fr)) {
		assert.ok(kindOf[id], `${id}: unknown kind`);
		const entry = overlay(kindOf[id])[id];
		assert.ok(entry, `${id} missing from fr/${kindOf[id]}.json`);
		assert.equal(entry.name, name, id);
	}
	// adversaries.json and environments.json start empty here; later stories add their names, so they are not counted.
	let n = 0;
	for (const kind of [...CORE, 'domains']) for (const e of Object.values(overlay(kind))) if (e && 'name' in e) n++;
	assert.equal(n, 612);
});

test('examples: Barde, Épée large, Arcanes', () => {
	assert.deepEqual(overlay('classes').core_class_bard, { name: 'Barde' });
	assert.deepEqual(overlay('weapons').core_weapon_broadsword, { name: 'Épée large' });
	assert.deepEqual(overlay('domains').core_domain_arcana, { name: 'Arcanes' });
});
