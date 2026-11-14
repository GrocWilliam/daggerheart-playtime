import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { sheetUrl } from '../support/pages.mjs';
import * as S from '../support/sheet.mjs';

const BASE = process.env.BASE_URL;
const ACCENT = 'rgb(212, 160, 80)', BG = 'rgb(15, 26, 21)', DANGER = 'rgb(238, 128, 112)', CLEAR = 'rgba(0, 0, 0, 0)';
let browser, id, pressedId, restrainId, itemId;
before(async () => {
	browser = await launchBrowser();
	id = await S.levelThreeCharacter(BASE, 'Sable');
	pressedId = await S.levelThreeCharacter(BASE, 'Vera');
	await S.setCondition(BASE, pressedId, { vulnerable: true });
	restrainId = await S.levelThreeCharacter(BASE, 'Rhea');
});
after(async () => { await browser?.close(); });

const LANGS = ['en', 'fr'];
const within = (xs, tol, msg) => assert.ok(Math.max(...xs) - Math.min(...xs) <= tol, `${msg}: ${xs.join(', ')}`);

for (const lang of LANGS) for (const vp of S.SHEET_VIEWPORTS) for (const tab of S.SHEET_TABS) {
	test(`header buttons are secondary, 44px and 8px apart on every tab (${lang} ${vp.join('x')} ${tab})`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, tab), vp, { lang });
		const b = await S.headerButtons(p);
		for (const [k, v] of Object.entries(b)) {
			assert.ok(v.cls.includes('btn-secondary'), `${k} class`);
			assert.equal(v.color, ACCENT, `${k} text`);
			assert.deepEqual(v.border, Array(4).fill(`1px solid ${ACCENT}`), `${k} border`);
			assert.equal(v.bg, CLEAR, `${k} background`);
			assert.ok(v.w >= 43.5 && v.h >= 43.5, `${k} size ${v.w}x${v.h}`);
		}
		const ks = Object.keys(b);
		for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++)
			assert.ok(S.gapBetween(b[ks[i]], b[ks[j]]) >= 8 - 0.5, `${ks[i]} / ${ks[j]} gap ${S.gapBetween(b[ks[i]], b[ks[j]])}`);
		await closePage(p);
	});
}

test('a set condition toggle is pressed and primary; unset ones are not, in one row, 8px apart', async () => {
	const p = await openPage(browser, sheetUrl(BASE, pressedId, 'play'), [1024, 768]);
	const v = await S.conditionToggleLook(p, 'vulnerable');
	assert.equal(v.pressed, 'true');
	assert.equal(v.bg, ACCENT);
	assert.equal(v.color, BG);
	const r = await S.conditionToggleLook(p, 'restrained'), h = await S.conditionToggleLook(p, 'hidden');
	for (const t of [r, h]) { assert.equal(t.pressed, 'false'); assert.equal(t.bg, CLEAR); }
	within([v.top, r.top, h.top], 2, 'toggle tops');
	for (const [a, b] of [[v, r], [r, h], [v, h]]) assert.ok(S.gapBetween(a, b) >= 8 - 0.5, `toggle gap ${S.gapBetween(a, b)}`);
	for (const t of [v, r, h]) assert.ok(t.cls.includes('btn-secondary'));
	const row = await S.conditionRowClasses(p);
	for (const c of ['flex', 'flex-wrap', 'gap-2']) assert.ok(row.includes(c), `row class ${c}`);
	await closePage(p);
});

test('without JavaScript, clicking the restrained toggle reloads on ?tab=play with it pressed', async () => {
	const p = await openPage(browser, sheetUrl(BASE, restrainId, 'play'), [1024, 768], { js: false });
	assert.equal((await S.conditionToggleLook(p, 'restrained')).pressed, 'false');
	await Promise.all([p.waitForNavigation(), S.clickConditionToggle(p, 'restrained')]);
	assert.match(new URL(p.url()).search, /tab=play/);
	assert.equal((await S.conditionToggleLook(p, 'restrained')).pressed, 'true');
	await closePage(p);
});

for (const lang of LANGS) for (const vp of S.SHEET_VIEWPORTS) {
	test(`trait values are right-aligned in a 48px column (${lang} ${vp.join('x')})`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, 'traits'), vp, { lang });
		const boxes = await S.traitValueBoxes(p, S.TRAIT_KEYS);
		within(boxes.map((b) => b.right), 1, 'right edges');
		for (const b of boxes) assert.ok(Math.abs(b.w - 48) <= 1, `value width ${b.w}`);
		await closePage(p);
	});
}

test('on the gear tab the item remove button is danger and new-item is secondary', async () => {
	const p = await openPage(browser, sheetUrl(BASE, id, 'gear'), [1024, 768]);
	const rm = await S.itemRemoveLook(p);
	assert.ok(rm.cls.includes('btn-danger'));
	assert.equal(rm.color, DANGER);
	assert.ok((await S.openerLook(p, 'item')).cls.includes('btn-secondary'));
	await closePage(p);
});

test('experience and card removes are danger; new-experience and new-card are secondary', async () => {
	const t = await openPage(browser, sheetUrl(BASE, id, 'traits'), [1024, 768]);
	assert.ok((await S.experienceRemoveLook(t)).cls.includes('btn-danger'));
	assert.ok((await S.openerLook(t, 'experience')).cls.includes('btn-secondary'));
	await closePage(t);
	const c = await openPage(browser, sheetUrl(BASE, id, 'cards'), [1024, 768]);
	assert.ok((await S.cardRemoveLook(c)).cls.includes('btn-danger'));
	assert.ok((await S.openerLook(c, 'card')).cls.includes('btn-secondary'));
	await closePage(c);
});

test('the one submit of the gold, quantity, experience value, notes and damage forms is primary', async () => {
	for (const [tab, actions] of [['play', ['damage']], ['gear', ['gold', 'setQuantity']], ['traits', ['setExperience']], ['notes', ['notes']]]) {
		const p = await openPage(browser, sheetUrl(BASE, id, tab), [1024, 768]);
		for (const a of actions) {
			const looks = await S.submitLooks(p, a);
			assert.ok(looks.length >= 1, `${a} has a submit`);
			for (const b of looks) { assert.ok(b.cls.includes('btn-primary'), `${a} primary`); assert.equal(b.bg, ACCENT, `${a} background`); }
		}
		await closePage(p);
	}
});

test('the class and level text and the domains share a vertical centre at 1024x768', async () => {
	const p = await openPage(browser, sheetUrl(BASE, id, 'play'), [1024, 768]);
	const m = await S.metaCentres(p);
	assert.notEqual(m.klass, null, 'class and level text found');
	assert.ok(m.domains.length >= 1, 'domains shown');
	within([m.klass, ...m.domains], 8, 'vertical centres');
	await closePage(p);
});

for (const w of [360, 375]) for (const tab of S.SHEET_TABS) {
	test(`no sideways scroll at ${w}px on ${tab}`, async () => {
		const p = await openPage(browser, sheetUrl(BASE, id, tab), [w, 780]);
		assert.ok((await S.sideScroll(p)) <= 0);
		await closePage(p);
	});
}
