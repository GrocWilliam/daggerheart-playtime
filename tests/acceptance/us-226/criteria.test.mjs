// US-226 criteria (run from the repository root, no server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Built from parts so that this file does not itself mention the removed path.
const LEGACY = ['src', 'lib', 'srd', 'fr.json'].join('/');
const FR_DIR = 'src/lib/srd/fr';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const overlayFiles = () => fs.readdirSync(FR_DIR).filter((f) => f.endsWith('.json'));
const hasName = (e) => e && typeof e === 'object' && 'name' in e;

// The frozen tests that read French names: each must read the overlay files, not the removed file.
const LISTED = [
	'tests/acceptance/us-44/fr.test.mjs',
	'tests/acceptance/us-48/picklists.test.mjs',
	'tests/acceptance/us-49/cards.test.mjs',
	'tests/acceptance/us-50/inventory.test.mjs',
	'tests/acceptance/us-129/equipment.test.mjs',
	'tests/acceptance/us-129/helpers.unit.ts',
	'tests/acceptance/us-131/dropdowns.test.mjs',
	'tests/acceptance/us-132/sheet-selects.test.mjs',
	'tests/acceptance/us-152/adversaries.test.mjs'
];

test('the legacy French SRD file no longer exists', () => {
	assert.equal(fs.existsSync(LEGACY), false);
});

test('no file in the repository mentions the removed path (git history aside)', () => {
	let out = '';
	try {
		out = execFileSync('git', ['grep', '-l', '-F', LEGACY, '--', '.'], { encoding: 'utf8' });
	} catch (e) {
		if (e.status !== 1) throw e; // git grep exits 1 when nothing matches
	}
	assert.equal(out.trim(), '');
});

test('src/lib/srd/fr/ holds 13 overlay files, each a JSON object', () => {
	const files = overlayFiles();
	assert.equal(files.length, 13);
	for (const f of files) {
		const d = readJson(`${FR_DIR}/${f}`);
		assert.ok(d && typeof d === 'object' && !Array.isArray(d), `${f} is not a JSON object`);
	}
});

test('the 13 overlay files together hold 612 name entries', () => {
	// adversaries.json and environments.json start empty here; later stories add their names, so they are not counted.
	const counted = overlayFiles().filter((f) => !['adversaries.json', 'environments.json'].includes(f));
	const total = counted.reduce((n, f) => n + Object.values(readJson(`${FR_DIR}/${f}`)).filter(hasName).length, 0);
	assert.equal(total, 612);
});

for (const file of LISTED) {
	test(`${file} reads French names from src/lib/srd/fr/, not the removed file`, () => {
		const src = fs.readFileSync(file, 'utf8');
		assert.ok(src.includes(FR_DIR), `${file} does not read ${FR_DIR}`);
		assert.ok(!src.includes(LEGACY), `${file} still reads the removed file`);
	});
}
