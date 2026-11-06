import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser, targets;
const json = (b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

before(async () => {
	const c = await (await fetch(BASE + '/api/campaigns', json({ name: 'Grid campaign' }))).json();
	const ch = await (await fetch(`${BASE}/api/campaigns/${c.id}/characters`, json({
		name: 'Hero', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
	}))).json();
	targets = [
		{ label: 'edit', path: `/characters/${ch.id}`, action: '?/edit' }
	];
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

const D = { w: 1280, h: 800 }, M = { w: 375, h: 667 };

async function open(t, lang, vp) {
	const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + t.path);
	await page.waitForSelector(`form[action="${t.action}"]`);
	return { page, close: () => ctx.close() };
}

// Geometry of the form, its direct-or-nested labels, controls and submit button.
const measure = (action) => `(() => {
	const f = document.querySelector('form[action="${action}"]');
	const s = getComputedStyle(f), r = f.getBoundingClientRect();
	const cl = r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
	const cw = f.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
	const labels = [...f.querySelectorAll('label')];
	const rect = (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, width: b.width }; };
	const btn = f.querySelector('button[type=submit], button:not([type]), input[type=submit]');
	const controls = [...f.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=submit]), select, textarea')].map((el) => {
		const label = el.closest('label');
		let tb = -1;
		if (label) {
			const rg = document.createRange();
			for (const n of label.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { rg.selectNodeContents(n); tb = Math.max(tb, rg.getBoundingClientRect().bottom); }
		}
		return { n: el.name, ta: el.tagName === 'TEXTAREA', display: getComputedStyle(el).display, top: el.getBoundingClientRect().top, tb, w: el.getBoundingClientRect().width };
	});
	return {
		cls: f.classList.contains('form-grid'), cl, cw,
		labels: labels.map(rect),
		btn: btn && { ...rect(btn), after: !!(labels[labels.length - 1].compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) },
		controls, sw: document.documentElement.scrollWidth, iw: window.innerWidth
	};
})()`;


for (const lang of ['en', 'fr']) {
	// targets is filled in before(); define tests per static spec instead
	for (const spec of [{ label: 'edit', i: 0 }]) {
		const T = () => targets[spec.i];
		const nm = (s) => `${s} [${spec.label} ${lang}]`;

		test(nm('both forms have class form-grid'), async () => {
			const { page, close } = await open(T(), lang, D);
			try { assert.equal((await page.evaluate(measure(T().action))).cls, true); } finally { await close(); }
		});

		test(nm('at 1280x800 labels are in 2 columns: 1st and 2nd label same top, different left'), async () => {
			const { page, close } = await open(T(), lang, D);
			try {
				const m = await page.evaluate(measure(T().action));
				assert.ok(m.labels.length >= 2);
				assert.ok(Math.abs(m.labels[0].top - m.labels[1].top) <= 1, `tops ${m.labels[0].top} ${m.labels[1].top}`);
				assert.ok(Math.abs(m.labels[0].left - m.labels[1].left) > 1, 'same left');
			} finally { await close(); }
		});

		test(nm('at 375x667 there is 1 column and no sideways scroll'), async () => {
			const { page, close } = await open(T(), lang, M);
			try {
				const m = await page.evaluate(measure(T().action));
				for (let i = 1; i < m.labels.length; i++)
					assert.ok(m.labels[i].top >= m.labels[i - 1].bottom - 0.5, `label ${i} top ${m.labels[i].top} < prev bottom ${m.labels[i - 1].bottom}`);
				assert.ok(m.sw <= m.iw, `scrollWidth ${m.sw} > ${m.iw}`);
			} finally { await close(); }
		});

		for (const [vn, vp] of [['1280x800', D], ['375x667', M]]) {
			test(nm(`submit button follows all labels in DOM and aligns with form content-box left at ${vn}`), async () => {
				const { page, close } = await open(T(), lang, vp);
				try {
					const m = await page.evaluate(measure(T().action));
					assert.ok(m.btn, 'submit button');
					assert.equal(m.btn.after, true, 'DOM order');
					assert.ok(Math.abs(m.btn.left - m.cl) <= 1, `button left ${m.btn.left} vs ${m.cl}`);
				} finally { await close(); }
			});

			test(nm(`controls follow S2 rules at ${vn}`), async () => {
				const { page, close } = await open(T(), lang, vp);
				try {
					const m = await page.evaluate(measure(T().action));
					assert.ok(m.controls.length > 0);
					for (const c of m.controls) {
						if (!c.ta) {
							assert.equal(c.display, 'block', `display ${c.n}`);
							if (c.tb >= 0) assert.ok(c.top >= c.tb - 0.5, `${c.n} not below label text`);
						}
						if (c.ta || vp.w < 600) assert.ok(Math.abs(c.w - m.cw) <= 1, `${c.n} width ${c.w} vs ${m.cw}`);
						else assert.ok(c.w <= 384.5, `${c.n} width ${c.w} > 384`);
					}
				} finally { await close(); }
			});
		}
	}
}
