import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const core = (f) => json(`src/lib/srd/core/${f}.json`);
const FR = json('src/lib/srd/fr.json');
const enName = (e) => (typeof e.name === 'string' ? e.name.charAt(0) + e.name.slice(1).toLowerCase() : e.name['en-US']);
const nameIn = (e, lang) => (lang === 'fr' ? (FR[e.id] ?? enName(e)) : enName(e));
const CLASSES = core('classes'), ANCS = core('ancestries'), COMS = core('communities');

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
async function open(lang) {
	const id = (await api('POST', '/api/campaigns', { name: 'Dropdowns' })).json.id;
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/campaigns/${id}?step=build`);
	return { ctx, page, id };
}
const opts = (sel) => sel.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent.trim() })));
const form = (page) => page.locator('form[action="?/addCharacter"]');

test('the class select has one option per SRD class, English values; French labels in French', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang);
		const f = form(page);
		assert.equal(await f.locator('input[name=class]').count(), 0, 'no class text input');
		const sel = f.locator('select[name=class]');
		assert.equal(await sel.count(), 1);
		assert.ok(await sel.evaluate((s) => s.required), 'class is required');
		const os = (await opts(sel)).filter((o) => o.value !== '');
		assert.equal(os.length, CLASSES.length);
		for (const c of CLASSES) {
			const o = os.find((x) => x.value === enName(c));
			assert.ok(o, `${lang}: value ${enName(c)}`);
			assert.equal(o.label, nameIn(c, lang));
		}
		await ctx.close();
	}
});

test('ancestry and community selects start with an empty None option, then every SRD entry', async () => {
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang);
		const f = form(page);
		for (const [name, list] of [['ancestry', ANCS], ['community', COMS]]) {
			assert.equal(await f.locator(`input[name=${name}]`).count(), 0);
			const sel = f.locator(`select[name=${name}]`);
			assert.equal(await sel.count(), 1, name);
			assert.ok(!(await sel.evaluate((s) => s.required)), `${name} optional`);
			const os = await opts(sel);
			assert.equal(os.length, list.length + 1);
			assert.equal(os[0].value, '');
			if (lang === 'en') assert.equal(os[0].label, 'None'); else assert.ok(os[0].label && os[0].label !== 'None');
			for (const e of list) {
				const o = os.slice(1).find((x) => x.value === enName(e));
				assert.ok(o, `${lang} ${name}: value ${enName(e)}`);
				assert.equal(o.label, nameIn(e, lang));
			}
		}
		await ctx.close();
	}
});

async function fillAndSubmit(page, sel) {
	const f = form(page);
	const nums = { level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 };
	await f.locator('input[name=name]').fill('Selma');
	for (const [k, v] of Object.entries(nums)) await f.locator(`input[name=${k}]`).fill(String(v));
	await f.locator('select[name=class]').selectOption(sel.class);
	await f.locator('select[name=ancestry]').selectOption(sel.ancestry);
	await f.locator('select[name=community]').selectOption(sel.community);
	await Promise.all([page.waitForLoadState('load'), f.locator('button[type=submit]').click()]);
}
async function sheet(page, id) {
	await page.goto(`${BASE}/campaigns/${id}`);
	const link = page.locator('[data-testid=character-card] [data-testid=character-name]').first();
	await link.click();
	await page.waitForLoadState('load');
}

test('submitting with a chosen class, ancestry and community creates the character; the sheet shows them', async () => {
	const { ctx, page, id } = await open('en');
	await fillAndSubmit(page, { class: 'Wizard', ancestry: 'Clank', community: 'Highborne' });
	assert.equal(await page.locator('[data-testid=character-card]').count(), 1);
	await sheet(page, id);
	assert.ok((await page.locator('body').innerText()).includes('Wizard'));
	assert.equal((await page.locator('[data-testid=ancestry]').innerText()).trim(), 'Clank');
	assert.equal((await page.locator('[data-testid=community]').innerText()).trim(), 'Highborne');
	const ch = (await api('GET', `/api/campaigns/${id}`)).json.characters[0];
	assert.equal(ch.class, 'Wizard');
	assert.ok(ch.ancestry && ch.community);
	await ctx.close();
});

test('submitting with None for ancestry and community creates the character with them empty', async () => {
	const { ctx, page, id } = await open('en');
	await fillAndSubmit(page, { class: 'Ranger', ancestry: '', community: '' });
	assert.equal(await page.locator('[data-testid=character-card]').count(), 1);
	const ch = (await api('GET', `/api/campaigns/${id}`)).json.characters[0];
	assert.equal(ch.class, 'Ranger');
	assert.equal(ch.ancestry, null);
	assert.equal(ch.community, null);
	await sheet(page, id);
	assert.equal(await page.locator('[data-testid=ancestry]').count(), 0);
	assert.equal(await page.locator('[data-testid=community]').count(), 0);
	await ctx.close();
});

test('the i18n catalogs have the same keys', () => {
	const en = json('src/lib/i18n/en.json'), fr = json('src/lib/i18n/fr.json');
	assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
});
