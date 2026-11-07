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
const campaign = async (name = 'Modal Scenes') => (await api('POST', '/api/campaigns', { name })).json;
async function open(path, { js = true, lang = 'en', w = 1024, h = 768 } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: w, height: h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);
	await p.goto(BASE + path, { waitUntil: js ? 'networkidle' : 'load' });
	return { p, close: () => ctx.close() };
}
const DLG = '[data-testid=modal-scene]';
const OPENER = '[data-testid=new-scene]';
const waitOpen = (p, want) => p.waitForFunction(([s, want]) => document.querySelector(s)?.open === want, [DLG, want]);
const isOpen = (p) => p.locator(DLG).evaluate((d) => d.open);
const titles = async (id) => (await api('GET', `/api/campaigns/${id}/scenes`)).json.map((s) => s.title);

for (const [lang, text] of [['en', 'New scene'], ['fr', 'Nouvelle scène']]) {
	test(`new-scene is a link "${text}" (${lang}) with step=build and new=scene; no title input visible before opening`, async () => {
		const c = await campaign();
		const { p, close } = await open(`/campaigns/${c.id}?step=build`, { lang });
		try {
			const a = p.locator(OPENER);
			assert.equal(await a.count(), 1);
			assert.equal(await a.evaluate((e) => e.tagName), 'A');
			assert.equal((await a.textContent()).trim(), text);
			const href = await a.getAttribute('href');
			assert.ok(href.includes('step=build') && href.includes('new=scene'), href);
			assert.equal(await p.locator('input[name=title]:visible').count(), 0);
		} finally { await close(); }
	});
}

test('without JS, GET ?step=build&new=scene serves an open modal-scene dialog labelled by an h2 "New scene"', async () => {
	const c = await campaign();
	const { p, close } = await open(`/campaigns/${c.id}?step=build&new=scene`, { js: false });
	try {
		const d = p.locator(DLG);
		assert.equal(await d.evaluate((e) => e.tagName), 'DIALOG');
		assert.equal(await d.evaluate((e) => e.hasAttribute('open')), true);
		const id = await d.getAttribute('aria-labelledby');
		assert.ok(id);
		const h2 = d.locator(`h2[id="${id}"]`);
		assert.equal(await h2.count(), 1);
		assert.equal((await h2.textContent()).trim(), 'New scene');
	} finally { await close(); }
});

test('without JS, submitting a title lands on ?step=build and the scene shows', async () => {
	const c = await campaign();
	const { p, close } = await open(`/campaigns/${c.id}?step=build&new=scene`, { js: false });
	try {
		const d = p.locator(DLG);
		await d.locator('input[name=title]').fill('Plain Gate');
		await Promise.all([p.waitForURL(/\/campaigns\/[^/?]+\?step=build$/), d.locator('button[type=submit]').click()]);
		await p.locator('[data-testid=scene]', { hasText: 'Plain Gate' }).waitFor();
		assert.deepEqual(await titles(c.id), ['Plain Gate']);
	} finally { await close(); }
});

test('with JS, new-scene opens modal-scene as a modal with focus on the first field, no navigation; submitting closes it and adds the scene without reload', async () => {
	const c = await campaign();
	const { p, close } = await open(`/campaigns/${c.id}?step=build`);
	try {
		await p.evaluate(() => { window.__marker = 'alive'; window.__navs = []; navigation.addEventListener('navigate', (e) => window.__navs.push(e.destination.url)); });
		await p.locator(OPENER).click();
		await waitOpen(p, true);
		assert.deepEqual(await p.evaluate(() => window.__navs), []);
		assert.equal(await p.locator(DLG).evaluate((d) => d.matches(':modal')), true);
		const focusIsFirst = await p.locator(DLG).evaluate((d) => {
			const first = d.querySelector('input:not([type=hidden]), textarea, select');
			return document.activeElement === first && first.getAttribute('name') === 'title';
		});
		assert.equal(focusIsFirst, true, 'focus on the first field (title)');
		await p.locator(DLG).locator('input[name=title]').fill('The Broken Bridge');
		await p.locator(DLG).locator('button[type=submit]').click();
		await waitOpen(p, false);
		await p.locator('[data-testid=scene]', { hasText: 'The Broken Bridge' }).waitFor();
		assert.equal(await p.evaluate(() => window.__marker), 'alive');
		assert.deepEqual(await titles(c.id), ['The Broken Bridge']);
	} finally { await close(); }
});

test('with JS, an empty title keeps modal-scene open with an alert inside and other typed values kept', async () => {
	const c = await campaign();
	const { p, close } = await open(`/campaigns/${c.id}?step=build`);
	try {
		await p.locator(OPENER).click();
		await waitOpen(p, true);
		const d = p.locator(DLG);
		await d.locator('textarea[name=notes]').fill('Keep these notes');
		await d.locator('input[name=title]').evaluate((i) => i.form.setAttribute('novalidate', ''));
		await d.locator('button[type=submit]').click();
		await d.locator('[role=alert]').waitFor();
		assert.equal(await isOpen(p), true);
		assert.equal(await d.locator('textarea[name=notes]').inputValue(), 'Keep these notes');
		assert.deepEqual(await titles(c.id), []);
	} finally { await close(); }
});

test('without JS, POST ?/add&step=build with an empty title re-renders the page with the dialog open, alert inside, values kept', async () => {
	const c = await campaign();
	const r = await fetch(`${BASE}/campaigns/${c.id}?/add&step=build`, {
		method: 'POST', redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html', cookie: 'lang=en' },
		body: new URLSearchParams({ title: '', notes: 'Kept notes', environmentId: '' }).toString()
	});
	assert.equal(r.status, 400);
	const html = await r.text();
	const m = html.match(/<dialog\b[^>]*data-testid="modal-scene"[^>]*>([\s\S]*?)<\/dialog>/);
	assert.ok(m, 'modal-scene dialog present');
	assert.match(m[0].slice(0, m[0].indexOf('>')), /\sopen(\s|=|$)/);
	assert.match(m[1], /role="alert"/);
	assert.ok(m[1].includes('Kept notes'));
});

test('Escape and modal-cancel close the dialog and return focus to new-scene', async () => {
	const c = await campaign();
	const { p, close } = await open(`/campaigns/${c.id}?step=build`);
	try {
		for (const how of ['escape', 'cancel']) {
			await p.locator(OPENER).click();
			await waitOpen(p, true);
			if (how === 'escape') await p.keyboard.press('Escape');
			else await p.locator(`${DLG} [data-testid=modal-cancel]`).click();
			await waitOpen(p, false);
			await p.waitForFunction((s) => document.activeElement === document.querySelector(s), OPENER);
		}
	} finally { await close(); }
});

for (const [w, h] of [[375, 812], [768, 1024], [1024, 768], [1180, 820]]) {
	test(`at ${w}x${h}, closed and open: no sideways scroll, visible controls at least 44x44`, async () => {
		const c = await campaign();
		await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Existing' });
		const { p, close } = await open(`/campaigns/${c.id}?step=build`, { w, h });
		try {
			const check = async (scope, label) => {
				const r = await p.evaluate((scope) => {
					const root = document.querySelector(scope) ?? document;
					const small = [];
					for (const e of root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')) {
						if (e.closest('dialog') && scope === 'body' && !e.closest('dialog[open]')) continue;
						const b = e.getBoundingClientRect();
						const cs = getComputedStyle(e);
						if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
						if (e.type === 'checkbox' || e.type === 'radio') continue;
						if (b.width < 43.5 || b.height < 43.5) small.push(`${e.tagName}[${e.getAttribute('name') ?? e.getAttribute('data-testid') ?? ''}] ${Math.round(b.width)}x${Math.round(b.height)}`);
					}
					const de = document.documentElement;
					return { small, over: de.scrollWidth - de.clientWidth };
				}, scope);
				assert.ok(r.over <= 1, `${label}: sideways scroll ${r.over}`);
				assert.deepEqual(r.small, [], `${label}: small controls`);
			};
			await check('body', 'closed');
			await p.locator(OPENER).click();
			await waitOpen(p, true);
			await check('body', 'open');
		} finally { await close(); }
	});
}

test('journal (run step), encounter and loot forms are not inside any dialog', async () => {
	const c = await campaign();
	const s = (await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Ambush' })).json;
	assert.ok(s?.id);
	const run = await open(`/campaigns/${c.id}?step=run`);
	try {
		const f = run.p.locator('form[action^="?/addJournal"]');
		assert.equal(await f.count(), 1);
		assert.equal(await f.evaluate((e) => !!e.closest('dialog')), false);
	} finally { await run.close(); }
	const build = await open(`/campaigns/${c.id}?step=build`);
	try {
		const scene = build.p.locator('[data-testid=scene]', { hasText: 'Ambush' });
		const forms = await scene.locator('form').evaluateAll((fs) => fs.map((f) => ({ action: f.getAttribute('action') ?? '', inDialog: !!f.closest('dialog') })));
		assert.ok(forms.length > 0);
		assert.deepEqual(forms.filter((f) => f.inDialog), []);
		assert.equal(await build.p.locator(`${DLG} form`).count() >= 1, true);
	} finally { await build.close(); }
});
