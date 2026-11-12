import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { homeUrl, runStepUrl, sheetUrl } from '../support/pages.mjs';
import { createCampaign, createCharacter, createCurrentScene, addJournalEntry } from '../support/api.mjs';
import { insertStyled, lookOf, focusWithKeyboard, borderTokenPixel, h1FontSize, useArmorCheckbox, plainButtonLooks } from '../support/looks.mjs';

const BASE = process.env.BASE_URL;
const ACCENT = 'rgb(212, 160, 80)';
const BG = 'rgb(15, 26, 21)';
const TEXT = 'rgb(239, 228, 200)';
const DANGER = 'rgb(238, 128, 112)';
const TEAL = 'rgb(108, 195, 181)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const NO_BORDER = { borderWidth: '0px' };
const SOLID_1PX = (color) => ({ borderStyle: 'solid', borderWidth: '1px', borderColor: color });
const PRIMARY = { background: ACCENT, text: BG, ...NO_BORDER };
const SECONDARY = { background: TRANSPARENT, text: ACCENT, ...SOLID_1PX(ACCENT) };
const GHOST = { background: TRANSPARENT, text: TEXT, ...NO_BORDER };
const DANGER_LOOK = { background: TRANSPARENT, text: DANGER, ...SOLID_1PX(DANGER) };

let browser, campaignId, characterId;
before(async () => {
	browser = await launchBrowser();
	campaignId = await createCampaign(BASE, 'Lookcamp');
	characterId = await createCharacter(BASE, campaignId, 'Alyndra');
	await createCharacter(BASE, campaignId, 'Brom');
	await createCurrentScene(BASE, campaignId, 'Alphaglade');
	await addJournalEntry(BASE, campaignId, 'We met a fox.');
});
after(async () => { await browser?.close(); });

const withPage = async (url, viewport, fn) => {
	const page = await openPage(browser, url, viewport);
	try { await fn(page); } finally { await closePage(page); }
};
const assertLook = (look, expected, what) => {
	for (const [k, v] of Object.entries(expected)) assert.equal(look[k], v, `${what} ${k}: ${JSON.stringify(look)}`);
};

test('variant classes: primary, secondary, ghost, danger buttons and a secondary link have their look, 44×44px and a 4px radius', async () => {
	await withPage(homeUrl(BASE), [1024, 768], async (page) => {
		const cases = [
			[{ tag: 'button', cls: 'btn-primary' }, PRIMARY],
			[{ tag: 'button', cls: 'btn-secondary' }, SECONDARY],
			[{ tag: 'button', cls: 'btn-ghost' }, GHOST],
			[{ tag: 'button', cls: 'btn-danger' }, DANGER_LOOK],
			[{ tag: 'a', cls: 'btn-secondary' }, SECONDARY]
		];
		const ids = [];
		for (const [probe] of cases) ids.push(await insertStyled(page, probe));
		for (let i = 0; i < cases.length; i++) {
			const [probe, expected] = cases[i];
			const what = `<${probe.tag} class=${probe.cls}>`;
			const look = await lookOf(page, ids[i]);
			assertLook(look, expected, what);
			assert.ok(look.width >= 43.9 && look.height >= 43.9, `${what} is ${look.width}×${look.height}`);
			assert.equal(look.radius, '4px', `${what} radius`);
		}
	});
});

test('a pressed btn-secondary takes the primary look; aria-pressed=false keeps the secondary look', async () => {
	await withPage(homeUrl(BASE), [1024, 768], async (page) => {
		const pressed = await insertStyled(page, { tag: 'button', cls: 'btn-secondary', pressed: true });
		const notPressed = await insertStyled(page, { tag: 'button', cls: 'btn-secondary', pressed: false });
		const p = await lookOf(page, pressed);
		assert.equal(p.background, ACCENT, 'pressed background');
		assert.equal(p.text, BG, 'pressed text');
		assertLook(await lookOf(page, notPressed), SECONDARY, 'aria-pressed=false');
	});
});

test('a btn-ghost focused with the keyboard has a 2px solid teal outline', async () => {
	await withPage(homeUrl(BASE), [1024, 768], async (page) => {
		const ghost = await insertStyled(page, { tag: 'button', cls: 'btn-ghost' });
		const o = await focusWithKeyboard(page, ghost);
		assert.ok(o.focused, 'the ghost button gets keyboard focus');
		assert.deepEqual([o.width, o.style, o.color], ['2px', 'solid', TEAL]);
	});
});

test('--border paints as the accent at 35% alpha', async () => {
	for (const url of [homeUrl(BASE), runStepUrl(BASE, campaignId), sheetUrl(BASE, characterId)])
		await withPage(url, [1024, 768], async (page) => {
			const [r, g, b, a] = await borderTokenPixel(page);
			assert.ok(Math.abs(r - 212) <= 2 && Math.abs(g - 160) <= 2 && Math.abs(b - 80) <= 2 && Math.abs(a - 89) <= 3, `${url}: ${[r, g, b, a]}`);
		});
});

test('the sheet useArmor checkbox is 20×20px with the accent colour, in a label at least 44px high', async () => {
	for (const viewport of [[375, 812], [1024, 768]])
		await withPage(sheetUrl(BASE, characterId, 'play'), viewport, async (page) => {
			const c = await useArmorCheckbox(page);
			assert.ok(Math.abs(c.width - 20) <= 0.5 && Math.abs(c.height - 20) <= 0.5, `${viewport}: ${c.width}×${c.height}`);
			assert.equal(c.accentColor, ACCENT, `${viewport} accent-color`);
			assert.ok(c.labelHeight >= 43.5, `${viewport} label height ${c.labelHeight}`);
		});
});

test('h1 is 24px on phones and 28px from 768px', async () => {
	for (const [viewport, size] of [[[375, 812], '24px'], [[768, 1024], '28px'], [[1024, 768], '28px']])
		await withPage(homeUrl(BASE), viewport, async (page) => {
			assert.equal(await h1FontSize(page), size, `${viewport}`);
		});
});

test('buttons with no variant class keep the accent background and bg text (home and Run step)', async () => {
	for (const url of [homeUrl(BASE), runStepUrl(BASE, campaignId)])
		await withPage(url, [1024, 768], async (page) => {
			const looks = await plainButtonLooks(page);
			assert.ok(looks.length > 0, `${url} has buttons`);
			for (const l of looks) assert.deepEqual([l.background, l.text], [ACCENT, BG], `${url} ${l.name}`);
		});
});
