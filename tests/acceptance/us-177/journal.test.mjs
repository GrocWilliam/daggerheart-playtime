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
const campaign = async () => (await api('POST', '/api/campaigns', { name: 'Jcamp' })).json;
const list = async (id) => (await api('GET', `/api/campaigns/${id}/journal`)).json;
async function open(path, lang = 'en', js = true) {
	const ctx = await browser.newContext({ javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(5000);
	await p.goto(BASE + path);
	return p;
}
const postForm = async (path, fields) => {
	const r = await fetch(BASE + path, {
		method: 'POST', redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' },
		body: new URLSearchParams(fields).toString()
	});
	return { status: r.status, text: await r.text() };
};
const hhmm = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const entries = (p) => p.locator('[data-testid=journal] [data-testid=journal-entry]');

for (const js of [false, true]) {
	test(`addJournal then Run step shows entries newest first with HH:MM (js=${js})`, async () => {
		const c = await campaign();
		const p = await open(`/campaigns/${c.id}?step=run`, 'en', js);
		for (const text of ['Found a key', 'Opened the door']) {
			const before = (await list(c.id)).length;
			await p.locator('[data-testid=journal] textarea[name=text]').fill(text);
			await p.getByRole('button', { name: 'Add to journal', exact: true }).click();
			await p.waitForFunction((n) => document.querySelectorAll('[data-testid=journal-entry]').length === n, before + 1);
			assert.equal(await p.locator('[data-testid=journal] textarea[name=text]').inputValue(), '');
		}
		const api_ = await list(c.id);
		assert.equal(api_.length, 2);
		const p2 = await open(`/campaigns/${c.id}?step=run`);
		assert.equal(await entries(p2).count(), 2);
		const first = await entries(p2).nth(0).textContent();
		const second = await entries(p2).nth(1).textContent();
		assert.ok(first.includes('Opened the door'), first);
		assert.ok(second.includes('Found a key'), second);
		const byText = (t) => api_.find((e) => e.text === t);
		assert.ok(first.includes(hhmm(byText('Opened the door').createdAt)), first);
		assert.ok(second.includes(hhmm(byText('Found a key').createdAt)), second);
	});
}

test('addJournal via raw POST creates the entry', async () => {
	const c = await campaign();
	await postForm(`/campaigns/${c.id}?/addJournal`, { text: 'Found a key' });
	const p = await open(`/campaigns/${c.id}?step=run`);
	assert.equal(await entries(p).count(), 1);
	assert.ok((await entries(p).first().textContent()).includes('Found a key'));
});

test('addJournal with empty text shows error.invalid and creates nothing', async () => {
	const c = await campaign();
	const r = await postForm(`/campaigns/${c.id}?/addJournal`, { text: '' });
	assert.ok(r.text.includes('Please check the fields and try again.'));
	assert.equal((await list(c.id)).length, 0);
});

test('deleteJournal removes only that entry; button inside the entry', async () => {
	const c = await campaign();
	const a = (await api('POST', `/api/campaigns/${c.id}/journal`, { text: 'Alpha note' })).json;
	const b = (await api('POST', `/api/campaigns/${c.id}/journal`, { text: 'Bravo note' })).json;
	const p = await open(`/campaigns/${c.id}?step=run`, 'en', false);
	const entry = entries(p).filter({ hasText: 'Alpha note' });
	assert.equal(await entry.count(), 1);
	assert.equal(await entry.locator('input[name=entryId]').inputValue(), a.id);
	await entry.locator('button').click();
	await p.waitForLoadState();
	const left = await list(c.id);
	assert.deepEqual(left.map((e) => e.id), [b.id]);
	assert.equal(await entries(p).count(), 1);
	assert.ok((await entries(p).first().textContent()).includes('Bravo note'));
});

test('deleteJournal with unknown id shows error.notFound and keeps entries', async () => {
	const c = await campaign();
	await api('POST', `/api/campaigns/${c.id}/journal`, { text: 'Keep me' });
	const r = await postForm(`/campaigns/${c.id}?/deleteJournal`, { entryId: '00000000-0000-4000-8000-000000000000' });
	assert.ok(r.text.includes('Not found.'));
	assert.equal((await list(c.id)).length, 1);
});

test('journal section is absent from ?step=build and present in run', async () => {
	const c = await campaign();
	const b = await open(`/campaigns/${c.id}?step=build`);
	assert.equal(await b.locator('[data-testid=journal]').count(), 0);
	const r = await open(`/campaigns/${c.id}?step=run`);
	assert.equal(await r.locator('[data-testid=journal]').count(), 1);
});

test('French page shows Ajouter au journal', async () => {
	const c = await campaign();
	const p = await open(`/campaigns/${c.id}?step=run`, 'fr');
	assert.equal(await p.locator('[data-testid=journal]').getByRole('button', { name: 'Ajouter au journal', exact: true }).count(), 1);
});
