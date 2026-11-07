import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const DIR = 'src/lib/srd/core';
const SHA = {
	'ancestries.json': '46b158528553e46b45410c9cc8f912849c8c5880027925e574e67e7c772d15f5',
	'armors.json': 'a63630d38d3c19c2aaeaaeddd404d5e80cbe6ee0949566c13dc302d8ecfaea5f',
	'classes.json': '28118cc2b0e94edca15a11d8a0156898436a0a010ba54d2c633704b80ab4a8d6',
	'communities.json': '03ce4ec4945815451a4b7c23f17a64caab979ee979944e62255407f1fc5f1142',
	'consumables.json': 'e84117cf8c08d8247a675768401540062bb5d3b431f16ce38f7cf494933e2b15',
	'domain-cards.json': 'b5b3dba9733c0383312acb0f234fbc5c2060a989351d881e3057a2593798f585',
	'items.json': 'ab9de4f69d810b0a254eda1c26834dbe20f91e44bb41f3f707dd4c2f3a352585',
	'rules.json': '28492919eb415799c8ab624cdc942931882dbc766c1453a426430f5b7b8044dc',
	'subclasses.json': '8415d1f2629b74538787351e630d07351872fb10167b9a6de34a62f61ef2a7eb',
	'weapons.json': 'a2c4f501fc62fc487cd0ad4fd901864a73431a5072920b4f70c793f5800b8fc8'
};
const KINDS = {
	classes: ['classes.json', 9], subclasses: ['subclasses.json', 18], ancestries: ['ancestries.json', 18],
	communities: ['communities.json', 9], 'domain-cards': ['domain-cards.json', 189], weapons: ['weapons.json', 192],
	armors: ['armors.json', 34], consumables: ['consumables.json', 60], items: ['items.json', 60], rules: ['rules.json', 14]
};
const DOMAINS = ['Arcana', 'Blade', 'Bone', 'Codex', 'Grace', 'Midnight', 'Sage', 'Splendor', 'Valor'];
const SENTENCE = 'This product includes materials from the Daggerheart System Reference Document 1.0, © Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others.';

const file = (n) => JSON.parse(fs.readFileSync(`${DIR}/${n}`, 'utf8'));
const get = (path, lang) => fetch(BASE + path, { headers: lang ? { cookie: `lang=${lang}` } : {} });
const enName = (kind, e) => (kind === 'classes' ? e.name[0] + e.name.slice(1).toLowerCase() : e.name['en-US']);

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

test('the 10 SRD files are copied unchanged (SHA-256)', () => {
	for (const [f, sha] of Object.entries(SHA)) {
		assert.ok(fs.existsSync(`${DIR}/${f}`), `${f} missing`);
		assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`${DIR}/${f}`)).digest('hex'), sha, f);
	}
});

test('LICENSE.md holds the notice', () => {
	const t = fs.readFileSync('src/lib/srd/LICENSE.md', 'utf8').replace(/\s+/g, ' ');
	assert.ok(t.includes(SENTENCE));
});

test('the footer of every page shows the licence sentence, in both languages', async () => {
	const camp = await (await fetch(BASE + '/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lic Camp' }) })).json();
	const ch = await (await fetch(`${BASE}/api/campaigns/${camp.id}/characters`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lic', class: 'Wanderer', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3 }) })).json();
	for (const lang of ['en', 'fr']) {
		for (const path of ['/', `/campaigns/${camp.id}`, `/characters/${ch.id}`]) {
			const ctx = await browser.newContext();
			await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
			const page = await ctx.newPage();
			await page.goto(BASE + path);
			const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
			assert.ok(text.includes(SENTENCE), `${lang} ${path}: licence sentence missing`);
			await ctx.close();
		}
	}
});

for (const [kind, [f, count]] of Object.entries(KINDS)) {
	test(`GET /api/srd/${kind} lists ${count} {id,name} in file order, in en and by default`, async () => {
		const els = file(f);
		assert.equal(els.length, count);
		const expected = els.map((e) => ({ id: e.id, name: enName(kind, e), nameLang: 'en' })); // us-209 adds nameLang
		for (const lang of [undefined, 'en']) {
			const r = await get(`/api/srd/${kind}`, lang);
			assert.equal(r.status, 200);
			assert.deepEqual(await r.json(), expected);
		}
	});
	test(`GET /api/srd/${kind}/<id> returns the file object plus nameLocalized`, async () => {
		const els = file(f);
		for (const e of [els[0], els[els.length - 1]]) {
			for (const lang of ['en']) {
				const r = await get(`/api/srd/${kind}/${e.id}`, lang);
				assert.equal(r.status, 200);
				assert.deepEqual(await r.json(), { ...e, nameLocalized: enName(kind, e) });
			}
		}
		const r = await get(`/api/srd/${kind}/core_nope_missing`);
		assert.equal(r.status, 404);
		assert.ok(typeof (await r.json()).error !== 'undefined');
	});
}

test('classes: BARD is shown as Bard, id core_class_bard', async () => {
	const list = await (await get('/api/srd/classes')).json();
	assert.ok(list.some((c) => c.id === 'core_class_bard' && c.name === 'Bard'));
});

test('domains: 9 entries with ids core_domain_<lowercase name>', async () => {
	const r = await get('/api/srd/domains');
	assert.equal(r.status, 200);
	const list = await r.json();
	assert.equal(list.length, 9);
	assert.deepEqual(list.map((d) => d.name).sort(), [...DOMAINS].sort());
	for (const d of list) assert.equal(d.id, `core_domain_${d.name.toLowerCase()}`);
	for (const lang of ['en']) {
		const one = await (await get('/api/srd/domains/core_domain_blade', lang)).json();
		assert.equal(one.id, 'core_domain_blade');
		assert.equal(one.nameLocalized, 'Blade');
	}
	assert.equal((await get('/api/srd/domains/core_domain_nope')).status, 404);
});

test('unknown kind -> 404 with {"error"}', async () => {
	for (const p of ['/api/srd/nonsense', '/api/srd/nonsense/core_class_bard']) {
		const r = await get(p);
		assert.equal(r.status, 404);
		assert.ok('error' in (await r.json()));
	}
});
