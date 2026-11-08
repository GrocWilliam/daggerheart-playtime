import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// us-178: forms update in place (use:enhance), so there is no navigation to wait for: wait for the POST response, then for the network to settle.
const afterSubmit = async (p, click) => {
	if (p.__js === false) { await Promise.all([p.waitForLoadState('load'), click]); return; } // plain POST: full navigation
	const res = p.waitForResponse((r) => r.request().method() === 'POST');
	await click;
	await res;
	await p.waitForLoadState('networkidle');
};

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body, lang = 'en') => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie: `lang=${lang}` }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const ch = (name) => ({ name, class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 });
async function setup() {
	const c = (await api('POST', '/api/campaigns', { name: 'Camp' })).json;
	const s = (await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Vaultroom' })).json;
	const a = (await api('POST', `/api/campaigns/${c.id}/characters`, ch('Zephyra'))).json;
	const b = (await api('POST', `/api/campaigns/${c.id}/characters`, ch('Quillon'))).json;
	return { c, s, a, b };
}
async function open(c, lang = 'en', js = true) {
	const ctx = await browser.newContext({ javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.__js = js;
	p.setDefaultTimeout(15000);
	await p.goto(`${BASE}/campaigns/${c.id}?step=build`);
	return p;
}
const sceneOf = (p) => p.locator('[data-testid=scene]', { hasText: 'Vaultroom' });
const apiLoot = async (c, s) => (await api('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id).loot;
async function roll(p, table, rarity, count) {
	const sc = sceneOf(p);
	await sc.locator('select[name=table]').selectOption(table);
	await sc.locator('select[name=rarity]').selectOption(rarity);
	await sc.locator('[name=count]').fill(String(count));
	await afterSubmit(p, sc.getByRole('button', { name: /roll loot|lancer/i }).click());
}
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const norm = (t) => t.replace(/\s+/g, ' ');

for (const js of [true, false]) {
	test(`'Roll loot' shows loot-entry with roll, name and features in details (${js ? 'JS' : 'no JS'})`, async () => {
		const { c, s } = await setup();
		const p = await open(c, 'en', js);
		await roll(p, 'items', 'uncommon', 3);
		const stored = await apiLoot(c, s);
		assert.equal(stored.length, 3);
		const entries = sceneOf(p).locator('[data-testid=loot-entry]');
		assert.equal(await entries.count(), 3);
		for (let i = 0; i < 3; i++) {
			const e = entries.nth(i);
			const text = norm(await e.textContent());
			assert.ok(text.includes(stored[i].name), `name ${stored[i].name}`);
			assert.ok(new RegExp(`(^|\\D)${stored[i].roll}(\\D|$)`).test(text), `roll ${stored[i].roll}`);
			assert.equal(await e.locator('details').count(), 1);
			const srd = (await api('GET', `/api/srd/items/${stored[i].srdId}`)).json;
			const feat = strings(srd.features).map(norm).find((x) => x.length > 15);
			if (feat) assert.ok(norm(await e.locator('details').textContent()).includes(feat.slice(0, 20)), 'feature text in details');
		}
	});
}

test("consumables table works too", async () => {
	const { c, s } = await setup();
	const p = await open(c);
	await roll(p, 'consumables', 'common', 2);
	const stored = await apiLoot(c, s);
	assert.equal(stored.length, 2);
	// the enhanced form re-renders after invalidation: poll instead of reading the count once
	const entries = sceneOf(p).locator('[data-testid=loot-entry]');
	for (let i = 0; i < 50 && (await entries.count()) !== 2; i++) await p.waitForTimeout(100);
	assert.equal(await entries.count(), 2);
	assert.ok(stored.every((e) => e.table === 'consumables'));
});

test("'Give to' lists the campaign's characters; giving adds the item and marks the entry given", async () => {
	const { c, s, a, b } = await setup();
	const other = (await api('POST', '/api/campaigns', { name: 'Other' })).json;
	await api('POST', `/api/campaigns/${other.id}/characters`, ch('Foreignxyz'));
	const p = await open(c, 'en', false);
	await roll(p, 'items', 'common', 1);
	const e = sceneOf(p).locator('[data-testid=loot-entry]').first();
	const sel = e.locator('select[name=characterId]');
	const opts = (await sel.locator('option').allTextContents()).join('|');
	assert.ok(opts.includes('Zephyra') && opts.includes('Quillon'));
	assert.ok(!opts.includes('Foreignxyz'));
	const loot = (await apiLoot(c, s))[0];
	await sel.selectOption({ label: 'Quillon' });
	await afterSubmit(p, e.getByRole('button', { name: /give/i }).click());
	assert.equal((await apiLoot(c, s))[0].given, true);
	const q = (await api('GET', `/api/characters/${b.id}`)).json;
	assert.ok(q.items.some((i) => i.srdId === loot.srdId));
	const z = (await api('GET', `/api/characters/${a.id}`)).json;
	assert.equal(z.items.length, 0);
	assert.equal(await sceneOf(p).locator('[data-testid=loot-entry]').count(), 1);
	assert.ok(/given/i.test(await sceneOf(p).locator('[data-testid=loot-entry]').first().textContent()));
});

test('deleting an entry removes it from the page', async () => {
	const { c, s } = await setup();
	const p = await open(c, 'en', false);
	await roll(p, 'items', 'common', 2);
	const before = await apiLoot(c, s);
	const e = sceneOf(p).locator('[data-testid=loot-entry]').first();
	await afterSubmit(p, e.getByRole('button', { name: /delete/i }).click());
	const after = await apiLoot(c, s);
	assert.deepEqual(after.map((x) => x.id), [before[1].id]);
	assert.equal(await sceneOf(p).locator('[data-testid=loot-entry]').count(), 1);
});

test('English and French work: French shows the French item name', async () => {
	const { c, s } = await setup();
	const en = await open(c, 'en');
	const fr = await open(c, 'fr');
	await roll(fr, 'items', 'common', 3);
	const stored = await apiLoot(c, s);
	const entries = sceneOf(fr).locator('[data-testid=loot-entry]');
	await entries.first().waitFor({ timeout: 30000 });
	for (let t = 0; t < 60 && (await entries.count()) < 3; t++) await fr.waitForTimeout(500);
	assert.equal(await entries.count(), 3);
	for (let i = 0; i < 3; i++) {
		const frName = (await api('GET', `/api/srd/items/${stored[i].srdId}`, undefined, 'fr')).json.nameLocalized;
		const text = norm(await entries.nth(i).textContent());
		assert.ok(text.includes(frName), `French name ${frName}`);
	}
	const btnEn = await sceneOf(en).getByRole('button', { name: /roll loot/i }).count();
	assert.equal(btnEn, 1);
	const frBtn = await sceneOf(fr).locator('form button').allTextContents();
	assert.ok(!frBtn.some((t) => /roll loot|give|delete/i.test(t)), `French buttons: ${frBtn}`);
});
