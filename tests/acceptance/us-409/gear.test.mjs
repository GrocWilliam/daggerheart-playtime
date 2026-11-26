import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { sheetUrl } from '../support/pages.mjs';
import { sideScroll } from '../support/sheet.mjs';
import * as G from '../support/gear.mjs';

const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

const gear = async (id, opts) => openPage(browser, sheetUrl(BASE, id, 'gear'), [1280, 900], opts);

test('changing the primary weapon select to Broadsword saves without clicking a button', async () => {
	const id = await G.characterWithGold(BASE);
	assert.equal((await G.apiCharacter(BASE, id)).primaryWeapon, null);
	const p = await gear(id);
	await G.choosePrimaryWeaponAndWait(p, 'core_weapon_broadsword');
	await p.locator('[data-testid="primary-weapon"]').waitFor();
	assert.match(await G.primaryWeaponText(p), /broadsword/i);
	await p.reload();
	assert.match(await G.primaryWeaponText(p), /broadsword/i);
	assert.equal((await G.apiCharacter(BASE, id)).primaryWeapon, 'core_weapon_broadsword');
	await closePage(p);
});

test('with JavaScript each Equip button exists but is at most 1x1px, and no other submit is visible', async () => {
	const id = await G.characterWithGold(BASE);
	const p = await gear(id);
	const forms = await G.equipButtons(p);
	for (const f of G.EQUIP_FIELDS) assert.ok(forms.some((x) => x.field === f), `${f} form`);
	for (const f of forms) {
		assert.equal(f.count, 1, `${f.field} has its Equip button`);
		for (const [w, h] of f.hidden) assert.ok(w <= 1 && h <= 1, `${f.field} button ${w}x${h}`);
		assert.equal(f.visible, 0, `${f.field} visible submits`);
	}
	await closePage(p);
});

test('without JavaScript, changing the select and clicking the visible Equip button reloads on ?tab=gear with the weapon', async () => {
	const id = await G.characterWithGold(BASE);
	const p = await gear(id, { js: false });
	await G.choosePrimaryWeapon(p, 'core_weapon_broadsword');
	await G.clickEquip(p);
	assert.equal(new URL(p.url()).searchParams.get('tab'), 'gear');
	assert.match(await G.primaryWeaponText(p), /broadsword/i);
	await closePage(p);
});

test('+1 handful on 0/0/3 shows 4 handfuls and the API agrees', async () => {
	const id = await G.characterWithGold(BASE, { handfuls: 3 });
	const p = await gear(id);
	await G.clickGoldStepperAndWait(p, 'handfuls', 'plus');
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 0, handfuls: 4 });
	assert.equal((await G.apiGold(BASE, id)).handfuls, 4);
	await closePage(p);
});

test('+1 bag then +1 chest on 0/0/3', async () => {
	const id = await G.characterWithGold(BASE, { handfuls: 3 });
	const p = await gear(id);
	await G.clickGoldStepperAndWait(p, 'bags', 'plus');
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 1, handfuls: 3 });
	await G.clickGoldStepperAndWait(p, 'chests', 'plus');
	assert.deepEqual(await G.goldShown(p), { chests: 1, bags: 1, handfuls: 3 });
	await closePage(p);
});

test('-1 chest, -1 bag, -1 handful on 1/1/3 leaves 0/0/2', async () => {
	const id = await G.characterWithGold(BASE, { chests: 1, bags: 1, handfuls: 3 });
	const p = await gear(id);
	for (const u of ['chests', 'bags', 'handfuls']) await G.clickGoldStepperAndWait(p, u, 'minus');
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 0, handfuls: 2 });
	assert.deepEqual(await G.apiGold(BASE, id), { chests: 0, bags: 0, handfuls: 2 });
	await closePage(p);
});

test('-1 bag on 0/0/15 succeeds and leaves 5 handfuls', async () => {
	const id = await G.characterWithGold(BASE, { handfuls: 15 });
	const p = await gear(id);
	await G.clickGoldStepperAndWait(p, 'bags', 'minus');
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 0, handfuls: 5 });
	await closePage(p);
});

test('-1 handful on 0/0/0 shows the existing error alert and the gold stays 0/0/0', async () => {
	const id = await G.characterWithGold(BASE);
	const p = await gear(id);
	assert.equal(await G.goldAlertCount(p), 0);
	await G.clickGoldStepperAndWait(p, 'handfuls', 'minus');
	await p.locator('[data-testid="sheet-gold"] [role="alert"]').waitFor();
	assert.equal(await G.goldAlertCount(p), 1);
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 0, handfuls: 0 });
	assert.deepEqual(await G.apiGold(BASE, id), { chests: 0, bags: 0, handfuls: 0 });
	await closePage(p);
});

test('without JavaScript +1 handful redirects to ?tab=gear and shows 4 handfuls', async () => {
	const id = await G.characterWithGold(BASE, { handfuls: 3 });
	const p = await gear(id, { js: false });
	await G.clickGoldStepperNavigating(p, 'handfuls', 'plus');
	assert.equal(new URL(p.url()).searchParams.get('tab'), 'gear');
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 0, handfuls: 4 });
	await closePage(p);
});

test('the six gold steppers are 44x44, btn-ghost, named differently in en and fr, with no sideways scroll', async () => {
	const id = await G.characterWithGold(BASE, { handfuls: 3 });
	const names = { en: [], fr: [] };
	for (const lang of ['en', 'fr']) for (const vp of [[375, 812], [1280, 900]]) {
		const p = await openPage(browser, sheetUrl(BASE, id, 'gear'), vp, { lang });
		assert.ok((await sideScroll(p)) <= 0, `scroll at ${vp}`);
		for (const u of G.UNITS) for (const d of ['minus', 'plus']) {
			const l = await G.stepperLook(p, u, d);
			assert.ok(l.w >= 43.5 && l.h >= 43.5, `${u} ${d} ${l.w}x${l.h}`);
			assert.ok(l.cls.includes('btn-ghost'), `${u} ${d} ghost`);
			assert.equal(l.cls.filter((c) => /^btn-/.test(c)).length, 1, `${u} ${d} one variant`);
			assert.ok(l.name.length > 0, `${u} ${d} name`);
			if (vp[0] === 375) names[lang].push(l.name);
		}
		await closePage(p);
	}
	names.en.forEach((n, i) => assert.notEqual(n, names.fr[i], `en and fr name of stepper ${i}`));
});

test('the free handfuls field: 25 on 0/0/0 gives 0 chests, 2 bags, 5 handfuls', async () => {
	const id = await G.characterWithGold(BASE);
	const p = await gear(id);
	await G.enterFreeGold(p, 25);
	await G.submitFreeGold(p);
	assert.deepEqual(await G.goldShown(p), { chests: 0, bags: 2, handfuls: 5 });
	await closePage(p);
});

test('the gold heading holds one help-open button reading Gold (Or in French), no other Gold text, no "?"', async () => {
	const id = await G.characterWithGold(BASE);
	for (const [lang, word, other] of [['en', 'Gold', /gold/gi], ['fr', 'Or', /\bor\b/gi]]) {
		const html = await (await fetch(sheetUrl(BASE, id, 'gear'), { headers: { cookie: `lang=${lang}` } })).text();
		const h = G.goldHeading(html);
		assert.ok(h.startsWith('<h2'), 'an h2 heading');
		const btn = h.match(/<button\b[^>]*data-testid="help-open"[^>]*>([\s\S]*?)<\/button>/);
		assert.ok(btn, 'help-open in the heading');
		const text = btn[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
		assert.equal(text, word);
		const rest = h.replace(btn[0], '').replace(/<[^>]*>/g, ' ');
		assert.ok(!rest.match(other), `no other ${word} text: ${rest}`);
		assert.ok(!h.replace(/<[^>]*>/g, '').includes('?'), 'no "?"');
	}
});

test('docs/ui.md lists the six gold stepper test ids', () => {
	const md = readFileSync('docs/ui.md', 'utf8');
	for (const u of G.UNITS) for (const d of ['minus', 'plus']) assert.ok(md.includes(`gold-${u}-${d}`), `gold-${u}-${d}`);
});
