import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const dict = { en: JSON.parse(readFileSync('src/lib/i18n/en.json', 'utf8')), fr: JSON.parse(readFileSync('src/lib/i18n/fr.json', 'utf8')) };
const TITLE = { en: 'New campaign', fr: 'Nouvelle campagne' };
const BUILD_URL = /\/campaigns\/[^/?]+\?step=build$/;
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(path, { js = true, lang = 'en', w = 1024, h = 768 } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: w, height: h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);
	await p.goto(BASE + path, { waitUntil: 'networkidle' });
	return { p, close: () => ctx.close() };
}
const get = async (path, lang = 'en') => {
	const r = await fetch(BASE + path, { headers: { cookie: `lang=${lang}`, accept: 'text/html' } });
	return { status: r.status, html: await r.text() };
};
const postHome = (name) => fetch(BASE + '/', {
	method: 'POST', redirect: 'manual',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html', cookie: 'lang=en' },
	body: new URLSearchParams({ name }).toString()
});
/** The opening <dialog ...> tag carrying data-testid="modal-campaign", and the dialog's inner HTML. */
function dialogOf(html) {
	const m = html.match(/<dialog\b[^>]*data-testid="modal-campaign"[^>]*>([\s\S]*?)<\/dialog>/);
	assert.ok(m, 'the HTML has a <dialog data-testid="modal-campaign">');
	return { tag: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[1] };
}
const hasOpen = (tag) => /\sopen(\s|=|\/?>)/.test(tag);
const dialogState = (p) => p.locator('[data-testid=modal-campaign]').evaluate((d) => ({
	open: d.open, modal: d.matches(':modal'),
	active: document.activeElement === d.querySelector('input[name=name]') ? 'name'
		: document.activeElement === document.querySelector('[data-testid=new-campaign]') ? 'opener'
		: document.activeElement?.outerHTML.slice(0, 80)
}));
const waitOpen = (p, want) => p.waitForFunction((want) => document.querySelector('[data-testid=modal-campaign]')?.open === want, want);
async function openWithJs(p) {
	await p.locator('[data-testid=new-campaign]').click();
	await waitOpen(p, true);
}

// --- opener ---
for (const lang of ['en', 'fr']) {
	test(`new-campaign is an a with text "${TITLE[lang]}" (${lang}) and an href ending with ?new=campaign`, async () => {
		const { p, close } = await open('/', { js: false, lang });
		try {
			const a = p.locator('[data-testid=new-campaign]');
			assert.equal(await a.count(), 1);
			assert.equal(await a.evaluate((e) => e.tagName), 'A');
			assert.equal((await a.textContent()).trim(), TITLE[lang]);
			assert.ok((await a.getAttribute('href')).endsWith('?new=campaign'), await a.getAttribute('href'));
			assert.equal(dict[lang]['home.new'], TITLE[lang]);
		} finally { await close(); }
	});
}

// --- no JavaScript ---
test('without JS, GET /?new=campaign serves an open modal-campaign dialog labelled by its h2 "New campaign"', async () => {
	const { status, html } = await get('/?new=campaign');
	assert.equal(status, 200);
	const { tag } = dialogOf(html);
	assert.ok(hasOpen(tag), `dialog tag has open: ${tag}`);
	for (const lang of ['en', 'fr']) {
		const { p, close } = await open('/?new=campaign', { js: false, lang });
		try {
			const d = p.locator('[data-testid=modal-campaign]');
			assert.equal(await d.evaluate((e) => e.tagName), 'DIALOG');
			assert.equal(await d.evaluate((e) => e.hasAttribute('open')), true);
			const id = await d.getAttribute('aria-labelledby');
			assert.ok(id, 'aria-labelledby is set');
			const h2 = d.locator(`h2[id="${id}"]`);
			assert.equal(await h2.count(), 1, `an h2#${id} inside the dialog`);
			assert.equal((await h2.textContent()).trim(), TITLE[lang]);
		} finally { await close(); }
	}
});

test('without JS, modal-cancel inside the dialog links to / and GET / serves modal-campaign without open', async () => {
	const { p, close } = await open('/?new=campaign', { js: false });
	try {
		const cancel = p.locator('[data-testid=modal-campaign] [data-testid=modal-cancel]');
		assert.equal(await cancel.count(), 1);
		assert.equal((await cancel.textContent()).trim(), dict.en['modal.cancel']);
		assert.equal(dict.en['modal.cancel'], 'Cancel');
		const u = new URL(await cancel.getAttribute('href'), BASE + '/?new=campaign');
		assert.equal(u.pathname + u.search, '/');
	} finally { await close(); }
	const fr = await open('/?new=campaign', { js: false, lang: 'fr' });
	try {
		assert.equal((await fr.p.locator('[data-testid=modal-campaign] [data-testid=modal-cancel]').textContent()).trim(), 'Annuler');
	} finally { await fr.close(); }
	const { status, html } = await get('/');
	assert.equal(status, 200);
	const { tag } = dialogOf(html);
	assert.ok(!hasOpen(tag), `dialog tag has no open: ${tag}`);
});

test('without JS, submitting a name in the server-rendered dialog lands on /campaigns/:id?step=build', async () => {
	const { p, close } = await open('/?new=campaign', { js: false });
	try {
		const d = p.locator('[data-testid=modal-campaign]');
		await d.locator('input[name=name]').fill('Nojs Modal Camp');
		await Promise.all([p.waitForURL(BUILD_URL), d.locator('button[type=submit]').click()]);
		assert.equal((await p.locator('[data-testid=campaign-name]').textContent()).trim(), 'Nojs Modal Camp');
	} finally { await close(); }
});

// --- JavaScript ---
test('with JS, clicking new-campaign opens the modal without navigating and focuses the name input; Escape closes it and focus returns to new-campaign', async () => {
	const { p, close } = await open('/');
	try {
		await p.evaluate(() => {
			window.__marker = 'alive';
			window.__navs = [];
			navigation.addEventListener('navigate', (e) => window.__navs.push(e.destination.url));
		});
		await p.locator('[data-testid=new-campaign]').click();
		await waitOpen(p, true);
		assert.deepEqual(await p.evaluate(() => window.__navs), [], 'no navigation before the dialog opens');
		assert.equal(await p.evaluate(() => window.__marker), 'alive');
		assert.equal(await p.evaluate(() => location.pathname), '/');
		assert.deepEqual(await dialogState(p), { open: true, modal: true, active: 'name' });
		// Escape closes it
		await p.keyboard.press('Escape');
		await waitOpen(p, false);
		await p.waitForFunction(() => document.activeElement === document.querySelector('[data-testid=new-campaign]'));
		const s = await dialogState(p);
		assert.equal(s.open, false);
		assert.equal(s.active, 'opener');
		assert.equal(await p.evaluate(() => location.pathname), '/');
	} finally { await close(); }
});

test('with JS, reopening then clicking modal-cancel closes it with focus back on new-campaign', async () => {
	const { p, close } = await open('/');
	try {
		await openWithJs(p);
		await p.keyboard.press('Escape');
		await waitOpen(p, false);
		await openWithJs(p);
		await p.locator('[data-testid=modal-campaign] [data-testid=modal-cancel]').click();
		await waitOpen(p, false);
		await p.waitForFunction(() => document.activeElement === document.querySelector('[data-testid=new-campaign]'));
		assert.equal((await dialogState(p)).active, 'opener');
		assert.equal(await p.evaluate(() => location.pathname), '/');
	} finally { await close(); }
});

test('with JS at 1024x768, reopening then clicking the backdrop at (5, 5) closes it', async () => {
	const { p, close } = await open('/', { w: 1024, h: 768 });
	try {
		await openWithJs(p);
		await p.keyboard.press('Escape');
		await waitOpen(p, false);
		await openWithJs(p);
		await p.mouse.click(5, 5);
		await waitOpen(p, false);
		assert.equal((await dialogState(p)).open, false);
	} finally { await close(); }
});

test('with JS, opening the dialog, typing Ashfall and submitting goes to /campaigns/:id?step=build showing Ashfall', async () => {
	const { p, close } = await open('/');
	try {
		await openWithJs(p);
		const d = p.locator('[data-testid=modal-campaign]');
		await d.locator('input[name=name]').fill('Ashfall');
		await Promise.all([p.waitForURL(BUILD_URL), d.locator('button[type=submit]').click()]);
		await p.waitForFunction(() => document.querySelector('[data-testid=campaign-name]')?.textContent.trim() === 'Ashfall');
		assert.equal((await p.locator('[data-testid=campaign-name]').textContent()).trim(), 'Ashfall');
	} finally { await close(); }
});

// --- empty name ---
test('with JS, submitting an empty name keeps modal-campaign open with the home.error alert inside and the typed value kept', async () => {
	const { p, close } = await open('/');
	try {
		await openWithJs(p);
		const d = p.locator('[data-testid=modal-campaign]');
		await d.locator('button[type=submit]').click();
		await d.locator('[role=alert]').waitFor();
		assert.equal((await d.locator('[role=alert]').textContent()).trim(), dict.en['home.error']);
		assert.equal((await dialogState(p)).open, true);
		assert.equal(await p.evaluate(() => location.pathname), '/');
		// a blank (whitespace-only) name is empty too: the typed value stays in the input
		await d.locator('input[name=name]').fill('   ');
		await d.locator('button[type=submit]').click();
		await p.waitForFunction(() => !document.querySelector('[data-testid=modal-campaign] button[type=submit]')?.hasAttribute('aria-busy'));
		await d.locator('[role=alert]').waitFor();
		assert.equal((await dialogState(p)).open, true);
		assert.equal(await d.locator('input[name=name]').inputValue(), '   ');
		assert.equal((await d.locator('[role=alert]').textContent()).trim(), dict.en['home.error']);
	} finally { await close(); }
});

test('without JS, POST / with an empty name re-renders the page with the dialog open and the alert inside it', async () => {
	const r = await postHome('');
	assert.equal(r.status, 400);
	const { tag, inner } = dialogOf(await r.text());
	assert.ok(hasOpen(tag), `dialog tag has open: ${tag}`);
	assert.match(inner, /role="alert"/);
	assert.ok(inner.includes(dict.en['home.error']), 'the home.error text is inside the dialog');
	// the browser form keeps the typed value
	const { p, close } = await open('/?new=campaign', { js: false });
	try {
		const d = p.locator('[data-testid=modal-campaign]');
		await d.locator('input[name=name]').fill('   ');
		await Promise.all([p.waitForLoadState('load'), d.locator('button[type=submit]').click()]);
		await d.locator('[role=alert]').waitFor();
		assert.equal(await d.evaluate((e) => e.hasAttribute('open')), true);
		assert.equal((await d.locator('[role=alert]').textContent()).trim(), dict.en['home.error']);
		assert.equal(await d.locator('input[name=name]').inputValue(), '   ');
	} finally { await close(); }
});

// --- sizes ---
test('at 375x812 the open dialog is 375x812 (±1) with border-radius 0px', async () => {
	const { p, close } = await open('/', { w: 375, h: 812 });
	try {
		await openWithJs(p);
		const r = await p.locator('[data-testid=modal-campaign]').evaluate((d) => {
			const b = d.getBoundingClientRect();
			return { w: b.width, h: b.height, radius: getComputedStyle(d).borderRadius };
		});
		assert.ok(Math.abs(r.w - 375) <= 1, `width ${r.w}`);
		assert.ok(Math.abs(r.h - 812) <= 1, `height ${r.h}`);
		assert.equal(r.radius, '0px');
	} finally { await close(); }
});

test('at 1024x768 the open dialog is at most 512px wide, centred, with a 3px double top border, 8px radius and a 0.8 backdrop opacity', async () => {
	const { p, close } = await open('/', { w: 1024, h: 768 });
	try {
		await openWithJs(p);
		const r = await p.locator('[data-testid=modal-campaign]').evaluate((d) => {
			const b = d.getBoundingClientRect(), cs = getComputedStyle(d);
			return {
				w: b.width, left: b.left, right: document.documentElement.clientWidth - b.right,
				style: cs.borderTopStyle, width: cs.borderTopWidth, radius: cs.borderRadius,
				backdrop: getComputedStyle(d, '::backdrop').opacity
			};
		});
		assert.ok(r.w <= 512.5 && r.w > 0, `width ${r.w}`);
		assert.ok(Math.abs(r.left - r.right) <= 2, `left ${r.left} vs right ${r.right}`);
		assert.equal(r.style, 'double');
		assert.equal(r.width, '3px');
		assert.equal(r.radius, '8px');
		assert.equal(r.backdrop, '0.8');
	} finally { await close(); }
});

// --- source-level parts of the story ---
test('Modal.svelte exists with no <style> block and no style= attribute', () => {
	const f = 'src/lib/components/Modal.svelte';
	assert.ok(existsSync(f));
	const src = readFileSync(f, 'utf8');
	assert.doesNotMatch(src, /<style\b/);
	assert.doesNotMatch(src, /\sstyle=/);
});

test('CLAUDE.md lists Modal among the components and says busy closes an enclosing dialog on success', () => {
	const lines = readFileSync('CLAUDE.md', 'utf8').split('\n');
	assert.ok(lines.some((l) => l.includes('src/lib/components/') && l.includes('Modal')), 'components row mentions Modal');
	assert.ok(lines.some((l) => l.includes('busy') && /dialog/i.test(l)), 'busy row mentions the dialog');
});
