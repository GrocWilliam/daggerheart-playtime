// us-220 browser tests: French ancestry/community on the sheet; English values stored by the tunnel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser;
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${await r.clone().text()}`);
	return r.json();
};
const srdName = async (kind, id, lang) => {
	const list = await (await fetch(`${BASE}/api/srd/${kind}`, { headers: { cookie: `lang=${lang}` } })).json();
	const e = list.find((x) => x.id === id);
	assert.ok(e, id);
	return e.name;
};
const newCtx = async (lang) => {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	return ctx;
};
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

test('fr sheet: Chosen ancestry and community show name and help lines in lang="fr" elements', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Heritage Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Maëlle', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3,
		ancestry: 'core_ancestry_dwarf', community: 'core_community_highborne'
	})).id;
	const ctx = await newCtx('fr');
	const p = await ctx.newPage();
	assert.equal((await p.goto(`${BASE}/characters/${ch}`)).status(), 200);
	for (const [testid, kind, id] of [['ancestry', 'ancestries', 'core_ancestry_dwarf'], ['community', 'communities', 'core_community_highborne']]) {
		const fr = await srdName(kind, id, 'fr');
		assert.notEqual(fr, await srdName(kind, id, 'en'), `${id} has a French name`);
		const name = p.locator(`[data-testid="${testid}"]`);
		assert.equal(await name.count(), 1);
		const opener = name.locator('[data-testid="help-open"]');
		assert.equal((await (await opener.count() ? opener : name).textContent()).trim(), fr);
		assert.equal(await name.evaluate((e) => e.closest('[lang]')?.getAttribute('lang')), 'fr');
		const details = p.locator(`[data-testid="help"][data-help="${id}"]`);
		assert.equal(await details.count(), 1, `help of ${id}`);
		const lines = await details.evaluate((d) =>
			[...d.querySelectorAll('[lang]')].filter((e) => !e.closest('[data-testid="help-open"]') && !e.querySelector('[lang]')).map((e) => ({ lang: e.getAttribute('lang'), text: e.textContent.trim() })).filter((l) => l.text));
		assert.ok(lines.length >= 2, JSON.stringify(lines));
		for (const l of lines) assert.equal(l.lang, 'fr', `${id}: ${JSON.stringify(l)}`);
	}
	await ctx.close();
});

test('fr tunnel: a character created with an ancestry and a community is stored with the English names', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Tunnel Heritage' })).id;
	const ctx = await newCtx('fr');
	const p = await ctx.newPage();
	await p.goto(`${BASE}/campaigns/${camp}/characters/new`);
	await p.locator('input[name="name"]').fill('Brin');
	await p.locator('select[name="class"]').selectOption({ label: 'Barde' });
	await Promise.all([p.waitForURL(/step=2/), p.getByTestId('tunnel-next').click()]);
	const frAnc = await srdName('ancestries', 'core_ancestry_elf', 'fr');
	const frCom = await srdName('communities', 'core_community_wanderborne', 'fr');
	const anc = p.locator('select[name="ancestry"]');
	await anc.selectOption({ label: frAnc });
	assert.equal(await anc.inputValue(), 'Elf');
	const com = p.locator('select[name="community"]');
	await com.selectOption({ label: frCom });
	assert.equal(await com.inputValue(), 'Wanderborne');
	await Promise.all([p.waitForURL(/step=3/), p.getByTestId('tunnel-next').click()]);
	// us-252: step 3 picks the six traits instead of typing the statistics.
	for (const [f, v] of Object.entries({ agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' })) await p.locator(`select[name="${f}"]`).selectOption(v);
	await Promise.all([p.waitForURL(/step=4/), p.getByTestId('tunnel-next').click()]);
	await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), p.getByTestId('tunnel-create').click()]);
	const id = new URL(p.url()).pathname.split('/').pop();
	const c = await api('GET', `/api/characters/${id}`);
	// the API stores the id of the English-named element (idByName), never the French label
	assert.equal(c.ancestry, 'core_ancestry_elf');
	assert.equal(c.community, 'core_community_wanderborne');
	await ctx.close();
});
