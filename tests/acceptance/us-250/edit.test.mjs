// US-250: the sheet's edit form keeps the level-change recomputation when thresholds are untouched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');

const BASE = process.env.BASE_URL;
const CHAIN = 'core_armor_chainmail_armor';
const call = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
};
const mk = async (over) => {
	const c = await call('POST', '/api/campaigns', { name: 'Sheet edit' });
	const r = await call('POST', `/api/campaigns/${c.json.id}/characters`, { name: 'Ayla', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3, ...over });
	assert.equal(r.status, 201, r.text);
	return r.json.id;
};

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

// Opens the sheet, fills the edit form (by field name), saves, returns the displayed thresholds and the stored ones.
async function edit(id, fill, { lang = 'en', js = false } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	try {
		await page.goto(`${BASE}/characters/${id}`);
		const form = page.locator('form[action="?/edit"]');
		for (const [k, v] of Object.entries(fill)) await form.locator(`input[name="${k}"]`).fill(String(v));
		await Promise.all([page.waitForLoadState('load'), form.locator('button[type="submit"]').click()]);
		const shown = await page.locator('[data-testid="thresholds"]').first();
		await shown.waitFor();
		const text = (await shown.textContent()).replace(/\s+/g, '');
		const g = await call('GET', `/api/characters/${id}`);
		return { text, stored: [g.json.majorThreshold, g.json.severeThreshold], level: g.json.level };
	} finally {
		await ctx.close();
	}
}

for (const lang of ['en', 'fr']) {
	test(`level 1 Chainmail 8/16, level 3 with thresholds untouched shows 10/18 (${lang}, no JS)`, async () => {
		const id = await mk({ evasion: 9, majorThreshold: 8, severeThreshold: 16, armorSlots: 4, armorId: CHAIN });
		const r = await edit(id, { level: 3 }, { lang });
		assert.equal(r.level, 3);
		assert.deepEqual(r.stored, [10, 18]);
		assert.equal(r.text, '10/18');
	});
}

test('level 1 Chainmail, level 3 untouched thresholds with JavaScript enabled shows 10/18', async () => {
	const id = await mk({ evasion: 9, majorThreshold: 8, severeThreshold: 16, armorSlots: 4, armorId: CHAIN });
	const r = await edit(id, { level: 3 }, { js: true });
	assert.deepEqual(r.stored, [10, 18]);
});

test('unarmored level 2 with 2/4, level 4 untouched gives 4/8', async () => {
	const id = await mk({ level: 2, majorThreshold: 2, severeThreshold: 4 });
	const r = await edit(id, { level: 4 });
	assert.equal(r.level, 4);
	assert.deepEqual(r.stored, [4, 8]);
	assert.equal(r.text, '4/8');
});

test('unarmored level 2 with hand-entered 5/10, level 3 untouched keeps 5/10', async () => {
	const id = await mk({ level: 2, majorThreshold: 5, severeThreshold: 10 });
	const r = await edit(id, { level: 3 });
	assert.equal(r.level, 3);
	assert.deepEqual(r.stored, [5, 10]);
	assert.equal(r.text, '5/10');
});

test('level 1 Chainmail, level 3 with major changed to 9 saves 9/16', async () => {
	const id = await mk({ evasion: 9, majorThreshold: 8, severeThreshold: 16, armorSlots: 4, armorId: CHAIN });
	const r = await edit(id, { level: 3, majorThreshold: 9 });
	assert.equal(r.level, 3);
	assert.deepEqual(r.stored, [9, 16]);
	assert.equal(r.text, '9/16');
});

test('level unchanged and a threshold changed saves that threshold', async () => {
	const id = await mk({ level: 2, majorThreshold: 5, severeThreshold: 10 });
	const r = await edit(id, { severeThreshold: 12 });
	assert.equal(r.level, 2);
	assert.deepEqual(r.stored, [5, 12]);
	assert.equal(r.text, '5/12');
});
