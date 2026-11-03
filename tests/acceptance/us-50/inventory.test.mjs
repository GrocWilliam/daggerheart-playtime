import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const FR = json('src/lib/srd/fr.json');
const KINDS = ['weapons', 'armors', 'consumables', 'items'];
const SRD = Object.fromEntries(KINDS.map((k) => [k, json(`src/lib/srd/core/${k}.json`)]));
const ALL = KINDS.flatMap((k) => SRD[k]);
const en = (e) => e.name['en-US'];
const nameIn = (e, lang) => (lang === 'fr' ? (FR[e.id] ?? en(e)) : en(e));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const paras = (d) => (d ?? []).map((x) => x.paragraph?.['en-US']).filter(Boolean);
const lines = (e) => (e.features ?? []).flatMap((f) => {
	const ps = paras(f.description);
	return f.name ? [`${f.name['en-US']}: ${ps[0] ?? ''}`.trim(), ...ps.slice(1)] : ps;
});
const sample = { weapons: SRD.weapons[0], armors: SRD.armors[0], consumables: SRD.consumables[0], items: SRD.items[0] };

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
async function mk() {
	const camp = await api('POST', '/api/campaigns', { name: 'Inventory' });
	const r = await api('POST', `/api/campaigns/${camp.json.id}/characters`, {
		name: 'Rook', class: 'Ranger', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	assert.equal(r.status, 201);
	return r.json.id;
}
const addItem = (id, body) => api('POST', `/api/characters/${id}/items`, body);
const items = async (id) => (await api('GET', `/api/characters/${id}`)).json.items;
async function open(lang, path, { js = false, viewport } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: viewport ?? { width: 1000, height: 900 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	await page.goto(BASE + path);
	return { ctx, page };
}
// The SRD picker is the select grouped in optgroups other than the card select.
const srdSelect = (page) => page.locator('select:has(optgroup):not([name="cardId"])');
const srdForm = (page) => page.locator('form:has(select:has(optgroup):not([name="cardId"]))');

test('API: {srdId} adds the SRD item named in English (weapon, armor, consumable, item)', async () => {
	const id = await mk();
	for (const k of KINDS) {
		const e = sample[k];
		const r = await addItem(id, { srdId: e.id });
		assert.equal(r.status, 201, k);
		assert.equal(r.json.name, en(e));
		assert.equal(r.json.srdId, e.id);
		assert.equal(r.json.quantity, 1);
	}
	const r = await addItem(id, { srdId: SRD.items[1].id, quantity: 3 });
	assert.equal(r.status, 201);
	assert.equal(r.json.quantity, 3);
	const held = await items(id);
	assert.equal(held.length, 5);
	assert.deepEqual(held.map((i) => i.srdId), [...KINDS.map((k) => sample[k].id), SRD.items[1].id]);
});

test('API: an unknown srdId answers 400 and adds nothing', async () => {
	const id = await mk();
	for (const bad of ['nope', 'core_weapon_does_not_exist', 5, '']) {
		assert.equal((await addItem(id, { srdId: bad })).status, 400, JSON.stringify(bad));
	}
	const card = json('src/lib/srd/core/domain-cards.json')[0];
	assert.equal((await addItem(id, { srdId: card.id })).status, 400, 'a domain card is not an item');
	assert.deepEqual(await items(id), []);
});

test('API: merging by name works (same srdId twice, or free-text name equal to the SRD name)', async () => {
	const id = await mk();
	const e = sample.weapons;
	assert.equal((await addItem(id, { srdId: e.id })).status, 201);
	const r2 = await addItem(id, { srdId: e.id, quantity: 2 });
	assert.ok([200, 201].includes(r2.status));
	let held = await items(id);
	assert.equal(held.length, 1);
	assert.equal(held[0].quantity, 3);
	await addItem(id, { name: en(e).toUpperCase() });
	held = await items(id);
	assert.equal(held.length, 1);
	assert.equal(held[0].quantity, 4);
	assert.equal(held[0].srdId, e.id);
});

test('add form: a select "from the SRD" next to the name input, 4 optgroups with every SRD entry (en + fr)', async () => {
	const id = await mk();
	const total = ALL.length;
	assert.equal(total, 346);
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`);
		const sel = srdSelect(page);
		assert.equal(await sel.count(), 1, 'one SRD select');
		assert.equal(await srdForm(page).locator('input[type="text"][name="name"]').count(), 1, 'free-text name still next to it');
		const groups = await sel.locator('optgroup').evaluateAll((gs) =>
			gs.map((g) => ({ label: g.label, opts: [...g.querySelectorAll('option')].map((o) => [o.value, o.textContent.trim()]) })));
		assert.equal(groups.length, 4);
		assert.equal(new Set(groups.map((g) => g.label)).size, 4, 'distinct group labels');
		groups.forEach((g, i) => {
			const exp = SRD[KINDS[i]];
			assert.deepEqual(g.opts.map((o) => o[0]).sort(), exp.map((e) => e.id).sort(), `${KINDS[i]} values (${lang})`);
			for (const [v, label] of g.opts) assert.equal(label, nameIn(exp.find((e) => e.id === v), lang), `${lang} label of ${v}`);
		});
		await ctx.close();
	}
});

test('submitting the SRD select alone (no JS) adds the item to the sheet and the API', async () => {
	const id = await mk();
	const e = sample.armors;
	const { ctx, page } = await open('fr', `/characters/${id}`);
	await srdSelect(page).selectOption(e.id);
	await Promise.all([page.waitForNavigation(), srdForm(page).locator('button[type="submit"]').click()]);
	const held = await items(id);
	assert.equal(held.length, 1);
	assert.equal(held[0].name, en(e));
	assert.equal(held[0].srdId, e.id);
	const row = page.locator('[data-testid="item"]');
	assert.equal(await row.count(), 1);
	assert.ok(norm(await row.textContent()).includes(en(e)));
	await ctx.close();
});

test('an item with an srdId shows its helper, a free-text item does not (en + fr)', async () => {
	const id = await mk();
	const e = sample.consumables;
	await addItem(id, { srdId: e.id });
	await addItem(id, { name: 'Lucky coin' });
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`);
		const rows = page.locator('[data-testid="item"]');
		assert.equal(await rows.count(), 2);
		const h = page.locator(`details[data-testid="help"][data-help="${e.id}"]`);
		assert.equal(await h.count(), 1);
		const sm = h.locator('> summary');
		assert.equal(norm(await sm.textContent()), '?');
		const label = await sm.getAttribute('aria-label');
		const prefix = lang === 'fr' ? 'Aide : ' : 'Help: ';
		assert.ok(label.startsWith(prefix) && (label.includes(en(e)) || label.includes(nameIn(e, lang))), label);
		// the free-text item has no helper next to it
		const lucky = page.locator('li:has([data-testid="item"]):has-text("Lucky coin")');
		assert.equal(await lucky.locator('details[data-testid="help"]').count(), 0);
		await ctx.close();
	}
});

test('opened item helper: 44x44 target and the SRD text in a lang="en" block, without JavaScript', async () => {
	const id = await mk();
	const picks = KINDS.map((k) => SRD[k].find((e) => lines(e).length > 0));
	for (const e of picks) await addItem(id, { srdId: e.id });
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`, { js: false });
		for (const e of picks) {
			const h = page.locator(`details[data-testid="help"][data-help="${e.id}"]`);
			const box = await h.locator('> summary').boundingBox();
			assert.ok(box.width >= 44 && box.height >= 44, `${e.id} target ${box.width}x${box.height}`);
			assert.equal(await h.evaluate((d) => d.open), false);
			await h.locator('> summary').click();
			assert.equal(await h.evaluate((d) => d.open), true);
			const blocks = h.locator('[lang="en"]');
			assert.ok((await blocks.count()) >= 1, 'lang=en block');
			const txt = norm((await blocks.allTextContents()).join(' '));
			for (const l of lines(e)) assert.ok(txt.includes(norm(l)), `${e.id}: ${l.slice(0, 50)}`);
			await h.locator('> summary').click();
		}
		await ctx.close();
	}
});

test('375px wide: no horizontal overflow, the SRD select fits the viewport', async () => {
	const id = await mk();
	await addItem(id, { srdId: SRD.weapons[0].id });
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`, { viewport: { width: 375, height: 800 } });
		const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(over <= 0, `overflow ${over}px`);
		const b = await srdSelect(page).boundingBox();
		assert.ok(b.x >= 0 && b.x + b.width <= 375, `select box ${b.x}+${b.width}`);
		assert.ok(b.height >= 44, `select height ${b.height}`);
		await ctx.close();
	}
});
