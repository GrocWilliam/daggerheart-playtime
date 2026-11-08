// us-221: French API for classes and the French tunnel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });
const get = async (path, lang) => {
	const r = await fetch(BASE + path, { headers: { cookie: `lang=${lang}` } });
	assert.equal(r.status, 200, path);
	return r.json();
};
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
const shape = (v) => Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])])) : typeof v;

test('fr GET /api/srd/classes/core_class_bard: hopeFeature in French under en-US keys, English JSON shape', async () => {
	const en = await get('/api/srd/classes/core_class_bard', 'en');
	const fr = await get('/api/srd/classes/core_class_bard', 'fr');
	const h = fr.hopeFeature;
	assert.equal(typeof h.name['en-US'], 'string');
	assert.notEqual(h.name['en-US'], en.hopeFeature.name['en-US']);
	assert.notEqual(h.name['en-US'].trim(), '');
	const p = h.description[0].paragraph['en-US'];
	assert.equal(typeof p, 'string');
	assert.notEqual(p, en.hopeFeature.description[0].paragraph['en-US']);
	assert.match(p, /3/);
	assert.deepEqual(shape(fr.hopeFeature), shape(en.hopeFeature));
	assert.equal(fr.classFeatures.length, en.classFeatures.length);
	assert.equal(fr.classItems.length, en.classItems.length);
});

test('fr tunnel: class select shows Barde (value Bard, lang fr) and creating the character posts Bard', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Tunnel Camp' })).id;
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	assert.equal((await p.goto(`${BASE}/campaigns/${camp}/characters/new`)).status(), 200);
	await p.locator('input[name="name"]').fill('Brin');
	const cls = p.locator('select[name="class"]');
	const opt = cls.locator('option', { hasText: 'Barde' });
	assert.equal(await opt.count(), 1);
	assert.equal(await opt.getAttribute('value'), 'Bard');
	assert.equal(await opt.getAttribute('lang'), 'fr');
	await cls.selectOption({ label: 'Barde' });
	assert.equal(await cls.inputValue(), 'Bard');
	await Promise.all([p.waitForURL(/step=2/), p.getByTestId('tunnel-next').click()]);
	assert.equal(new URL(p.url()).searchParams.get('class'), 'Bard');
	await Promise.all([p.waitForURL(/step=3/), p.getByTestId('tunnel-next').click()]);
	for (const [f, v] of [['evasion', '10'], ['majorThreshold', '5'], ['severeThreshold', '10'], ['maxHp', '5'], ['maxStress', '6'], ['armorSlots', '3']])
		await p.locator(`input[name="${f}"]`).fill(v);
	await Promise.all([p.waitForURL(/step=4/), p.getByTestId('tunnel-next').click()]);
	await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), p.getByTestId('tunnel-create').click()]);
	const c = await api('GET', `/api/characters/${new URL(p.url()).pathname.split('/').pop()}`);
	assert.equal(c.class, 'Bard');
	await ctx.close();
});
