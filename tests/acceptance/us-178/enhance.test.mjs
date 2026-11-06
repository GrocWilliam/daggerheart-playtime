import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const EN = JSON.parse(readFileSync('src/lib/i18n/en.json', 'utf8'));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const CH = { class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };
async function setup(name = 'Enhcamp') {
	const c = (await api('POST', '/api/campaigns', { name })).json;
	const ch = (await api('POST', `/api/campaigns/${c.id}/characters`, { ...CH, name: 'Alyndra' })).json;
	return { c, ch };
}
async function open(path, { js = true, viewport } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport });
	await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	await p.goto(BASE + path);
	if (js) await p.waitForLoadState('networkidle');
	return p;
}
const mark = (p) => p.evaluate(() => { window.__marker = 1; });
async function assertInPlace(p) {
	assert.equal(await p.evaluate(() => window.__marker), 1, 'document was reloaded (marker lost)');
	assert.equal(await p.evaluate(() => performance.getEntriesByType('navigation').length), 1);
}
const fearForm = (p) => p.locator('form[action="?/fear"]');
const trackerBtn = (p, key, delta, scope = p) => scope.locator(`form:has(input[name=tracker][value=${key}]) button[name=delta][value="${delta}"]`);
const card = (p) => p.locator('[data-testid=character-card]', { hasText: 'Alyndra' });
const journalForm = (p) => p.locator('[data-testid=journal] form[action="?/addJournal"]');
const sceneForm = (p) => p.locator('form[action^="?/add&"]');
const postForm = (path, fields) =>
	fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' }, body: new URLSearchParams(fields).toString() });

test('with JS: fear form updates in place (no reload)', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=run`);
	await mark(p);
	await fearForm(p).locator('button[value="1"]').click();
	await p.waitForFunction(() => document.querySelector('[data-testid=fear]')?.textContent.trim() === '1');
	await assertInPlace(p);
	assert.equal((await api('GET', `/api/campaigns/${c.id}`)).json.fear, 1);
});

test('with JS: campaign tracker and damage forms update in place', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=run`);
	await mark(p);
	await trackerBtn(p, 'stress', 1, card(p)).click();
	await p.waitForFunction(() => /^1\//.test(document.querySelector('[data-testid=character-card] [data-testid=stress]')?.textContent.trim() ?? ''));
	const dmg = card(p).locator('form[action="?/damage"]');
	await dmg.locator('input[name=amount]').fill('1');
	await dmg.locator('button[type=submit]').click();
	await p.waitForFunction(() => /^1\//.test(document.querySelector('[data-testid=character-card] [data-testid=hp]')?.textContent.trim() ?? ''));
	await assertInPlace(p);
});

test('with JS: add scene (build step) updates in place', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=build`);
	await mark(p);
	await sceneForm(p).locator('input[name=title]').fill('Moonlit Bridge');
	await sceneForm(p).locator('button[type=submit]').click();
	await p.locator('[data-testid=scene]', { hasText: 'Moonlit Bridge' }).waitFor();
	await assertInPlace(p);
	assert.equal((await api('GET', `/api/campaigns/${c.id}/scenes`)).json.length, 1);
});

test('with JS: journal form updates in place', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=run`);
	await mark(p);
	await journalForm(p).locator('textarea[name=text]').fill('The bridge held');
	await journalForm(p).locator('button[type=submit]').click();
	await p.locator('[data-testid=journal-entry]', { hasText: 'The bridge held' }).waitFor();
	await assertInPlace(p);
});

test('with JS: add character form updates in place', async () => {
	const { c } = await setup();
	// us-197: Build has no inline add-character form any more; the Run step keeps it.
	const p = await open(`/campaigns/${c.id}?step=run`);
	await mark(p);
	const f = p.locator('form[action="?/addCharacter"]');
	const vals = { name: 'Brindle', level: '1', evasion: '10', majorThreshold: '5', severeThreshold: '10', maxHp: '6', maxStress: '6', armorSlots: '3' };
	for (const [k, v] of Object.entries(vals)) await f.locator(`input[name=${k}]`).fill(v);
	const cls = await f.locator('select[name=class] option').evaluateAll((os) => os.map((o) => o.value).find((v) => v));
	await f.locator('select[name=class]').selectOption(cls);
	await f.locator('button[type=submit]').click();
	await p.waitForFunction(async (id) => (await (await fetch(`/api/campaigns/${id}`)).json()).characters.length === 2, c.id);
	await p.getByText('Brindle').first().waitFor();
	await assertInPlace(p);
});

test('with JS: character page tracker and damage forms update in place', async () => {
	const { ch } = await setup();
	const p = await open(`/characters/${ch.id}`);
	await mark(p);
	await trackerBtn(p, 'stress', 1).click();
	await p.waitForFunction(() => /^1\//.test(document.querySelector('[data-testid=stress]')?.textContent.trim() ?? ''));
	await p.locator('form[action="?/damage"] input[name=amount]').fill('1');
	await p.locator('form[action="?/damage"] button[type=submit]').click();
	await p.waitForFunction(() => /^1\//.test(document.querySelector('[data-testid=hp]')?.textContent.trim() ?? ''));
	await assertInPlace(p);
});

async function holdPosts(p) {
	let release;
	const gate = new Promise((r) => { release = r; });
	await p.route('**/*', async (route) => {
		if (route.request().method() === 'POST') await gate;
		await route.continue().catch(() => {});
	});
	return release;
}

test('during a slow submit the clicked button is aria-busy and disabled; neither remains afterwards', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=run`);
	const release = await holdPosts(p);
	const btn = fearForm(p).locator('button[value="1"]');
	await btn.click();
	await p.waitForSelector('form[action="?/fear"] button[value="1"][aria-busy=true]');
	assert.equal(await btn.isDisabled(), true);
	release();
	await p.waitForFunction(() => document.querySelector('[data-testid=fear]')?.textContent.trim() === '1');
	await p.waitForFunction(() => !document.querySelector('[aria-busy=true]') && !document.querySelector('form[action="?/fear"] button:disabled'));
	assert.equal(await btn.getAttribute('aria-busy'), null);
	assert.equal(await btn.isDisabled(), false);
});

test('a slow journal submit marks only its own button busy', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=run`);
	const release = await holdPosts(p);
	await journalForm(p).locator('textarea[name=text]').fill('slow one');
	const add = journalForm(p).locator('button[type=submit]');
	await add.click();
	await p.waitForSelector('[data-testid=journal] form[action="?/addJournal"] button[aria-busy=true]');
	assert.equal(await add.isDisabled(), true);
	assert.equal(await fearForm(p).locator('button[value="1"]').isDisabled(), false);
	release();
	await p.locator('[data-testid=journal-entry]', { hasText: 'slow one' }).waitFor();
	await p.waitForFunction(() => !document.querySelector('[aria-busy=true]'));
	assert.equal(await add.isDisabled(), false);
});

test('a page scrolled down keeps its scroll position after a submit', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=run`, { viewport: { width: 390, height: 420 } });
	await mark(p);
	await journalForm(p).locator('button[type=submit]').scrollIntoViewIfNeeded();
	await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	const y0 = await p.evaluate(() => window.scrollY);
	assert.ok(y0 > 0, 'page must be scrollable');
	await journalForm(p).locator('textarea[name=text]').fill('scroll check');
	await journalForm(p).locator('button[type=submit]').click();
	await p.locator('[data-testid=journal-entry]', { hasText: 'scroll check' }).waitFor();
	await assertInPlace(p);
	const y1 = await p.evaluate(() => window.scrollY);
	assert.ok(y1 > 0 && Math.abs(y1 - y0) <= 3, `scrollY ${y0} -> ${y1}`);
});

test('a form error (blank scene title) shows the same error text without a reload', async () => {
	const { c } = await setup();
	const p = await open(`/campaigns/${c.id}?step=build`);
	await mark(p);
	await sceneForm(p).evaluate((f) => { f.noValidate = true; });
	await sceneForm(p).locator('input[name=title]').fill('   ');
	await sceneForm(p).locator('button[type=submit]').click();
	const alert = p.getByRole('alert').filter({ hasText: EN['error.invalid'] });
	await alert.first().waitFor();
	assert.equal(await alert.count(), 1);
	await assertInPlace(p);
	assert.equal((await api('GET', `/api/campaigns/${c.id}/scenes`)).json.length, 0);
});

test('home: a blank campaign name shows the error without a reload', async () => {
	const p = await open('/');
	await mark(p);
	const f = p.locator('form:has(input[name=name])').first();
	await f.evaluate((x) => { x.noValidate = true; });
	await f.locator('input[name=name]').fill('   ');
	await f.locator('button[type=submit]').click();
	await p.getByRole('alert').filter({ hasText: EN['home.error'] }).waitFor();
	await assertInPlace(p);
});

test('creating a campaign ends at /campaigns/<id>?step=build with the marker still present', async () => {
	const p = await open('/');
	await mark(p);
	const f = p.locator('form:has(input[name=name])').first();
	await f.locator('input[name=name]').fill('Enhanced Start');
	await f.locator('button[type=submit]').click();
	await p.waitForURL(/\/campaigns\/[^/?]+\?step=build$/);
	await p.locator('[data-testid=campaign-name]', { hasText: 'Enhanced Start' }).waitFor();
	await assertInPlace(p);
});

test('without JavaScript the same forms still work as full-page POSTs', async () => {
	const { c, ch } = await setup();
	let p = await open(`/campaigns/${c.id}?step=run`, { js: false });
	await Promise.all([p.waitForNavigation(), fearForm(p).locator('button[value="1"]').click()]);
	assert.equal((await p.locator('[data-testid=fear]').textContent()).trim(), '1');
	await journalForm(p).locator('textarea[name=text]').fill('plain post');
	await Promise.all([p.waitForNavigation(), journalForm(p).locator('button[type=submit]').click()]);
	await p.locator('[data-testid=journal-entry]', { hasText: 'plain post' }).waitFor();
	p = await open(`/campaigns/${c.id}?step=build`, { js: false });
	await sceneForm(p).locator('input[name=title]').fill('Plain Scene');
	await Promise.all([p.waitForNavigation(), sceneForm(p).locator('button[type=submit]').click()]);
	await p.locator('[data-testid=scene]', { hasText: 'Plain Scene' }).waitFor();
	p = await open(`/characters/${ch.id}`, { js: false });
	await p.locator('form[action="?/damage"] input[name=amount]').fill('1');
	await Promise.all([p.waitForNavigation(), p.locator('form[action="?/damage"] button[type=submit]').click()]);
	assert.match((await p.locator('[data-testid=hp]').textContent()).trim(), /^1\//);
	p = await open('/', { js: false });
	await p.locator('form:has(input[name=name])').first().locator('input[name=name]').fill('Plain Camp');
	await Promise.all([p.waitForNavigation(), p.locator('form:has(input[name=name])').first().locator('button[type=submit]').click()]);
	assert.match(p.url(), /\/campaigns\/[^/?]+\?step=build$/);
});

test('without JavaScript a form error is still shown', async () => {
	const { c } = await setup();
	const r = await postForm(`/campaigns/${c.id}?/add&step=build`, { title: '   ', notes: '', environmentId: '' });
	assert.equal(r.status, 400);
	assert.ok((await r.text()).includes(EN['error.invalid']));
});

// ---- source scans ----
function formTags(src) {
	const tags = [];
	for (let i = src.indexOf('<form'); i !== -1; i = src.indexOf('<form', i + 1)) {
		if (!/[\s>]/.test(src[i + 5] ?? '')) continue;
		let depth = 0, q = null, j = i + 5;
		for (; j < src.length; j++) {
			const ch = src[j];
			if (q) { if (ch === q) q = null; continue; }
			if (ch === '"' || ch === "'") { if (depth === 0 || true) q = ch; continue; }
			if (ch === '{') depth++;
			else if (ch === '}') depth--;
			else if (ch === '>' && depth === 0) break;
		}
		tags.push(src.slice(i, j + 1));
	}
	return tags;
}
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('every <form method="POST"> in the home, DM and character pages (and shared components) has use:enhance', () => {
	const files = ['src/routes/+page.svelte', 'src/routes/campaigns/[id]/+page.svelte', 'src/routes/characters/[id]/+page.svelte',
		...walk('src/lib/components').filter((f) => f.endsWith('.svelte'))];
	let posts = 0;
	for (const f of files) {
		const src = readFileSync(f, 'utf8');
		const tags = formTags(src).filter((t) => /method\s*=\s*["']?post/i.test(t));
		posts += tags.length;
		for (const t of tags) assert.match(t, /use:enhance/, `${f}: ${t.replace(/\s+/g, ' ').slice(0, 100)}`);
		if (tags.length) assert.match(src, /import\s*\{[^}]*\benhance\b[^}]*\}\s*from\s*['"]\$app\/forms['"]/, `${f} imports enhance`);
	}
	assert.ok(posts >= 10, 'the scan found the POST forms');
});

test('no data-sveltekit-reload anywhere in src', () => {
	const hits = walk('src').filter((f) => /\.(svelte|ts|js|html)$/.test(f) && readFileSync(f, 'utf8').includes('data-sveltekit-reload'));
	assert.deepEqual(hits, []);
});
