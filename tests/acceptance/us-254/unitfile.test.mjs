// US-254 "Also": the colocated unit tests (src/lib/server/features/encounters.test.ts) cover damageMarks, marksOf,
// resizeMarks and every schema message. run.sh also runs that file with vitest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILE = 'src/lib/server/features/encounters.test.ts';
const src = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';

for (const name of ['damageMarks', 'marksOf', 'resizeMarks', 'battleDamageSchema', 'battleHpSchema']) {
	test(`${FILE} tests ${name}`, () => assert.ok(src.includes(name), `${FILE} does not mention ${name}`));
}
for (const msg of [
	'adversaryId must be a string',
	'index must be a copy of that adversary',
	'amount must be an integer from 1 to 999',
	'delta must be 1 or -1'
]) {
	test(`${FILE} checks the message "${msg}"`, () => assert.ok(src.includes(msg), `${FILE} does not contain "${msg}"`));
}
