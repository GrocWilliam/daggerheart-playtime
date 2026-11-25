import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { dividerPages, dividerGeometry, sideScroll, VIEWPORTS } from '../support/divider.mjs';

const BASE = process.env.BASE_URL;
let browser, pages;
before(async () => { browser = await launchBrowser(); pages = await dividerPages(BASE); });
after(async () => { await browser?.close(); });

const each = async (fn) => {
	for (const p of pages) for (const vp of VIEWPORTS) {
		const page = await openPage(browser, p.url, vp);
		try {
			const g = await dividerGeometry(page);
			assert.ok(g, `${p.name} has an h1 and a divider svg`);
			await fn(g, p.name, vp, page);
		} finally { await closePage(page); }
	}
};

test('the divider svg starts at the h1 left edge on every page and viewport', () =>
	each((g, name, vp) => assert.ok(Math.abs(g.svgLeft - g.h1Left) <= 1, `${name} ${vp}: svg ${g.svgLeft} vs h1 ${g.h1Left}`)));

test('the divider keeps its size', () =>
	each((g, name, vp) => {
		assert.ok(Math.abs(g.height - 16) <= 1, `${name} ${vp} height ${g.height}`);
		if (vp[0] === 1280) assert.ok(Math.abs(g.width - 320) <= 1, `${name} width ${g.width}`);
		else assert.ok(g.width > 0 && g.width <= 320 + 1, `${name} ${vp} width ${g.width}`);
	}));

test('the drawn flourish starts at the svg left edge', () =>
	each((g, name, vp) => {
		assert.equal(g.par, 'xMinYMid meet', name);
		assert.ok(Math.abs(g.firstLeft - g.svgLeft) <= 1, `${name} ${vp}: shape ${g.firstLeft} vs svg ${g.svgLeft}`);
	}));

test('no sideways scroll at 375x812', async () => {
	for (const p of pages) {
		const page = await openPage(browser, p.url, [375, 812]);
		try { assert.ok((await sideScroll(page)) <= 0, `${p.name} scrolls sideways`); } finally { await closePage(page); }
	}
});
