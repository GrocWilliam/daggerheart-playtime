import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const campaign = async () => (await api('POST', '/api/campaigns', { name: 'Classcamp' })).json.id;
const tunnel = (cid, q) => `/campaigns/${cid}/characters/new?${new URLSearchParams(q)}`;
const normal = (s) => s.replace(/[\s  ]+/g, ' ').trim();

async function open(path, lang) {
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	const res = await p.goto(BASE + path);
	return { p, ctx, res };
}

// Criterion 2: a non-SRD class in step 1 redirects GET ?step=2 to step=1&invalid=class, with an alert (en, fr).
test('GET ?step=2 with class=Pirate answers 303 to step=1&invalid=class', async () => {
	const cid = await campaign();
	const r = await fetch(BASE + tunnel(cid, { step: '2', name: 'Ann', class: 'Pirate', level: '1' }), { redirect: 'manual' });
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.pathname, `/campaigns/${cid}/characters/new`);
	assert.equal(loc.searchParams.get('step'), '1');
	assert.equal(loc.searchParams.get('invalid'), 'class');
});

test('the page for a non-SRD class shows an alert naming the class field (en and fr)', async () => {
	const cid = await campaign();
	const url = tunnel(cid, { step: '2', name: 'Ann', class: 'Pirate', level: '1' });
	const cases = [['en', 'Check this field: Class.'], ['fr', 'Vérifiez ce champ : Classe.']];
	for (const [lang, text] of cases) {
		const { p, ctx } = await open(url, lang);
		assert.equal(new URL(p.url()).searchParams.get('invalid'), 'class', `${lang}: redirected to invalid=class`);
		assert.equal(new URL(p.url()).searchParams.get('step'), '1', `${lang}: redirected to step 1`);
		const alert = p.locator('[role=alert]');
		assert.equal(await alert.count(), 1, `${lang}: one alert`);
		assert.equal(normal(await alert.innerText()), normal(text), `${lang}: alert text`);
		await ctx.close();
	}
});

// Criterion 3: an SRD class stays on step 2.
test('GET ?step=2 with class=Warrior answers 200 on step 2', async () => {
	const cid = await campaign();
	const r = await fetch(BASE + tunnel(cid, { step: '2', name: 'Ann', class: 'Warrior', level: '1' }), { redirect: 'manual' });
	assert.equal(r.status, 200);
	const { p, ctx, res } = await open(tunnel(cid, { step: '2', name: 'Ann', class: 'Warrior', level: '1' }), 'en');
	assert.equal(res.status(), 200);
	assert.equal(new URL(p.url()).searchParams.get('step'), '2', 'stays on step 2');
	assert.equal(new URL(p.url()).searchParams.get('invalid'), null, 'no invalid marker');
	assert.equal(await p.locator('[role=alert]').count(), 0, 'no alert');
	await ctx.close();
});

// Criterion 4: the API still accepts a free class name.
test('POST /api/campaigns/:id/characters with class "Pirate" and otherwise valid fields answers 201', async () => {
	const cid = await campaign();
	const r = await api('POST', `/api/campaigns/${cid}/characters`, {
		name: 'Ann', class: 'Pirate', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3
	});
	assert.equal(r.status, 201, JSON.stringify(r.json));
	assert.ok(r.json?.id, 'returns the new character id');
});
