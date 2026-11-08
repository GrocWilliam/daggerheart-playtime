import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL;
const FILES = {
	adversaries: ['src/lib/srd/adversaries.json', 'c49d6fbb2d1986d4f878b5c047d08e8310b19808a63f66748ef3a752042ba14c', 129, 'adv_'],
	environments: ['src/lib/srd/environments.json', 'fb949a416fa8965668dff6080d5c608ae6843451d17095824703f44304ad859e', 19, 'env_']
};
const ROLES = ['Bruiser', 'Horde', 'Leader', 'Minion', 'Ranged', 'Skulk', 'Social', 'Solo', 'Standard', 'Support'];
const get = (path, lang) => fetch(BASE + path, { headers: lang ? { cookie: `lang=${lang}` } : {} });
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

test('both JSON files exist with the given SHA-256', () => {
	for (const [f, sha] of Object.values(FILES)) {
		assert.ok(fs.existsSync(f), `${f} missing`);
		assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'), sha, f);
	}
});

test('LICENSE.md has one more line naming the second source', () => {
	const t = fs.readFileSync('src/lib/srd/LICENSE.md', 'utf8');
	assert.ok(/seansbox\/daggerheart-srd/.test(t), 'second source not named');
	const lines = t.split('\n').filter((l) => l.trim());
	assert.ok(lines.length >= 2, 'expected at least two non-empty lines');
	assert.ok(lines.some((l) => /seansbox/.test(l) && /Darrington Press Community Gaming|DPCGL/.test(l)), 'DPCGL notice on the new line');
});

for (const [kind, [f, , count, prefix]] of Object.entries(FILES)) {
	test(`GET /api/srd/${kind} returns ${count} entries in file order with unique ${prefix} ids`, async () => {
		const r = await get(`/api/srd/${kind}`);
		assert.equal(r.status, 200);
		const list = await r.json();
		assert.equal(list.length, count);
		const src = read(f);
		assert.equal(src.length, count);
		assert.deepEqual(list.map((e) => e.name), src.map((e) => e.name));
		const re = new RegExp(`^${prefix}[a-z0-9_]+$`);
		for (const e of list) assert.match(e.id, re);
		assert.equal(new Set(list.map((e) => e.id)).size, count);
	});
}

test('every adversary has numeric tier 1-4 and a valid role; Horde (3/HP) gives Horde', async () => {
	const src = read(FILES.adversaries[0]);
	const list = await (await get('/api/srd/adversaries')).json();
	const full = await Promise.all(list.map(async (e) => (await get(`/api/srd/adversaries/${e.id}`)).json()));
	full.forEach((e, i) => {
		assert.equal(typeof e.tier, 'number', e.id);
		assert.ok([1, 2, 3, 4].includes(e.tier), e.id);
		assert.ok(ROLES.includes(e.role), `${e.id}: role ${e.role}`);
		assert.equal(e.role, src[i].type.replace(/\s*\(.*\)\s*$/, '').trim(), e.id);
	});
	assert.ok(src.some((a) => a.type === 'Horde (3/HP)'));
	for (const [i, a] of src.entries()) if (a.type === 'Horde (3/HP)') assert.equal(full[i].role, 'Horde');
});

test('GET /api/srd/adversaries/<id> returns the element with nameLocalized; unknown id is 404', async () => {
	const src = read(FILES.adversaries[0]);
	const list = await (await get('/api/srd/adversaries')).json();
	const r = await get(`/api/srd/adversaries/${list[0].id}`);
	assert.equal(r.status, 200);
	const e = await r.json();
	assert.equal(e.name, src[0].name);
	assert.equal(e.nameLocalized, src[0].name);
	assert.deepEqual(e.feature, src[0].feature);
	const env = await (await get('/api/srd/environments')).json();
	const re = await get(`/api/srd/environments/${env[0].id}`);
	assert.equal(re.status, 200);
	assert.equal((await re.json()).nameLocalized, read(FILES.environments[0])[0].name);
	for (const k of ['adversaries', 'environments']) {
		const u = await get(`/api/srd/${k}/nope_nothing`);
		assert.equal(u.status, 404);
		assert.deepEqual(await u.json(), { error: 'unknown SRD element' });
	}
});

test('the overlay files still hold exactly 760 names; all environment names are French', async () => {
	const FR_DIR = 'src/lib/srd/fr';
	const names = fs.readdirSync(FR_DIR).filter((f) => f.endsWith('.json')).reduce((n, f) => n + Object.values(read(`${FR_DIR}/${f}`)).filter((e) => e && 'name' in e).length, 0);
	assert.equal(names, 760);
	for (const kind of ['adversaries', 'environments']) {
		const en = await (await get(`/api/srd/${kind}`, 'en')).json();
		const fr = await (await get(`/api/srd/${kind}`, 'fr')).json();
		assert.deepEqual(fr.map((a) => a.id), en.map((a) => a.id));
				const one = await (await get(`/api/srd/${kind}/${en[1].id}`, 'fr')).json();
		if (kind === 'environments') assert.equal(one.nameLocalized, read(`${FR_DIR}/environments.json`)[en[1].id].name);
		else assert.equal(one.nameLocalized, one.name);
	}
});

test('/reference has ref-adversaries and ref-environments', async () => {
	for (const lang of ['en', 'fr']) {
		const html = await (await get('/reference', lang)).text();
		assert.ok(html.includes('data-testid="ref-adversaries"'), `${lang} ref-adversaries`);
		assert.ok(html.includes('data-testid="ref-environments"'), `${lang} ref-environments`);
	}
});

test('Vitest tests without a database cover BOM, slug, role and tier, and pass', () => {
	const dir = 'src/lib/server/features';
	const txt = fs.readdirSync(dir).filter((f) => /srd.*\.test\.ts$/.test(f)).map((f) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
	for (const w of [/BOM|\\uFEFF|\\ufeff/, /slug|adv_/, /role/, /tier/]) assert.match(txt, w);
	assert.match(txt, /adversar/i);
	execSync('npx vitest run src/lib/server/features', { stdio: 'pipe' });
});
