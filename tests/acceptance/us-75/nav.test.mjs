import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser, campaignPath, characterPath;
const json = (b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

before(async () => {
	const c = await (await fetch(BASE + '/api/campaigns', json({ name: 'Nav campaign' }))).json();
	const ch = await (await fetch(`${BASE}/api/campaigns/${c.id}/characters`, json({
		name: 'Hero', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
	}))).json();
	campaignPath = `/campaigns/${c.id}`;
	characterPath = `/characters/${ch.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function open(path, { lang = 'en', width = 1280, height = 800 } = {}) {
	const ctx = await browser.newContext({ viewport: { width, height } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + path);
	await page.waitForSelector('header.site-header');
	return { page, close: () => ctx.close() };
}
const NAV = 'header.site-header nav';

test('new keys nav.label and item.actions exist in en.json and fr.json', () => {
	const load = (l) => JSON.parse(fs.readFileSync(`src/lib/i18n/${l}.json`, 'utf8'));
	const en = load('en'), fr = load('fr');
	assert.equal(en['nav.label'], 'Main');
	assert.equal(fr['nav.label'], 'Principale');
	assert.equal(en['item.actions'], 'Actions');
	assert.equal(fr['item.actions'], 'Actions');
});

for (const [lang, label, ref, title] of [['en', 'Main', 'Reference', 'Daggerheart Playtime'], ['fr', 'Principale', null, 'Daggerheart Playtime']]) {
	test(`nav landmark (${lang}) is in the header, has exactly the two links, precedes the switcher`, async () => {
		const { page, close } = await open('/', { lang });
		try {
			assert.equal(await page.locator(`header.site-header nav[aria-label="${label}"]`).count(), 1);
			const info = await page.evaluate(() => {
				const nav = document.querySelector('header.site-header nav');
				const links = [...nav.querySelectorAll('a')];
				const sw = document.querySelector('header.site-header [data-testid="language-switcher"]');
				return {
					hrefs: links.map((a) => a.getAttribute('href')),
					ids: links.map((a) => a.dataset.testid),
					texts: links.map((a) => a.textContent.trim()),
					before: !!(nav.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING),
					anchorsInHeader: document.querySelectorAll('header.site-header a').length,
					hasRefLink: !!document.querySelector('.ref-link')
				};
			});
			assert.deepEqual(info.hrefs, ['/', '/reference']);
			assert.deepEqual(info.ids, ['nav-home', 'nav-reference']);
			assert.equal(info.texts[0], title);
			if (ref) assert.equal(info.texts[1], ref);
			else assert.ok(info.texts[1].length > 0);
			assert.ok(info.before, 'nav must precede language switcher');
			assert.equal(info.anchorsInHeader, 2);
			assert.equal(await page.locator('header a[href="/reference"]').count(), 1);
		} finally { await close(); }
	});
}

test('aria-current="page" marks the current page only', async () => {
	const cases = [['/', 'nav-home'], ['/reference', 'nav-reference'], [() => campaignPath, null], [() => characterPath, null]];
	for (const [p, expected] of cases) {
		const path = typeof p === 'function' ? p() : p;
		const { page, close } = await open(path);
		try {
			for (const id of ['nav-home', 'nav-reference']) {
				const v = await page.getAttribute(`[data-testid="${id}"]`, 'aria-current');
				if (id === expected) assert.equal(v, 'page', `${id} on ${path}`);
				else assert.equal(v, null, `${id} on ${path}`);
			}
		} finally { await close(); }
	}
});

test('link styles: no underline; current link has accent 2px bottom border and bold; other has none', async () => {
	for (const [path, cur, other] of [['/', 'nav-home', 'nav-reference'], ['/reference', 'nav-reference', 'nav-home']]) {
		const { page, close } = await open(path);
		try {
			const r = await page.evaluate(([cur, other]) => {
				const probe = document.createElement('span');
				probe.style.color = 'var(--accent)';
				document.body.append(probe);
				const accent = getComputedStyle(probe).color;
				probe.remove();
				const s = (id) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`));
				const c = s(cur), o = s(other);
				return {
					accent,
					cDeco: c.textDecorationLine, oDeco: o.textDecorationLine,
					cStyle: c.borderBottomStyle, cWidth: c.borderBottomWidth, cColor: c.borderBottomColor,
					weight: parseInt(c.fontWeight, 10), oStyle: o.borderBottomStyle
				};
			}, [cur, other]);
			assert.equal(r.cDeco, 'none'); assert.equal(r.oDeco, 'none');
			assert.equal(r.cStyle, 'solid'); assert.equal(r.cWidth, '2px'); assert.equal(r.cColor, r.accent);
			assert.ok(r.weight >= 700, `weight ${r.weight}`);
			assert.equal(r.oStyle, 'none');
		} finally { await close(); }
	}
});

test('header has a 1px solid --muted bottom border and margin-bottom >= 16px', async () => {
	const { page, close } = await open('/');
	try {
		const r = await page.evaluate(() => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--muted)';
			document.body.append(probe);
			const muted = getComputedStyle(probe).color;
			probe.remove();
			const h = getComputedStyle(document.querySelector('header.site-header'));
			return { muted, style: h.borderBottomStyle, width: h.borderBottomWidth, color: h.borderBottomColor, mb: parseFloat(h.marginBottom) };
		});
		assert.equal(r.style, 'solid'); assert.equal(r.width, '1px'); assert.equal(r.color, r.muted);
		assert.ok(r.mb >= 16, `margin-bottom ${r.mb}`);
	} finally { await close(); }
});

test('desktop 1280x800: nav left, switcher right-aligned, same row', async () => {
	const { page, close } = await open('/');
	try {
		const r = await page.evaluate(() => {
			const h = document.querySelector('header.site-header');
			const cs = getComputedStyle(h);
			const hb = h.getBoundingClientRect();
			const contentRight = hb.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
			const n = document.querySelector('header.site-header nav').getBoundingClientRect();
			const s = document.querySelector('[data-testid="language-switcher"]').getBoundingClientRect();
			return { n: { l: n.left, r: n.right, t: n.top, b: n.bottom }, s: { l: s.left, r: s.right, t: s.top, b: s.bottom }, contentRight };
		});
		assert.ok(r.n.t < r.s.b && r.s.t < r.n.b, 'vertical overlap');
		assert.ok(r.n.r <= r.s.l + 0.5 && r.n.l < r.s.l, 'nav left of switcher');
		assert.ok(Math.abs(r.s.r - r.contentRight) <= 1, `switcher right ${r.s.r} vs ${r.contentRight}`);
	} finally { await close(); }
});

for (const lang of ['en', 'fr']) {
	test(`mobile 375x667 (${lang}): everything inside viewport, no horizontal scroll`, async () => {
		for (const path of ['/', '/reference']) {
			const { page, close } = await open(path, { lang, width: 375, height: 667 });
			try {
				const r = await page.evaluate(() => {
					const boxes = [...document.querySelectorAll('header.site-header nav a, [data-testid="lang-en"], [data-testid="lang-fr"]')]
						.map((e) => e.getBoundingClientRect());
					return {
						n: boxes.length,
						inside: boxes.every((b) => b.left >= 0 && b.top >= 0 && b.right <= document.documentElement.clientWidth && b.width > 0),
						sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
					};
				});
				assert.equal(r.n, 4);
				assert.ok(r.inside, 'controls inside viewport');
				assert.ok(r.sw <= r.cw, `scrollWidth ${r.sw} > clientWidth ${r.cw}`);
			} finally { await close(); }
		}
	});
}

test('touch targets: nav links and language buttons are >= 44x44', async () => {
	for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 667 }]) {
		const { page, close } = await open('/', size);
		try {
			const boxes = await page.evaluate(() =>
				[...document.querySelectorAll('header.site-header nav a, [data-testid="lang-en"], [data-testid="lang-fr"]')]
					.map((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; }));
			assert.equal(boxes.length, 4);
			for (const [w, h] of boxes) { assert.ok(w >= 44 && h >= 44, `${w}x${h}`); }
		} finally { await close(); }
	}
});
