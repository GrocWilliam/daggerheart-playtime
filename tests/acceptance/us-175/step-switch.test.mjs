import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { openSceneEdit, fillSceneEdit } from '../support/scenes.mjs';

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
const CH = { class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
async function setup() {
	const c = (await api('POST', '/api/campaigns', { name: 'Stepcamp' })).json;
	const a = (await api('POST', `/api/campaigns/${c.id}/characters`, { ...CH, name: 'Alyndra', level: 3 })).json;
	const b = (await api('POST', `/api/campaigns/${c.id}/characters`, { ...CH, name: 'Borvik' })).json;
	return { c, a, b };
}
async function open(path, lang = 'en', js = true) {
	const ctx = await browser.newContext({ javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(5000);
	await p.goto(BASE + path);
	return p;
}
const postForm = (path, fields) =>
	fetch(BASE + path, {
		method: 'POST', redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' },
		body: new URLSearchParams(fields).toString()
	});

test('GET /campaigns/:id/scenario -> 308 to /campaigns/:id?step=build', async () => {
	const { c } = await setup();
	const r = await fetch(`${BASE}/campaigns/${c.id}/scenario`, { redirect: 'manual' });
	assert.equal(r.status, 308);
	assert.equal(new URL(r.headers.get('location'), BASE).pathname + new URL(r.headers.get('location'), BASE).search, `/campaigns/${c.id}?step=build`);
});

for (const q of ['', '?step=bogus', '?step=run']) {
	test(`GET /campaigns/:id${q} renders the Run step`, async () => {
		const { c } = await setup();
		const p = await open(`/campaigns/${c.id}${q}`);
		assert.equal(await p.locator('[data-testid=run]').count(), 1);
		assert.equal(await p.locator('[data-testid=build]').count(), 0);
		assert.equal(await p.locator('[data-testid=run] [data-testid=fear]').count(), 1);
		assert.equal(await p.locator('[data-testid=run] [data-testid=character-card]').count(), 2);
		assert.equal(await p.locator('[data-testid=step-run]').getAttribute('aria-current'), 'step');
		assert.notEqual(await p.locator('[data-testid=step-build]').getAttribute('aria-current'), 'step');
		assert.equal(await p.locator('[data-testid=campaign-name]').textContent(), 'Stepcamp');
	});
}

test('GET ?step=build renders the Build step: party, add-character form, scenes with forms', async () => {
	const { c, a, b } = await setup();
	await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Gatehouse' });
	const p = await open(`/campaigns/${c.id}?step=build`);
	assert.equal(await p.locator('[data-testid=build]').count(), 1);
	assert.equal(await p.locator('[data-testid=run]').count(), 0);
	assert.equal(await p.locator('[data-testid=step-build]').getAttribute('aria-current'), 'step');
	assert.notEqual(await p.locator('[data-testid=step-run]').getAttribute('aria-current'), 'step');
	const members = p.locator('[data-testid=build] [data-testid=party-member]');
	assert.equal(await members.count(), 2);
	const first = members.filter({ hasText: 'Alyndra' });
	assert.equal(await first.locator('[data-testid=character-name]').textContent(), 'Alyndra');
	assert.equal(await first.locator(`a[href="/characters/${a.id}"]`).count() >= 1, true);
	assert.equal(await members.filter({ hasText: 'Borvik' }).locator(`a[href="/characters/${b.id}"]`).count() >= 1, true);
	const t = (await first.textContent());
	assert.ok(t.includes('Guardian') && t.includes('3'), `class and level in ${t}`);
	// us-197: the inline add-character form became a link to the character tunnel.
	assert.equal(await p.locator('[data-testid=build] [data-testid=new-character]').count(), 1);
	assert.equal(await p.locator('[data-testid=build] [data-testid=scene]', { hasText: 'Gatehouse' }).count(), 1);
	assert.ok(await p.locator('[data-testid=scene] form').count() >= 1, 'scene forms');
	assert.ok(await p.locator('[data-testid=build] form[action="?/add"], [data-testid=build] form[action="?/add&step=build"]').count() >= 1, 'add scene form');
	assert.equal(await p.locator('[data-testid=back]').count(), 0);
});

test('step links: texts, hrefs, plain SvelteKit links, en and fr', async () => {
	const { c } = await setup();
	for (const [lang, build, run] of [['en', 'Build', 'Run'], ['fr', 'Préparer', 'Jouer']]) {
		const p = await open(`/campaigns/${c.id}`, lang);
		const sb = p.locator('[data-testid=step-build]'), sr = p.locator('[data-testid=step-run]');
		assert.equal((await sb.textContent()).trim(), build);
		assert.equal((await sr.textContent()).trim(), run);
		assert.equal(await sb.getAttribute('href'), '?step=build');
		assert.equal(await sr.getAttribute('href'), '?step=run');
		assert.equal(await sb.getAttribute('data-sveltekit-reload'), null);
		assert.equal(await sr.getAttribute('data-sveltekit-reload'), null);
	}
});

test('moved actions work on /campaigns/:id: add, edit, move, status, delete', async () => {
	const { c } = await setup();
	const path = `/campaigns/${c.id}?step=build`;
	const titles = async () => (await api('GET', `/api/campaigns/${c.id}/scenes`)).json;
	let r = await postForm(`/campaigns/${c.id}?/add`, { title: 'First', notes: 'n' });
	assert.ok(r.status >= 200 && r.status < 400, `add status ${r.status}`);
	await postForm(`/campaigns/${c.id}?/add`, { title: 'Second' });
	let list = await titles();
	assert.deepEqual(list.map((s) => s.title), ['First', 'Second']);
	const [s1, s2] = list;
	// field names follow the old scenario page; check by driving the real forms instead
	const p = await open(path, 'en', false);
	const sc = p.locator('[data-testid=scene]', { hasText: 'Second' });
	await Promise.all([p.waitForLoadState('load'), sc.getByRole('button', { name: /move up/i }).first().click()]);
	assert.deepEqual((await titles()).map((s) => s.title), ['Second', 'First']);
	await Promise.all([p.waitForLoadState('load'), p.locator('[data-testid=scene]', { hasText: 'Second' }).getByRole('button', { name: /set current/i }).first().click()]);
	assert.equal((await titles()).find((s) => s.id === s2.id).status, 'current');
	// US-340: the scene is edited in the scene-edit modal opened from its card
	await openSceneEdit(p, 'First');
	const ed = p.getByTestId('modal-scene-edit').locator('form', { has: p.locator('input[name=title]') });
	await fillSceneEdit(p, { title: 'Premier' });
	await Promise.all([p.waitForLoadState('load'), ed.locator('button[type=submit], button:not([type])').first().click()]);
	assert.ok((await titles()).some((s) => s.id === s1.id && s.title === 'Premier'));
	await Promise.all([p.waitForLoadState('load'), p.locator('[data-testid=scene]', { hasText: 'Premier' }).getByRole('button', { name: /delete/i }).first().click()]);
	assert.deepEqual((await titles()).map((s) => s.id), [s2.id]);
	assert.ok(p.url().includes(`/campaigns/${c.id}`));
});

test('moved encounter and loot actions work on /campaigns/:id', async () => {
	const { c } = await setup();
	await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Ambush' });
	const p = await open(`/campaigns/${c.id}?step=build`, 'en', false);
	const sc = p.locator('[data-testid=scene]', { hasText: 'Ambush' });
	await Promise.all([p.waitForLoadState('load'), sc.getByRole('button', { name: /^generate encounter$/i }).click()]);
	assert.ok(await p.locator('[data-testid=encounter-adversary]').count() >= 1);
	assert.equal(await p.locator('[data-testid=encounter-budget]').count(), 1);
	await Promise.all([p.waitForLoadState('load'), p.locator('[data-testid=scene]', { hasText: 'Ambush' }).getByRole('button', { name: /delete encounter/i }).click()]);
	assert.equal(await p.locator('[data-testid=encounter-adversary]').count(), 0);
});

test('creating a campaign on the home page lands on /campaigns/<id>?step=build', async () => {
	const ctx = await browser.newContext();
	const p = await ctx.newPage();
	p.setDefaultTimeout(5000);
	await p.goto(BASE + '/', { waitUntil: 'networkidle' });
	await p.locator('[data-testid=new-campaign]').click(); // US-193: the create form lives in the New campaign modal
	await p.locator('input[name=name]').fill('Fresh Start');
	await p.locator('form', { has: p.locator('input[name=name]') }).locator('button[type=submit]').click();
	await p.waitForURL(/\/campaigns\/[^/?]+\?step=build$/);
	assert.equal(await p.locator('[data-testid=campaign-name]').textContent(), 'Fresh Start');
	assert.equal(await p.locator('[data-testid=build]').count(), 1);
});

test('creating a campaign without JavaScript also lands on ?step=build', async () => {
	const r = await postForm('/', { name: 'NoJs Camp' });
	assert.ok(r.status === 303 || r.status === 302 || r.status === 307);
	assert.match(r.headers.get('location'), /^\/campaigns\/[^/?]+\?step=build$/);
});

test('clicking step-build with JavaScript does not reload the document', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}`);
	await p.waitForLoadState('networkidle');
	await p.evaluate(() => { window.__marker = 'alive'; });
	await p.locator('[data-testid=step-build]').click();
	await p.waitForSelector('[data-testid=build]');
	assert.equal(await p.evaluate(() => window.__marker), 'alive');
	assert.equal(await p.evaluate(() => performance.getEntriesByType('navigation').length), 1);
	assert.equal(await p.locator('[data-testid=step-build]').getAttribute('aria-current'), 'step');
	await p.locator('[data-testid=step-run]').click();
	await p.waitForSelector('[data-testid=run]');
	assert.equal(await p.evaluate(() => window.__marker), 'alive');
});

test('no scenario/+page.svelte remains', () => {
	assert.equal(existsSync('src/routes/campaigns/[id]/scenario/+page.svelte'), false);
	assert.equal(existsSync('src/routes/campaigns/[id]/scenario/page.server.test.ts'), false);
	assert.equal(existsSync('src/routes/campaigns/[id]/page.server.test.ts'), true);
});
