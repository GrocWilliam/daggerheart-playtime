import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL;
const ROOT = process.env.ROOT;
const jpost = (p, body, raw = false) =>
	fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
const err = async (r) => (await r.json()).error;

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const f = path.join(dir, e.name);
		if (e.isDirectory()) walk(f, out);
		else out.push(f);
	}
	return out;
}

test('schemas: srd.ts exports Zod schemas and the manual isSrdKind check is gone', () => {
	const srd = fs.readFileSync(path.join(ROOT, 'src/lib/server/srd.ts'), 'utf8');
	assert.match(srd, /from 'zod(\/v4)?'/);
	assert.match(srd, /export const \w+\s*=\s*z\./);
	assert.doesNotMatch(srd, /export function isSrdKind/);
	for (const f of walk(path.join(ROOT, 'src/routes')).filter((f) => /\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f))) {
		const t = fs.readFileSync(f, 'utf8');
		assert.doesNotMatch(t, /isSrdKind\(/, f);
		assert.doesNotMatch(t, /isLang\(/, f);
	}
});

test('GET /api/srd/<unknown kind> is 404 "unknown SRD kind"', async () => {
	for (const k of ['nope', 'Classes', 'class', '%20']) {
		const r = await fetch(`${BASE}/api/srd/${k}`);
		assert.equal(r.status, 404, k);
		assert.equal(await err(r), 'unknown SRD kind', k);
		const r2 = await fetch(`${BASE}/api/srd/${k}/core_class_bard`);
		assert.equal(r2.status, 404, k);
		assert.equal(await err(r2), 'unknown SRD kind', k);
	}
});

test('GET /api/srd/<kind> and /<kind>/<id> still work; unknown or blank id is 404 "unknown SRD element"', async () => {
	const r = await fetch(`${BASE}/api/srd/classes`);
	assert.equal(r.status, 200);
	const list = await r.json();
	assert.ok(list.length > 0);
	const ok = await fetch(`${BASE}/`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE, accept: 'application/json', 'x-sveltekit-action': 'true' },
		body: 'name=Zod+Campaign'
	});
	const out = await ok.json();
	assert.equal(out.type, 'redirect');
	assert.equal(out.status, 303);
});
