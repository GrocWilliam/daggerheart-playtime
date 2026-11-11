import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const CARDS = JSON.parse(readFileSync('src/lib/srd/core/domain-cards.json', 'utf8'));
const TEXT = {
	item: { en: 'New item', fr: 'Nouvel objet' },
	experience: { en: 'New experience', fr: 'Nouvelle expérience' },
	card: { en: 'New card', fr: 'Nouvelle carte' }
};
const SECTION = { item: 'sheet-inventory', experience: 'sheet-experiences', card: 'sheet-cards' };
const KINDS = ['item', 'experience', 'card'];
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const t = await r.text();
	return { status: r.status, json: t ? JSON.parse(t) : undefined };
}
let n = 0;
async function mk({ withContent = false } = {}) {
	const camp = (await api('POST', '/api/campaigns', { name: 'Modals ' + ++n })).json;
	const r = await api('POST', `/api/campaigns/${camp.id}/characters`, { name: 'Aria', class: 'Wizard', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	assert.equal(r.status, 201);
	const id = r.json.id;
	if (withContent) {
		await api('POST', `/api/characters/${id}/items`, { name: 'Torch', quantity: 2 });
		await api('POST', `/api/characters/${id}/experiences`, { name: 'Hunter', modifier: 2 });
		await api('POST', `/api/characters/${id}/cards`, { cardId: CARDS[0].id });
	}
	return id;
}
async function open(path, { js = true, lang = 'en', w = 1024, h = 768 } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: w, height: h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);
	await p.goto(BASE + path, { waitUntil: 'networkidle' });
	return { p, close: () => ctx.close() };
}
const post = (path, fields) => fetch(BASE + path, {
	method: 'POST', redirect: 'manual',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html', cookie: 'lang=en' },
	body: new URLSearchParams(fields).toString()
});
function dialogOf(html, kind) {
	const m = html.match(new RegExp(`<dialog\\b[^>]*data-testid="modal-${kind}"[^>]*>([\\s\\S]*?)</dialog>`));
	assert.ok(m, `the HTML has <dialog data-testid="modal-${kind}">`);
	return { tag: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[1] };
}
const hasOpen = (tag) => /\sopen(\s|=|\/?>)/.test(tag);
const dlg = (p, kind) => p.locator(`[data-testid=modal-${kind}]`);
const waitOpen = (p, kind, want) => p.waitForFunction(([k, w]) => document.querySelector(`[data-testid=modal-${k}]`)?.open === w, [kind, want]);
const rowSel = { item: '[data-testid=inventory] [data-testid=item-row]', experience: '[data-testid=experience]', card: '[data-testid=card]' };
// Fill and submit the dialog's form for a kind with a value that is valid.
async function fillValid(p, kind) {
	const d = dlg(p, kind);
	if (kind === 'item') await d.locator('input[name=name]').fill('Rope');
	if (kind === 'experience') await d.locator('input[name=name]').fill('Sailor');
	if (kind === 'card') await d.locator('select[name=cardId]').selectOption(CARDS[3].id);
}
const WORD = { item: 'Rope', experience: 'Sailor', card: null };

// --- openers ---
for (const lang of ['en', 'fr']) {
	test(`new-item, new-experience and new-card are links with the ${lang} texts and ?new= hrefs, placed in their sections`, async () => {
		const id = await mk();
		const { p, close } = await open(`/characters/${id}`, { js: false, lang });
		try {
			for (const k of KINDS) {
				const a = p.locator(`[data-testid=new-${k}]`);
				assert.equal(await a.count(), 1, k);
				assert.equal(await a.evaluate((e) => e.tagName), 'A');
				assert.equal((await a.textContent()).trim(), TEXT[k][lang]);
				assert.ok((await a.getAttribute('href')).endsWith(`?new=${k}`), await a.getAttribute('href'));
				assert.equal(await p.locator(`[data-testid=${SECTION[k]}] [data-testid=new-${k}]`).count(), 1, `${k} in ${SECTION[k]}`);
				assert.equal(await p.locator(`[data-testid=${SECTION[k]}] [data-testid=modal-${k}]`).count(), 1);
			}
		} finally { await close(); }
	});
}

// --- no JavaScript: open dialog ---
test('without JS, GET /characters/:id?new=<kind> serves an open dialog labelled by an h2 with the title', async () => {
	const id = await mk();
	for (const k of KINDS) {
		const html = await (await fetch(`${BASE}/characters/${id}?new=${k}`, { headers: { cookie: 'lang=en', accept: 'text/html' } })).text();
		assert.ok(hasOpen(dialogOf(html, k).tag), `${k}: dialog is open`);
		const { p, close } = await open(`/characters/${id}?new=${k}`, { js: false });
		try {
			const d = dlg(p, k);
			assert.equal(await d.evaluate((e) => e.tagName), 'DIALOG');
			assert.equal(await d.evaluate((e) => e.hasAttribute('open')), true);
			const lid = await d.getAttribute('aria-labelledby');
			assert.ok(lid);
			const h2 = d.locator(`h2[id="${lid}"]`);
			assert.equal(await h2.count(), 1);
			assert.equal((await h2.textContent()).trim(), TEXT[k].en);
		} finally { await close(); }
	}
	const closed = await (await fetch(`${BASE}/characters/${id}`, { headers: { accept: 'text/html' } })).text();
	for (const k of KINDS) assert.ok(!hasOpen(dialogOf(closed, k).tag), `${k}: closed without ?new`);
});

// --- no JavaScript: submit ---
for (const k of KINDS) {
	test(`without JS, submitting the ${k} dialog adds the row`, async () => {
		const id = await mk();
		const { p, close } = await open(`/characters/${id}?new=${k}`, { js: false });
		try {
			await fillValid(p, k);
			await Promise.all([p.waitForLoadState('load'), dlg(p, k).locator('button[type=submit]').click()]);
			await p.locator(rowSel[k]).first().waitFor();
			assert.equal(await p.locator(rowSel[k]).count(), 1);
			if (WORD[k]) assert.ok((await p.locator(rowSel[k]).first().textContent()).includes(WORD[k]));
		} finally { await close(); }
	});
}

// --- JavaScript ---
for (const k of KINDS) {
	test(`with JS, new-${k} opens modal-${k} as a modal focused on its first field; adding closes it and shows the row without reload`, async () => {
		const id = await mk();
		const { p, close } = await open(`/characters/${id}`);
		try {
			await p.evaluate(() => { window.__marker = 'alive'; });
			await p.locator(`[data-testid=new-${k}]`).click();
			await waitOpen(p, k, true);
			const first = k === 'card' ? 'select[name=cardId]' : 'input[name=name]';
			assert.equal(await dlg(p, k).evaluate((d, s) => d.matches(':modal') && document.activeElement === d.querySelector(s), first), true, 'modal with focus on first field');
			await fillValid(p, k);
			await dlg(p, k).locator('button[type=submit]').click();
			await waitOpen(p, k, false);
			await p.locator(rowSel[k]).first().waitFor();
			assert.equal(await p.locator(rowSel[k]).count(), 1);
			if (WORD[k]) assert.ok((await p.locator(rowSel[k]).first().textContent()).includes(WORD[k]));
			assert.equal(await p.evaluate(() => window.__marker), 'alive', 'no document reload');
		} finally { await close(); }
	});
}

// --- invalid submissions ---
test('with JS, an invalid experience keeps the dialog open with an alert inside and the typed modifier', async () => {
	const id = await mk();
	const { p, close } = await open(`/characters/${id}`);
	try {
		await p.locator('[data-testid=new-experience]').click();
		await waitOpen(p, 'experience', true);
		const d = dlg(p, 'experience');
		await d.locator('input[name=name]').evaluate((e) => e.removeAttribute('required'));
		await d.locator('input[name=name]').fill('');
		await d.locator('input[name=modifier]').fill('4');
		await d.locator('button[type=submit]').click();
		await d.locator('[role=alert]').waitFor();
		assert.equal(await d.evaluate((e) => e.open), true);
		assert.equal(await d.locator('input[name=modifier]').inputValue(), '4');
		assert.equal(await p.locator('[data-testid=experience]').count(), 0);
	} finally { await close(); }
});
test('with JS, an invalid item keeps the dialog open with an alert and the typed quantity', async () => {
	const id = await mk();
	const { p, close } = await open(`/characters/${id}`);
	try {
		await p.locator('[data-testid=new-item]').click();
		await waitOpen(p, 'item', true);
		const d = dlg(p, 'item');
		await d.locator('input[name=name]').evaluate((e) => e.removeAttribute('required'));
		await d.locator('input[name=name]').fill('');
		await d.locator('input[name=quantity]').fill('3');
		await d.locator('button[type=submit]').click();
		await d.locator('[role=alert]').waitFor();
		assert.equal(await d.evaluate((e) => e.open), true);
		assert.equal(await d.locator('input[name=quantity]').inputValue(), '3');
	} finally { await close(); }
});
test('with JS, an invalid card (already held) keeps the dialog open with an alert and the chosen card', async () => {
	const id = await mk();
	await api('POST', `/api/characters/${id}/cards`, { cardId: CARDS[3].id });
	const { p, close } = await open(`/characters/${id}`);
	try {
		await p.locator('[data-testid=new-card]').click();
		await waitOpen(p, 'card', true);
		const d = dlg(p, 'card');
		await d.locator('select[name=cardId]').selectOption(CARDS[3].id);
		await d.locator('button[type=submit]').click();
		await d.locator('[role=alert]').waitFor();
		assert.equal(await d.evaluate((e) => e.open), true);
		assert.equal(await d.locator('select[name=cardId]').inputValue(), CARDS[3].id);
		assert.equal(await p.locator('[data-testid=card]').count(), 1);
	} finally { await close(); }
});
test('without JS, an invalid POST re-renders the sheet with the dialog open, an alert inside and the typed values', async () => {
	const id = await mk();
	const cases = [
		['experience', 'addExperience', { name: '', modifier: '4' }, /value="4"/],
		['item', 'addItem', { name: '', quantity: '3' }, /value="3"/],
		['card', 'addCard', { cardId: 'nope' }, null]
	];
	for (const [k, action, fields, kept] of cases) {
		const r = await post(`/characters/${id}?/${action}`, fields);
		assert.equal(r.status, 400, k);
		const { tag, inner } = dialogOf(await r.text(), k);
		assert.ok(hasOpen(tag), `${k}: dialog open`);
		assert.match(inner, /role="alert"/, `${k}: alert inside the dialog`);
		if (kept) assert.match(inner, kept, `${k}: typed value kept`);
	}
});

// --- closing ---
for (const k of KINDS) {
	test(`Escape and modal-cancel close modal-${k} and return focus to new-${k}`, async () => {
		const id = await mk();
		const { p, close } = await open(`/characters/${id}`);
		try {
			const focused = () => p.waitForFunction((kk) => document.activeElement === document.querySelector(`[data-testid=new-${kk}]`), k);
			await p.locator(`[data-testid=new-${k}]`).click();
			await waitOpen(p, k, true);
			await p.keyboard.press('Escape');
			await waitOpen(p, k, false);
			await focused();
			await p.locator(`[data-testid=new-${k}]`).click();
			await waitOpen(p, k, true);
			await dlg(p, k).locator('[data-testid=modal-cancel]').click();
			await waitOpen(p, k, false);
			await focused();
		} finally { await close(); }
	});
}

test('the edit form is inside the modal-edit dialog', async () => {
	const id = await mk();
	for (const js of [false, true]) {
		const { p, close } = await open(`/characters/${id}`, { js });
		try {
			const f = p.locator('form[action="?/edit"]');
			assert.equal(await f.count(), 1);
			assert.equal(await f.evaluate((e) => e.closest('dialog')?.dataset.testid), 'modal-edit');
		} finally { await close(); }
	}
});

// --- layout ---
const CONTROLS = 'a, button, input, select, textarea, summary';
for (const [w, h] of [[375, 812], [768, 1024], [1024, 768], [1180, 820]]) {
	for (const state of ['closed', 'open']) {
		test(`${w}x${h}, ${state === 'open' ? '?new=item open' : 'dialogs closed'}: no sideways scroll, controls >= 44x44, text inputs 16px`, async () => {
			const id = await mk({ withContent: true });
			const { p, close } = await open(`/characters/${id}${state === 'open' ? '?new=item' : ''}`, { w, h });
			try {
				if (state === 'open') await waitOpen(p, 'item', true);
				const sw = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
				assert.ok(sw[0] <= sw[1], `scrollWidth ${sw[0]} > ${sw[1]}`);
				const small = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => {
					const s = getComputedStyle(e), r = e.getBoundingClientRect();
					return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'hidden';
				}).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName + (e.dataset.testid ? '#' + e.dataset.testid : ''), r.width, r.height]; })
					.filter(([, ww, hh]) => ww < 43.5 || hh < 43.5), CONTROLS);
				assert.deepEqual(small, [], 'small controls');
				const bad = await p.evaluate(() => [...document.querySelectorAll('input')]
					.filter((e) => ['text', 'search', 'number', 'email', 'tel', 'url', 'password'].includes(e.type) && e.getBoundingClientRect().width > 0)
					.map((e) => getComputedStyle(e).fontSize).filter((f) => f !== '16px'));
				assert.deepEqual(bad, [], 'input font sizes');
				if (state === 'open') {
					assert.equal(await dlg(p, 'item').locator('input[name=name]').count(), 1);
					assert.ok(await dlg(p, 'item').locator('input[name=name]').isVisible());
				}
			} finally { await close(); }
		});
	}
}
