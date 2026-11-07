// US-209 HTTP criteria against `node build` (in-memory PGlite).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const get = async (path, lang) => {
	const r = await fetch(BASE + path, { headers: lang ? { cookie: `lang=${lang}` } : {} });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const broadsword = () => JSON.parse(fs.readFileSync('src/lib/srd/core/weapons.json', 'utf8')).find((e) => e.id === 'core_weapon_broadsword');

test("lang=fr: GET /api/srd/weapons/core_weapon_broadsword has name['en-US'] and nameLocalized 'Épée large', everything else English", async () => {
	const r = await get('/api/srd/weapons/core_weapon_broadsword', 'fr');
	assert.equal(r.status, 200);
	assert.equal(r.json.name['en-US'], 'Épée large');
	assert.equal(r.json.nameLocalized, 'Épée large');
	const en = (await get('/api/srd/weapons/core_weapon_broadsword', 'en')).json;
	assert.deepEqual({ ...r.json, name: en.name, nameLocalized: en.nameLocalized }, en);
	assert.deepEqual(r.json.name, { 'en-US': 'Épée large' });
	assert.equal(r.json.features[0].description[0].paragraph['en-US'], broadsword().features[0].description[0].paragraph['en-US']);
	assert.equal(r.json.features[0].name['en-US'], 'Reliable');
});

test('lang=en or no cookie: the same request returns the English element exactly as before', async () => {
	for (const lang of ['en', undefined]) {
		const r = await get('/api/srd/weapons/core_weapon_broadsword', lang);
		assert.equal(r.status, 200, String(lang));
		assert.deepEqual(r.json, { ...broadsword(), nameLocalized: 'Broadsword' }, String(lang));
	}
});

test("lang=fr: GET /api/srd/classes lists core_class_bard as Barde with nameLang 'fr'", async () => {
	const r = await get('/api/srd/classes', 'fr');
	assert.equal(r.status, 200);
	const bard = r.json.find((c) => c.id === 'core_class_bard');
	assert.equal(bard.name, 'Barde');
	assert.equal(bard.nameLang, 'fr');
	const en = (await get('/api/srd/classes', 'en')).json.find((c) => c.id === 'core_class_bard');
	assert.equal(en.name, 'Bard');
	assert.equal(en.nameLang, 'en');
});

test("lang=fr: GET /api/srd/adversaries returns English names with nameLang 'en'", async () => {
	const fr = await get('/api/srd/adversaries', 'fr');
	const en = await get('/api/srd/adversaries', 'en');
	assert.equal(fr.status, 200);
	assert.ok(fr.json.length > 0);
	assert.deepEqual(fr.json.map((a) => a.id), en.json.map((a) => a.id));
	fr.json.forEach((a, i) => {
		assert.equal(a.name, en.json[i].name, a.id);
		assert.equal(a.nameLang, 'en', a.id);
	});
	assert.equal(fr.json.find((a) => a.id === 'adv_acid_burrower').name, 'Acid Burrower');
});

test('GET /api/srd/weapons/nope still answers 404 {"error"}; an unknown kind still answers 404 "unknown SRD kind"', async () => {
	for (const lang of ['en', 'fr', undefined]) {
		const r = await get('/api/srd/weapons/nope', lang);
		assert.equal(r.status, 404, String(lang));
		assert.deepEqual(r.json, { error: 'unknown SRD element' });
		for (const p of ['/api/srd/nonsense', '/api/srd/nonsense/core_weapon_broadsword']) {
			const u = await get(p, lang);
			assert.equal(u.status, 404, p);
			assert.deepEqual(u.json, { error: 'unknown SRD kind' }, p);
		}
	}
});

test('creating a character through the tunnel in French with class Barde still succeeds', async () => {
	const cid = (await (await fetch(BASE + '/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Barde camp' }) })).json()).id;
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);
	const tid = (id) => p.locator(`[data-testid=${id}]`);
	const field = (name) => p.locator('form', { has: tid('tunnel-next') }).locator(`input[name=${name}]:not([type=hidden]), select[name=${name}]`);
	const waitStep = (n) => p.waitForURL((u) => new URL(u).searchParams.get('step') === String(n));
	try {
		await p.goto(`${BASE}/campaigns/${cid}/characters/new`);
		await field('name').fill('Lyra');
		await field('class').selectOption({ label: 'Barde' });
		await field('level').fill('1');
		await Promise.all([waitStep(2), tid('tunnel-next').click()]);
		assert.equal(new URL(p.url()).searchParams.get('class'), 'Bard');
		await field('ancestry').selectOption({ label: 'Clank' });
		await field('community').selectOption({ label: 'Haut-né' });
		await Promise.all([waitStep(3), tid('tunnel-next').click()]);
		for (const [k, v] of Object.entries({ evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 }))
			await field(k).fill(String(v));
		await Promise.all([waitStep(4), tid('tunnel-next').click()]);
		await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), tid('tunnel-create').click()]);
		const id = new URL(p.url()).pathname.split('/').pop();
		const ch = await get(`/api/characters/${id}`);
		assert.equal(ch.status, 200);
		assert.equal(ch.json.name, 'Lyra');
		assert.equal(ch.json.class, 'Bard');
	} finally {
		await ctx.close();
	}
});
