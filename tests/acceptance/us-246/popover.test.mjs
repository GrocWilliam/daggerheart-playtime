// us-246: help opens in a native popover panel (Popover API) instead of an inline <details>.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const read = (p) => readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');
const EN = JSON.parse(read('src/lib/i18n/en.json'));
const FR = JSON.parse(read('src/lib/i18n/fr.json'));
const FR_CLASSES = JSON.parse(read('src/lib/srd/fr/classes.json'));
const BARD = 'core_class_bard';

let browser, camp, hero;
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	camp = (await api('POST', '/api/campaigns', { name: 'Popover Camp' })).id;
	hero = (await api('POST', `/api/campaigns/${camp}/characters`, { name: 'Wren', class: 'Bard', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 })).id;
});
after(async () => { await browser?.close(); });

async function open(path, { lang = 'en', js = true, viewport = { width: 1000, height: 800 } } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(10000);
	await page.goto(BASE + path);
	return { ctx, page };
}
const sheet = () => `/characters/${hero}`;
const refHelp = (page, id) => page.locator(`[data-testid="ref-item"] [data-testid="help"][data-help="${id}"]`).first();
const isOpen = (panel) => panel.evaluate((e) => e.matches(':popover-open'));
const openCount = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="help-panel"]')].filter((e) => e.matches(':popover-open')).length);
// wait until the panel's open state equals `want` (no fixed sleep), then return it
async function settle(panel, want) {
	const h = await panel.elementHandle();
	await panel.page().waitForFunction(({ e, w }) => e.matches(':popover-open') === w, { e: h, w: want }, { timeout: 5000 }).catch(() => {});
	return isOpen(panel);
}

// ---------------------------------------------------------------- source, catalog, docs

test('Help.svelte renders help, help-open, help-panel and help-close with popover attributes and $props.id()', () => {
	const src = read('src/lib/components/Help.svelte');
	for (const s of ['data-testid="help"', 'data-testid="help-open"', 'data-testid="help-panel"', 'data-testid="help-close"', 'popover="auto"', 'popovertarget={panelId}', 'popovertargetaction="hide"', '$props.id()'])
		assert.ok(src.includes(s), `Help.svelte should contain ${s}`);
	for (const s of ['<details', '<summary', 'onclick', '<div'])
		assert.ok(!src.includes(s), `Help.svelte must not contain ${s}`);
	assert.ok(!/<style/.test(src) && !/\sstyle=/.test(src), 'no <style> or style= in Help.svelte');
});

test('Help.test.ts asserts the new markup', () => {
	const src = read('src/lib/components/Help.test.ts');
	for (const s of ['help-open', 'help-panel', 'help-close', 'popovertarget'])
		assert.ok(src.includes(s), `Help.test.ts should mention ${s}`);
});

test('catalog: help.close is "Close" in en and "Fermer" in fr', () => {
	assert.equal(EN['help.close'], 'Close');
	assert.equal(FR['help.close'], 'Fermer');
});

test('docs/ui.md lists help-open, help-panel, help-close and says Help uses the Popover API', () => {
	const ui = read('docs/ui.md');
	for (const id of ['help-open', 'help-panel', 'help-close']) assert.ok(ui.includes('`' + id + '`'), `docs/ui.md lists \`${id}\``);
	assert.ok(ui.split('\n').some((l) => l.includes('`Help`') && /popover/i.test(l)), 'a `Help` line of docs/ui.md mentions the Popover API');
});

test('CLAUDE.md drops the old <details>/Help pitfall and says Help is inline-level and uses the Popover API', () => {
	const md = read('CLAUDE.md');
	assert.ok(!md.includes('never put `<details>`/`Help` or other block elements inside a `<p>`'), 'old hydration pitfall still present');
	assert.ok(/popover api/i.test(md), 'CLAUDE.md mentions the Popover API');
	assert.ok(/inline-level/i.test(md), 'CLAUDE.md says Help is inline-level');
	for (const id of ['help-open', 'help-panel', 'help-close']) assert.ok(md.includes(id), `CLAUDE.md mentions ${id}`);
});

// ---------------------------------------------------------------- markup

test('/reference: each help has one help-open button "?" and one help-panel whose id is its popovertarget; ids are unique', async () => {
	const { ctx, page } = await open('/reference');
	const r = await page.locator('[data-testid="help"]').evaluateAll((hs) => hs.map((h) => {
		const b = h.querySelectorAll('[data-testid="help-open"]'), p = h.querySelectorAll('[data-testid="help-panel"]');
		return { id: h.dataset.help, nb: b.length, np: p.length, tag: b[0]?.tagName, type: b[0]?.getAttribute('type'), text: b[0]?.textContent.trim(), target: b[0]?.getAttribute('popovertarget'), pid: p[0]?.id, popover: p[0]?.getAttribute('popover') };
	}));
	assert.ok(r.length > 10, 'helpers on /reference');
	for (const h of r) {
		assert.equal(h.nb, 1, `${h.id}: one help-open`);
		assert.equal(h.np, 1, `${h.id}: one help-panel`);
		assert.equal(h.tag, 'BUTTON', `${h.id}: help-open is a button`);
		assert.equal(h.type, 'button', `${h.id}: type=button`);
		assert.equal(h.text, '?', `${h.id}: text ?`);
		assert.equal(h.popover, 'auto', `${h.id}: popover=auto`);
		assert.ok(h.pid, `${h.id}: panel has an id`);
		assert.equal(h.target, h.pid, `${h.id}: popovertarget equals the panel id`);
	}
	const ids = r.map((h) => h.pid);
	assert.equal(new Set(ids).size, ids.length, 'panel ids are unique on /reference');
	await ctx.close();
});

test('character sheet: panel ids are unique even when the same data-help appears twice', async () => {
	const { ctx, page } = await open(sheet());
	const r = await page.locator('[data-testid="help"]').evaluateAll((hs) => hs.map((h) => ({ id: h.dataset.help, pid: h.querySelector('[data-testid="help-panel"]')?.id, target: h.querySelector('[data-testid="help-open"]')?.getAttribute('popovertarget') })));
	const helps = r.map((h) => h.id);
	assert.ok(helps.length > new Set(helps).size, 'some data-help value appears twice on the sheet (traits)');
	for (const h of r) { assert.ok(h.pid, `${h.id} panel id`); assert.equal(h.target, h.pid, `${h.id} target`); }
	assert.equal(new Set(r.map((h) => h.pid)).size, r.length, 'panel ids are unique');
	await ctx.close();
});

test('on load no help-panel is open and its text (the name) is in the DOM', async () => {
	for (const path of ['/reference', sheet()]) {
		const { ctx, page } = await open(path);
		assert.equal(await openCount(page), 0, `${path}: no panel open on load`);
		const h = path === '/reference' ? refHelp(page, BARD) : page.locator('[data-testid="help"][data-help="hp"]').first();
		const name = path === '/reference'
			? (await page.locator('[data-testid="ref-item"]').filter({ has: page.locator(`[data-testid="help"][data-help="${BARD}"]`) }).locator('> span:not([data-testid])').first().textContent()).trim()
			: EN['tracker.hp'];
		const text = await h.locator('[data-testid="help-panel"]').evaluate((e) => e.textContent);
		assert.ok(text.includes(name), `${path}: panel textContent holds "${name}"`);
		await ctx.close();
	}
});

test('clicking help-open opens its panel: name in a strong first (with nameLang), help-close "Close" last', async () => {
	const { ctx, page } = await open('/reference');
	const h = refHelp(page, BARD);
	const name = page.locator('[data-testid="ref-item"]').filter({ has: page.locator(`[data-testid="help"][data-help="${BARD}"]`) }).locator('> span:not([data-testid])').first();
	const nameLang = await name.getAttribute('lang');
	const panel = h.locator('[data-testid="help-panel"]');
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true, 'panel open');
	const r = await panel.evaluate((p) => ({ first: p.firstElementChild?.tagName, firstText: p.firstElementChild?.textContent.trim(), firstLang: p.firstElementChild?.getAttribute('lang'), last: p.lastElementChild?.dataset.testid, lastText: p.lastElementChild?.textContent.trim(), lastTag: p.lastElementChild?.tagName, lastType: p.lastElementChild?.getAttribute('type') }));
	assert.equal(r.first, 'STRONG');
	assert.equal(r.firstText, (await name.textContent()).trim());
	assert.equal(r.firstLang, nameLang);
	assert.equal(r.last, 'help-close');
	assert.equal(r.lastTag, 'BUTTON');
	assert.equal(r.lastType, 'button');
	assert.equal(r.lastText, 'Close');
	await ctx.close();
});

test('a glossary helper on the sheet opens with its name first and help-close last', async () => {
	const { ctx, page } = await open(sheet());
	const h = page.locator('[data-testid="help"][data-help="evasion"]').first();
	const panel = h.locator('[data-testid="help-panel"]');
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true);
	const r = await panel.evaluate((p) => ({ first: p.firstElementChild?.tagName, firstText: p.firstElementChild?.textContent.trim(), last: p.lastElementChild?.dataset.testid }));
	assert.deepEqual(r, { first: 'STRONG', firstText: EN['stat.evasion'], last: 'help-close' });
	await ctx.close();
});

// ---------------------------------------------------------------- closing

test('the panel closes on Escape and focus returns to its help-open', async () => {
	const { ctx, page } = await open('/reference');
	const h = refHelp(page, BARD);
	const panel = h.locator('[data-testid="help-panel"]');
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true);
	await page.keyboard.press('Escape');
	assert.equal(await settle(panel, false), false, 'closed by Escape');
	assert.equal(await h.locator('[data-testid="help-open"]').evaluate((b) => document.activeElement === b), true, 'focus on help-open');
	await ctx.close();
});

test('the panel closes on a click outside it (5,5 on the backdrop)', async () => {
	const { ctx, page } = await open('/reference');
	const h = refHelp(page, BARD);
	const panel = h.locator('[data-testid="help-panel"]');
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true);
	await page.mouse.click(5, 5);
	assert.equal(await settle(panel, false), false, 'closed by an outside click');
	await ctx.close();
});

test('the panel closes with help-close and focus returns to its help-open', async () => {
	const { ctx, page } = await open('/reference');
	const h = refHelp(page, BARD);
	const panel = h.locator('[data-testid="help-panel"]');
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true);
	await panel.locator('[data-testid="help-close"]').click();
	assert.equal(await settle(panel, false), false, 'closed by help-close');
	assert.equal(await h.locator('[data-testid="help-open"]').evaluate((b) => document.activeElement === b), true, 'focus on help-open');
	await ctx.close();
});

// ---------------------------------------------------------------- one at a time

test('one panel at a time: opening a second helper (click after Escape, or through the API) leaves only the second open', async () => {
	const { ctx, page } = await open('/reference');
	const helps = page.locator('[data-testid="ref-item"] [data-testid="help"]');
	const a = helps.nth(0), b = helps.nth(1), c = helps.nth(2);
	const pa = a.locator('[data-testid="help-panel"]'), pb = b.locator('[data-testid="help-panel"]'), pc = c.locator('[data-testid="help-panel"]');
	// click: open a, close it with Escape, click b
	await a.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(pa, true), true);
	await page.keyboard.press('Escape');
	await settle(pa, false);
	await b.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(pb, true), true, 'second open');
	assert.equal(await openCount(page), 1);
	assert.equal(await isOpen(pa), false);
	// API: with b open, show c
	await pc.evaluate((p) => p.showPopover());
	assert.equal(await settle(pc, true), true, 'third open through the API');
	assert.equal(await openCount(page), 1, 'exactly one open');
	assert.equal(await isOpen(pb), false, 'the previous one closed');
	await ctx.close();
});

// ---------------------------------------------------------------- does not move the page

const nextTop = (h) => h.evaluate((el) => {
	for (let e = el; e && e !== document.body; e = e.parentElement) if (e.nextElementSibling) return e.nextElementSibling.getBoundingClientRect().top;
	return null;
});
for (const [label, path, pick] of [
	['/reference', '/reference', (page) => refHelp(page, BARD)],
	['character sheet', null, (page) => page.locator('[data-testid="help"][data-help="hp"]').first()]
]) {
	test(`${label}: opening a panel leaves scrollHeight and the next element's top unchanged`, async () => {
		const { ctx, page } = await open(path ?? sheet());
		const h = pick(page);
		const before = { sh: await page.evaluate(() => document.documentElement.scrollHeight), top: await nextTop(h) };
		assert.notEqual(before.top, null, 'helper has a following element');
		await h.locator('[data-testid="help-open"]').click();
		assert.equal(await settle(h.locator('[data-testid="help-panel"]'), true), true);
		const afterOpen = { sh: await page.evaluate(() => document.documentElement.scrollHeight), top: await nextTop(h) };
		assert.equal(afterOpen.sh, before.sh, 'scrollHeight unchanged');
		assert.ok(Math.abs(afterOpen.top - before.top) < 0.5, `next element moved ${before.top} -> ${afterOpen.top}`);
		await ctx.close();
	});
}

// ---------------------------------------------------------------- inside a form

test('sheet: a help-open inside a tracker form causes no navigation and no POST; value unchanged; panel opens', async () => {
	const { ctx, page } = await open(sheet());
	const form = page.locator('form:has([data-testid="hp"])');
	const h = form.locator('[data-testid="help"]');
	assert.equal(await h.count(), 1, 'the hp tracker form holds its helper');
	const value = await page.locator('[data-testid="hp"]').textContent();
	const url = page.url();
	let posts = 0, navs = 0;
	page.on('request', (r) => { if (r.method() === 'POST') posts++; });
	page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(h.locator('[data-testid="help-panel"]'), true), true, 'panel opens');
	// let any submit triggered by the click reach the network before counting
	await page.evaluate(() => fetch('/health').then((r) => r.status));
	assert.equal(posts, 0, 'no POST');
	assert.equal(navs, 0, 'no navigation');
	assert.equal(page.url(), url);
	assert.equal(await page.locator('[data-testid="hp"]').textContent(), value, 'tracker value unchanged');
	await ctx.close();
});

// ---------------------------------------------------------------- mobile

for (const [label, path, pick] of [
	['/reference', '/reference', (page) => refHelp(page, BARD)],
	['character sheet', null, (page) => page.locator('[data-testid="help"][data-help="hp"]').first()]
]) {
	test(`${label} at 360 px: an open panel causes no sideways scroll, fits min(512, 328) px wide and 80% high, position fixed`, async () => {
		const { ctx, page } = await open(path ?? sheet(), { viewport: { width: 360, height: 640 } });
		const h = pick(page);
		await h.locator('[data-testid="help-open"]').click();
		const panel = h.locator('[data-testid="help-panel"]');
		assert.equal(await settle(panel, true), true);
		const r = await panel.evaluate((p) => { const b = p.getBoundingClientRect(); return { w: b.width, h: b.height, pos: getComputedStyle(p).position, sw: document.documentElement.scrollWidth, vh: window.innerHeight }; });
		assert.ok(r.sw <= 360, `scrollWidth ${r.sw}`);
		assert.ok(r.w <= Math.min(512, 360 - 32) + 0.5, `panel width ${r.w}`);
		assert.ok(r.h <= 0.8 * r.vh + 0.5, `panel height ${r.h} vs viewport ${r.vh}`);
		assert.equal(r.pos, 'fixed');
		await ctx.close();
	});
}

// ---------------------------------------------------------------- look

test('help-open and help-close are each at least 44x44 px', async () => {
	for (const path of ['/reference', sheet()]) {
		const { ctx, page } = await open(path);
		const opens = await page.locator('[data-testid="help-open"]').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [b.closest('[data-testid="help"]').dataset.help, r.width, r.height]; }).filter(([, w, h]) => w || h));
		assert.ok(opens.length > 0);
		for (const [id, w, hh] of opens) assert.ok(w >= 44 && hh >= 44, `${path} ${id} help-open ${w}x${hh}`);
		const h = path === '/reference' ? refHelp(page, BARD) : page.locator('[data-testid="help"][data-help="hp"]').first();
		await h.locator('[data-testid="help-open"]').click();
		assert.equal(await settle(h.locator('[data-testid="help-panel"]'), true), true);
		const box = await h.locator('[data-testid="help-close"]').boundingBox();
		assert.ok(box && box.width >= 44 && box.height >= 44, `${path} help-close ${box?.width}x${box?.height}`);
		await ctx.close();
	}
});

test('the open panel has the surface background and is centred horizontally (within 2 px)', async () => {
	const { ctx, page } = await open('/reference');
	const h = refHelp(page, BARD);
	await h.locator('[data-testid="help-open"]').click();
	const panel = h.locator('[data-testid="help-panel"]');
	assert.equal(await settle(panel, true), true);
	const r = await panel.evaluate((p) => {
		const probe = document.createElement('span');
		probe.style.backgroundColor = 'var(--color-surface)';
		document.body.append(probe);
		const surface = getComputedStyle(probe).backgroundColor;
		probe.remove();
		const b = p.getBoundingClientRect();
		return { bg: getComputedStyle(p).backgroundColor, surface, centre: b.left + b.width / 2, vc: document.documentElement.clientWidth / 2 };
	});
	assert.ok(r.surface && r.surface !== 'rgba(0, 0, 0, 0)', `surface resolves (${r.surface})`);
	assert.equal(r.bg, r.surface, 'panel background is the surface colour');
	assert.ok(Math.abs(r.centre - r.vc) <= 2, `panel centre ${r.centre} vs viewport centre ${r.vc}`);
	await ctx.close();
});

// ---------------------------------------------------------------- without JavaScript

test('without JavaScript, help-open opens the panel on /reference and help-close closes it', async () => {
	const { ctx, page } = await open('/reference', { js: false });
	const h = refHelp(page, BARD);
	const panel = h.locator('[data-testid="help-panel"]');
	assert.equal(await isOpen(panel), false);
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true, 'opened without JavaScript');
	await panel.locator('[data-testid="help-close"]').click();
	assert.equal(await settle(panel, false), false, 'closed without JavaScript');
	await ctx.close();
});

// ---------------------------------------------------------------- French

test('fr /reference: the open panel shows the French name with lang="fr" and help-close reads "Fermer"', async () => {
	const { ctx, page } = await open('/reference', { lang: 'fr' });
	const h = refHelp(page, BARD);
	const panel = h.locator('[data-testid="help-panel"]');
	await h.locator('[data-testid="help-open"]').click();
	assert.equal(await settle(panel, true), true);
	const r = await panel.evaluate((p) => ({ name: p.firstElementChild?.textContent.trim(), lang: p.firstElementChild?.getAttribute('lang'), tag: p.firstElementChild?.tagName }));
	assert.deepEqual(r, { name: FR_CLASSES[BARD].name, lang: 'fr', tag: 'STRONG' });
	assert.equal((await panel.locator('[data-testid="help-close"]').textContent()).trim(), 'Fermer');
	await ctx.close();
});
