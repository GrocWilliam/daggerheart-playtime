import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { appCss, lineCount, rules } from '../support/css.mjs';
import * as B from '../support/buttons.mjs';

const BASE = process.env.BASE_URL;
const ROOT = process.env.ROOT;
let browser, pages;
before(async () => {
	browser = await launchBrowser();
	pages = await B.setupButtonPages(BASE);
});
after(async () => { await browser?.close(); });

const COMBOS = [];
for (const lang of ['en', 'fr']) for (const vp of [[375, 812], [1024, 768]]) COMBOS.push({ lang, vp });
const scans = new Map();
const scanOf = async (pg, { lang, vp }) => {
	const key = `${pg.name}|${lang}|${vp[0]}`;
	if (!scans.has(key)) {
		const p = await openPage(browser, pg.url, vp, { lang });
		scans.set(key, await B.scanButtons(p));
		await closePage(p);
	}
	return scans.get(key);
};
const forEachScan = async (fn) => {
	for (const combo of COMBOS) for (const pg of pages) fn(await scanOf(pg, combo), `${pg.name} ${combo.lang} ${combo.vp[0]}`);
};

test('app.css: no `button` rule sets background-color or color, and the file has fewer than 150 lines', () => {
	const css = appCss();
	assert.ok(lineCount(css) < 150, `${lineCount(css)} lines`);
	const buttonRules = rules(css).filter((r) => r.selector.split(',').map((s) => s.trim()).includes('button'));
	assert.ok(buttonRules.length >= 1);
	for (const r of buttonRules) assert.doesNotMatch(r.body, /(^|[;\s{])(background-color|color)\s*:/, `rule "${r.selector}"`);
});

test('src/buttons.test.ts exists and passes', () => {
	assert.ok(existsSync(join(ROOT, 'src/buttons.test.ts')));
	const r = B.runButtonsUnitTest(ROOT);
	assert.equal(r.status, 0, r.output);
});

test('src/buttons.test.ts fails and names a temporary .svelte file with a button without a variant', () => {
	const name = 'ZzTmp345Bare.svelte';
	const r = B.runButtonsUnitTest(ROOT, { name, content: '<p>x</p>\n\n<button type="submit">Go</button>\n' });
	assert.notEqual(r.status, 0, r.output);
	assert.match(r.output, /ZzTmp345Bare\.svelte[^\n]*\b3\b/, 'names the file and the line');
});

test('src/buttons.test.ts fails for a button with two variants and passes with exactly one', () => {
	const two = B.runButtonsUnitTest(ROOT, { name: 'ZzTmp345Two.svelte', content: '<button type="submit" class="btn-primary btn-ghost">Go</button>\n' });
	assert.notEqual(two.status, 0, two.output);
	assert.match(two.output, /ZzTmp345Two\.svelte/);
	const one = B.runButtonsUnitTest(ROOT, { name: 'ZzTmp345One.svelte', content: '<button type="submit" class="btn-primary">Go</button>\n' });
	assert.equal(one.status, 0, one.output);
});

test('every visible button has exactly one btn-* class', async () => {
	await forEachScan((buttons, where) => {
		assert.ok(buttons.length > 0, `${where}: no buttons found`);
		for (const b of buttons) assert.equal(b.classes.filter((c) => B.VARIANTS.includes(c)).length, 1, `${where}: ${b.label} has [${b.classes}]`);
		for (const b of buttons) assert.equal(b.classes.length, 1, `${where}: ${b.label} has [${b.classes}]`);
	});
});

test('every visible button has one of the four variant looks', async () => {
	await forEachScan((buttons, where) => {
		for (const b of buttons) assert.ok(B.VARIANT_LOOKS.some(([bg, c]) => bg === b.look[0] && c === b.look[1]), `${where}: ${b.label} looks ${b.look}`);
	});
});

test('every visible button is at least 44x44px', async () => {
	await forEachScan((buttons, where) => {
		for (const b of buttons) assert.ok(b.width >= 43.5 && b.height >= 43.5, `${where}: ${b.label} is ${b.width}x${b.height}`);
	});
});

test('no form contains more than one visible btn-primary button', async () => {
	await forEachScan((buttons, where) => {
		for (const [form, labels] of Object.entries(B.primariesByForm(buttons))) assert.ok(labels.length <= 1, `${where}: form ${form} has ${labels}`);
	});
});

test('every delete or remove button is btn-danger', async () => {
	let seen = 0;
	await forEachScan((buttons, where) => {
		for (const b of buttons.filter((x) => /delete|remove/i.test(x.action ?? ''))) {
			seen++;
			assert.deepEqual(b.classes, ['btn-danger'], `${where}: ${b.label} (${b.action})`);
		}
	});
	assert.ok(seen > 0, 'no delete or remove button was found');
});

test('no sideways scroll at 360 and 375px on any page', async () => {
	for (const lang of ['en', 'fr']) for (const vp of [[360, 640], [375, 812]]) for (const pg of pages) {
		const p = await openPage(browser, pg.url, vp, { lang });
		assert.ok((await B.sidewaysScroll(p)) <= 0, `${pg.name} ${lang} ${vp[0]}`);
		await closePage(p);
	}
});

test('CLAUDE.md mentions src/buttons.test.ts', () => {
	assert.ok(B.claudeMd(ROOT).includes('src/buttons.test.ts'));
});
