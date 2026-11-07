import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// us-178: forms update in place (use:enhance), so there is no navigation to wait for: wait for the POST response, then for the network to settle.
const afterSubmit = async (p, click) => {
	const res = p.waitForResponse((r) => r.request().method() === 'POST');
	await click;
	await res;
	await p.waitForLoadState('networkidle');
};

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser, paths;
const json = (b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

before(async () => {
	const c = await (await fetch(BASE + '/api/campaigns', json({ name: 'Form campaign' }))).json();
	const ch = await (await fetch(`${BASE}/api/campaigns/${c.id}/characters`, json({
		name: 'Hero', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
	}))).json();
	paths = ['/', `/campaigns/${c.id}`, `/characters/${ch.id}`];
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

const VIEWPORTS = [{ width: 375, height: 667 }, { width: 1280, height: 800 }];

async function open(path, lang, vp) {
	const ctx = await browser.newContext({ viewport: vp });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + path);
	if (path === '/') { // US-193: the create form lives in the New campaign modal
		await page.waitForLoadState('networkidle');
		await page.locator('[data-testid=new-campaign]').click();
	}
	await page.waitForSelector('form');
	return { page, close: () => ctx.close() };
}

// Resolve a :root custom property to a computed rgb colour.
const COLOR = `(name) => { const p = document.createElement('span'); p.style.color = 'var(' + name + ')'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; }`;

const matrix = [];
for (const path of [0, 1, 2]) for (const lang of ['en', 'fr']) for (const vp of VIEWPORTS) matrix.push({ path, lang, vp });
const name = (m, what) => `${what} [${['/', 'campaign', 'character'][m.path]} ${m.lang} ${m.vp.width}px]`;

for (const m of matrix) {
	test(name(m, 'each non-tracker form is a card: --surface background, radius >= 8px, padding >= 12px'), async () => {
		const { page, close } = await open(paths[m.path], m.lang, m.vp);
		try {
			const r = await page.evaluate(`(() => {
				const color = ${COLOR};
				const surface = color('--surface');
				return [...document.querySelectorAll('form:not(.tracker)')].filter((f) => !f.closest('table') && f.offsetParent !== null).map((f) => {
					const s = getComputedStyle(f);
					return { bg: s.backgroundColor, surface, radius: Math.min(...['TopLeft','TopRight','BottomLeft','BottomRight'].map((c) => parseFloat(s['border' + c + 'Radius']))),
						pad: Math.min(...['Top','Right','Bottom','Left'].map((c) => parseFloat(s['padding' + c]) + parseFloat(s['border' + c + 'Width']))), action: f.getAttribute('action') };
				});
			})()`);
			assert.ok(r.length > 0);
			for (const f of r) {
				assert.equal(f.bg, f.surface, `bg ${f.action}`);
				assert.ok(f.radius >= 8, `radius ${f.radius} ${f.action}`);
				assert.ok(f.pad >= 12, `padding ${f.pad} ${f.action}`);
			}
		} finally { await close(); }
	});

	test(name(m, 'text/number/search/select controls in labels are display:block below the label text; checkbox labels stay on one line'), async () => {
		const { page, close } = await open(paths[m.path], m.lang, m.vp);
		try {
			const r = await page.evaluate(`(() => {
				const out = { controls: [], checks: [] };
				for (const f of document.querySelectorAll('form:not(.tracker)')) {
					if (f.closest('table') || f.offsetParent === null) continue;
					for (const el of f.querySelectorAll('label input[type=text], label input[type=number], label input[type=search], label select')) {
						const label = el.closest('label');
						const rg = document.createRange();
						let bottom = -1;
						for (const n of label.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { rg.selectNodeContents(n); bottom = Math.max(bottom, rg.getBoundingClientRect().bottom); }
						out.controls.push({ n: el.name, display: getComputedStyle(el).display, top: el.getBoundingClientRect().top, bottom });
					}
					for (const el of f.querySelectorAll('label input[type=checkbox]')) {
						const label = el.closest('label');
						const rg = document.createRange();
						rg.selectNodeContents(label);
						const texts = [...label.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
						if (!texts.length) continue;
						rg.selectNodeContents(texts[0]);
						const t = rg.getBoundingClientRect(), b = el.getBoundingClientRect();
						out.checks.push({ n: el.name, tc: (t.top + t.bottom) / 2, bt: b.top, bb: b.bottom });
					}
				}
				return out;
			})()`);
			for (const c of r.controls) {
				assert.equal(c.display, 'block', `display ${c.n}`);
				if (c.bottom >= 0) assert.ok(c.top >= c.bottom - 0.5, `${c.n} top ${c.top} < label text bottom ${c.bottom}`);
			}
			for (const c of r.checks) assert.ok(c.tc >= c.bt && c.tc <= c.bb, `checkbox ${c.n} not on the text line`);
			if (m.path === 0) {
				assert.ok(r.controls.some((c) => c.n === 'name'), 'home name input found');
			}
		} finally { await close(); }
	});

	test(name(m, 'control widths: phone = form content width; desktop <= 384px, textarea fills the content width'), async () => {
		const { page, close } = await open(paths[m.path], m.lang, m.vp);
		try {
			const r = await page.evaluate(`(() => {
				const out = [];
				for (const f of document.querySelectorAll('form:not(.tracker)')) {
					if (f.closest('table') || f.offsetParent === null) continue;
					const s = getComputedStyle(f);
					const content = f.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
					for (const el of f.querySelectorAll('label input[type=text], label input[type=number], label input[type=search], label select, textarea')) {
						out.push({ n: el.name, ta: el.tagName === 'TEXTAREA', w: el.getBoundingClientRect().width, content });
					}
				}
				return out;
			})()`);
			assert.ok(r.length > 0);
			for (const c of r) {
				if (c.ta || m.vp.width < 600) assert.ok(Math.abs(c.w - c.content) <= 1, `${c.n} width ${c.w} vs content ${c.content}`);
				else assert.ok(c.w <= 384.5, `${c.n} width ${c.w} > 384`);
			}
		} finally { await close(); }
	});

	test(name(m, 'required input border is --accent before submit and --danger after a blocked submit'), async () => {
		const { page, close } = await open(paths[m.path], m.lang, m.vp);
		try {
			const sel = 'form:not(.tracker) input[required]';
			if (!(await page.locator(sel).count())) { assert.equal(m.path, 0, 'only home may lack required inputs'); return; }
			const form = page.locator('form:not(.tracker):has(input[required])').first();
			const input = form.locator('input[required]').first();
			const get = (n) => page.evaluate(`(() => { const color = ${COLOR}; return color('${n}'); })()`);
			const bc = () => input.evaluate((e) => getComputedStyle(e).borderTopColor);
			assert.equal(await bc(), await get('--accent'), 'before submit');
			await input.fill('');
			await form.locator('button[type=submit]').first().click();
			assert.equal(await bc(), await get('--danger'), 'after blocked submit');
		} finally { await close(); }
	});

	test(name(m, 'every [role=alert] has --danger text, 3px solid --danger left border, padding-left >= 8px'), async () => {
		const { page, close } = await open(paths[m.path], m.lang, m.vp);
		try {
			if (m.path === 0) {
				await page.fill('input[name=name]', '   ');
				await afterSubmit(page, page.click('form button[type=submit]'));
				const alert = page.locator('[role=alert]');
				assert.equal(await alert.count(), 1);
				const expected = (await import('node:fs')).readFileSync(`src/lib/i18n/${m.lang}.json`, 'utf8');
				assert.equal((await alert.textContent()).trim(), JSON.parse(expected)['home.error']);
			} else {
				// no stable way to provoke a server error here: inject one, the rule must be global
				await page.evaluate(() => { const p = document.createElement('p'); p.setAttribute('role', 'alert'); p.textContent = 'x'; document.querySelector('form').before(p); });
			}
			const r = await page.evaluate(`(() => {
				const color = ${COLOR};
				const danger = color('--danger');
				return [...document.querySelectorAll('[role="alert"]')].map((a) => { const s = getComputedStyle(a); return { danger, color: s.color, bc: s.borderLeftColor, bw: s.borderLeftWidth, bs: s.borderLeftStyle, pl: parseFloat(s.paddingLeft) }; });
			})()`);
			assert.ok(r.length > 0);
			for (const a of r) {
				assert.equal(a.color, a.danger);
				assert.equal(a.bc, a.danger);
				assert.equal(a.bw, '3px');
				assert.equal(a.bs, 'solid');
				assert.ok(a.pl >= 8, `padding-left ${a.pl}`);
			}
		} finally { await close(); }
	});
}
