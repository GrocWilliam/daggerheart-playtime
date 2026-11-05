import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const campaign = async () => (await api('POST', '/api/campaigns', { name: 'Camp' })).json;
const addScene = async (c, title, extra = {}) => (await api('POST', `/api/campaigns/${c}/scenes`, { title, ...extra })).json;
const apiTitles = async (c) => (await api('GET', `/api/campaigns/${c}/scenes`)).json.map((s) => s.title);

async function open(path, lang = 'en', js = true) {
	const ctx = await browser.newContext({ javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	await p.goto(BASE + path);
	return p;
}
const sceneTitles = async (p) => p.locator('[data-testid=scene]').evaluateAll((els) => els.map((e) => e.textContent));
const scene = (p, title) => p.locator('[data-testid=scene]', { hasText: title });
const click = async (p, title, name) => {
	await Promise.all([p.waitForLoadState('load'), scene(p, title).getByRole('button', { name }).first().click()]);
};

test('the campaign page links to /campaigns/:id/scenario', async () => {
	const c = await campaign();
	for (const lang of ['en', 'fr']) {
		const p = await open(`/campaigns/${c.id}`, lang);
		const link = p.locator(`a[href="/campaigns/${c.id}/scenario"]`);
		assert.equal(await link.count(), 1);
		const text = (await link.textContent()).trim();
		if (lang === 'en') assert.equal(text, 'Scenario');
		else assert.ok(text && text !== 'Scenario', `French label translated, got ${text}`);
	}
});

test('the scenario page lists scenes in order with data-testid=scene', async () => {
	const c = await campaign();
	await addScene(c.id, 'Alpha');
	await addScene(c.id, 'Bravo');
	await addScene(c.id, 'Charlie');
	const p = await open(`/campaigns/${c.id}/scenario`);
	const t = await sceneTitles(p);
	assert.equal(t.length, 3);
	assert.ok(t[0].includes('Alpha') && t[1].includes('Bravo') && t[2].includes('Charlie'));
});

test('without JavaScript the forms add, edit, move, set current, mark done and delete a scene', async () => {
	const c = await campaign();
	const url = `/campaigns/${c.id}/scenario`;
	const envs = (await api('GET', '/api/srd/environments')).json;
	let p = await open(url, 'en', false);
	// add (the form outside any scene)
	const form = p.locator('form', { has: p.locator('input[name=title]') }).filter({ hasNot: p.locator('[data-testid=scene]') }).first();
	await form.locator('input[name=title]').fill('One');
	await form.locator('[name=notes]').fill('Some notes');
	await form.locator('select[name=environmentId]').selectOption(envs[0].id);
	await Promise.all([p.waitForLoadState('load'), form.locator('button[type=submit], button:not([type])').first().click()]);
	await addScene(c.id, 'Two');
	assert.deepEqual(await apiTitles(c.id), ['One', 'Two']);
	const one = (await api('GET', `/api/campaigns/${c.id}/scenes`)).json[0];
	assert.equal(one.notes, 'Some notes');
	assert.equal(one.environmentId, envs[0].id);
	// edit
	await p.goto(BASE + url);
	const edit = scene(p, 'Two').locator('form', { has: p.locator('input[name=title]') }).first();
	await edit.locator('input[name=title]').fill('Deux');
	await Promise.all([p.waitForLoadState('load'), edit.locator('button[type=submit], button:not([type])').first().click()]);
	assert.deepEqual(await apiTitles(c.id), ['One', 'Deux']);
	// move up / down
	await click(p, 'Deux', /move up/i);
	assert.deepEqual(await apiTitles(c.id), ['Deux', 'One']);
	await click(p, 'Deux', /move down/i);
	assert.deepEqual(await apiTitles(c.id), ['One', 'Deux']);
	// set current, mark done
	await click(p, 'Deux', /set current/i);
	let list = (await api('GET', `/api/campaigns/${c.id}/scenes`)).json;
	assert.deepEqual(list.map((s) => s.status), ['planned', 'current']);
	await click(p, 'Deux', /done/i);
	list = (await api('GET', `/api/campaigns/${c.id}/scenes`)).json;
	assert.deepEqual(list.map((s) => s.status), ['planned', 'done']);
	// delete
	await click(p, 'One', /delete/i);
	assert.deepEqual(await apiTitles(c.id), ['Deux']);
	assert.equal((await sceneTitles(p)).length, 1);
});

test('the current scene title is in data-testid=current-scene on the campaign page, absent otherwise', async () => {
	const c = await campaign();
	const a = await addScene(c.id, 'Quiet');
	const b = await addScene(c.id, 'Showdown');
	let p = await open(`/campaigns/${c.id}`);
	assert.equal(await p.locator('[data-testid=current-scene]').count(), 0);
	await api('PATCH', `/api/campaigns/${c.id}/scenes/${b.id}`, { status: 'current' });
	for (const lang of ['en', 'fr']) {
		p = await open(`/campaigns/${c.id}`, lang);
		assert.equal(await p.locator('[data-testid=current-scene]').count(), 1);
		assert.ok((await p.locator('[data-testid=current-scene]').textContent()).includes('Showdown'));
		assert.ok(!(await p.locator('[data-testid=current-scene]').textContent()).includes('Quiet'));
	}
	await api('PATCH', `/api/campaigns/${c.id}/scenes/${b.id}`, { status: 'done' });
	p = await open(`/campaigns/${c.id}`);
	assert.equal(await p.locator('[data-testid=current-scene]').count(), 0);
	void a;
});

test('a scene with an environment shows its name, type, difficulty, impulses and features', async () => {
	const c = await campaign();
	const env = (await api('GET', '/api/srd/environments')).json[0];
	await addScene(c.id, 'Grove', { environmentId: env.id });
	await addScene(c.id, 'Plain');
	const raw = (await import('node:fs')).readFileSync('src/lib/srd/environments.json', 'utf8').replace(/^﻿/, '');
	const full = JSON.parse(raw).find((e) => e.name === env.name || e.name?.['en-US'] === env.name) ?? JSON.parse(raw)[0];
	for (const lang of ['en', 'fr']) {
		const p = await open(`/campaigns/${c.id}/scenario`, lang);
		const el = scene(p, 'Grove');
		const text = (await el.textContent()).replace(/\s+/g, ' ');
		assert.ok(text.includes(String(full.name)), 'name');
		assert.ok(text.includes(String(full.type)), 'type');
		assert.ok(text.includes(String(full.difficulty)), 'difficulty');
		assert.ok(text.includes(String(full.impulses).split(',')[0].trim()), 'impulses');
		assert.ok(await el.locator('details').count() >= 1, 'features in details');
		assert.ok(text.includes(full.feature[0].name.trim()), 'feature name');
		assert.equal(await scene(p, 'Plain').locator('details').count(), 0);
	}
});

test('the scenario page works in English and French', async () => {
	const c = await campaign();
	await addScene(c.id, 'Alpha');
	const en = await open(`/campaigns/${c.id}/scenario`, 'en');
	const fr = await open(`/campaigns/${c.id}/scenario`, 'fr');
	assert.equal(await en.locator('html').getAttribute('lang'), 'en');
	assert.equal(await fr.locator('html').getAttribute('lang'), 'fr');
	assert.notEqual(await en.locator('main, body').first().innerText(), await fr.locator('main, body').first().innerText());
	assert.equal(await fr.locator('[data-testid=scene]').count(), 1);
});
