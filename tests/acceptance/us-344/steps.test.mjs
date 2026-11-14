import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { TUNNEL_VALUES, tunnelCampaign, tunnelUrl, levelOneCharacter, levelUpCardId, levelUpUrl, levelUpValues, stepsOf, progressText, buttonLooks, selectWidths, pageScroll } from '../support/tunnels.mjs';

const BASE = process.env.BASE_URL;
let browser, cid, charId, cardId;
before(async () => {
	browser = await launchBrowser();
	cid = await tunnelCampaign(BASE);
	charId = await levelOneCharacter(BASE);
	cardId = await levelUpCardId(BASE, charId);
});
after(async () => { await browser?.close(); });

const ACCENT = 'rgb(212, 160, 80)', BG = 'rgb(15, 26, 21)', MUTED = 'rgb(185, 176, 143)', TEXT = 'rgb(239, 228, 200)';
const TRANSPARENT = ['rgba(0, 0, 0, 0)', 'transparent'];
const VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];
const STEP_OF = { en: 'Step 2 of 4', fr: 'Étape 2 sur 4' };
const stepNumbered = (steps, n) => steps.filter((s) => new RegExp(`^${n}(\\D|$)`).test(s.text));

function assertBar(steps, current, total) {
	const cur = stepNumbered(steps, current);
	assert.equal(cur.length, 1, `one step numbered ${current}`);
	assert.equal(cur[0].current, 'step');
	assert.equal(cur[0].background, ACCENT);
	assert.equal(cur[0].color, BG);
	for (let n = 1; n <= total; n++) {
		if (n === current) continue;
		const [s] = stepNumbered(steps, n);
		assert.ok(s, `step numbered ${n}`);
		assert.notEqual(s.current, 'step');
		if (n < current) { assert.equal(s.color, ACCENT, `done step ${n} text`); assert.ok(TRANSPARENT.includes(s.background), `done step ${n} bg ${s.background}`); }
		else assert.equal(s.color, MUTED, `next step ${n} text`);
	}
}
const gapOk = (a, b) => a.right + 7.5 <= b.left || b.right + 7.5 <= a.left || a.bottom + 7.5 <= b.top || b.bottom + 7.5 <= a.top;
function assertButtons(l, ids) {
	const { next, back, cancel } = ids;
	assert.ok(l[next].classes.includes('btn-primary'), `${next} btn-primary`);
	assert.ok(l[back].classes.includes('btn-secondary'), `${back} btn-secondary`);
	assert.equal(l[back].color, ACCENT);
	assert.ok(l[cancel].classes.includes('btn-ghost'), `${cancel} btn-ghost`);
	assert.equal(l[cancel].color, TEXT);
	const all = Object.entries(l);
	for (const [k, b] of all) { assert.ok(b.width >= 43.5 && b.height >= 43.5, `${k} is ${b.width}x${b.height}`); }
	for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(gapOk(all[i][1], all[j][1]), `${all[i][0]} and ${all[j][0]} are at least 8px apart`);
}
const TUNNEL_BTNS = { next: 'tunnel-next', back: 'tunnel-back', cancel: 'tunnel-cancel' };

test('tunnel step 2: numbered step bar with current, done and next colours, and "Step 2 of 4" kept (4 viewports, en and fr)', async () => {
	for (const lang of ['en', 'fr']) for (const vp of VIEWPORTS) {
		const page = await openPage(browser, tunnelUrl(BASE, cid, 2), vp, { lang });
		assertBar(await stepsOf(page, 'tunnel-progress'), 2, 4);
		assert.ok((await progressText(page, 'tunnel-progress')).includes(STEP_OF[lang]), `${lang} ${vp}`);
		await closePage(page);
	}
});

test('tunnel step 2: Next is btn-primary, Back btn-secondary, Cancel btn-ghost, 44px targets, 8px apart', async () => {
	for (const vp of VIEWPORTS) {
		const page = await openPage(browser, tunnelUrl(BASE, cid, 2), vp);
		assertButtons(await buttonLooks(page, Object.values(TUNNEL_BTNS)), TUNNEL_BTNS);
		await closePage(page);
	}
});

test('tunnel step 3 at 1024x768: each trait select is at most 256px wide', async () => {
	const page = await openPage(browser, tunnelUrl(BASE, cid, 3), [1024, 768]);
	const widths = (await selectWidths(page, 'form:has([data-testid=tunnel-next])')).filter((s) => /^(agility|strength|finesse|instinct|presence|knowledge)$/.test(s.name));
	assert.equal(widths.length, 6);
	for (const s of widths) assert.ok(s.width <= 256.5, `${s.name} is ${s.width}px`);
	await closePage(page);
});

test('tunnel step 4: Create is btn-primary and each Edit is btn-secondary', async () => {
	const page = await openPage(browser, tunnelUrl(BASE, cid, 4), [1024, 768]);
	const l = await buttonLooks(page, ['tunnel-create', 'tunnel-edit-1', 'tunnel-edit-2', 'tunnel-edit-3']);
	assert.ok(l['tunnel-create'].classes.includes('btn-primary'));
	for (const k of ['tunnel-edit-1', 'tunnel-edit-2', 'tunnel-edit-3']) assert.ok(l[k].classes.includes('btn-secondary'), k);
	await closePage(page);
});

const LEVEL_BTNS = { next: 'levelup-next', back: 'levelup-back', cancel: 'levelup-cancel' };
test('level-up step 2 of a level-1 character: step 2 current with the same colours; Next primary, Back secondary, Cancel ghost', async () => {
	const page = await openPage(browser, levelUpUrl(BASE, charId, 2, { newExperience: 'Brawler' }), [375, 812]);
	assertBar(await stepsOf(page, 'levelup-progress'), 2, 5);
	assertButtons(await buttonLooks(page, Object.values(LEVEL_BTNS)), LEVEL_BTNS);
	await closePage(page);
});

test('level-up step 5: Confirm is btn-primary', async () => {
	const page = await openPage(browser, levelUpUrl(BASE, charId, 5, levelUpValues(cardId)), [375, 812]);
	assert.equal(new URL(page.url()).searchParams.get('step'), '5');
	assert.ok((await buttonLooks(page, ['levelup-confirm']))['levelup-confirm'].classes.includes('btn-primary'));
	await closePage(page);
});

test('character tunnel without JavaScript: valid values and Create open the new sheet', async () => {
	const page = await openPage(browser, tunnelUrl(BASE, cid, 4), [1024, 768], { js: false });
	await Promise.all([page.waitForURL((u) => /^\/characters\/[^/]+$/.test(u.pathname)), page.getByTestId('tunnel-create').click()]);
	assert.match(new URL(page.url()).pathname, /^\/characters\/[^/]+$/);
	await closePage(page);
});

test('both tunnels at 360 and 375px: no sideways scroll', async () => {
	const urls = [1, 2, 3, 4].map((s) => tunnelUrl(BASE, cid, s)).concat([1, 2, 3, 4, 5].map((s) => levelUpUrl(BASE, charId, s, levelUpValues(cardId))));
	for (const w of [360, 375]) for (const lang of ['en', 'fr']) for (const url of urls) {
		const page = await openPage(browser, url, [w, 800], { lang });
		const r = await pageScroll(page);
		assert.ok(r.scroll <= r.client, `${lang} ${w}px ${url}: ${r.scroll} > ${r.client}`);
		await closePage(page);
	}
});
