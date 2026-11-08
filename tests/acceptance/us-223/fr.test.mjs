// us-223: French item help on the character sheet and French loot entries on the DM screen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const FR = JSON.parse(readFileSync(new URL('../../../src/lib/srd/fr/items.json', import.meta.url), 'utf8'));
const EN = JSON.parse(readFileSync(new URL('../../../src/lib/srd/core/items.json', import.meta.url), 'utf8'));
const ID = 'core_item_piper_whistle';
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const paras = (id) => (FR[id].features ?? []).flatMap((f) => (f.description ?? []).map((d) => d.paragraph).filter(Boolean)).map(norm).filter((x) => x.length > 15);
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
// lang of the closest [lang] ancestor of every text node containing `text` inside `root`
const langsOf = (root, text) => root.evaluate((el, text) => {
	const out = [];
	const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let n = w.nextNode(); n; n = w.nextNode()) {
		if (!n.textContent.replace(/\s+/g, ' ').includes(text)) continue;
		const l = n.parentElement.closest('[lang]');
		out.push({ lang: l?.getAttribute('lang') ?? null, page: !l || l === document.documentElement || l === document.body });
	}
	return out;
}, text);
const okFr = (l, what) => assert.ok(l.length > 0 && l.every((x) => !x.page && x.lang === 'fr'), what + ' ' + JSON.stringify(l));

test('fr character sheet: an SRD item shows its name and help lines in lang="fr" elements', async () => {
	assert.ok(EN.some((e) => e.id === ID) && paras(ID).length > 0);
	const camp = (await api('POST', '/api/campaigns', { name: 'Item Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, { name: 'Ivo', class: 'Warrior', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, armorSlots: 3 })).id;
	await api('POST', `/api/characters/${ch}/items`, { srdId: ID });
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	assert.equal((await p.goto(`${BASE}/characters/${ch}`)).status(), 200);
	const row = p.locator('[data-testid="item-row"]').filter({ has: p.locator(`details[data-help="${ID}"]`) });
	assert.equal(await row.count(), 1);
	okFr(await langsOf(row, FR[ID].name), 'name');
	for (const t of paras(ID)) okFr(await langsOf(row, t), 'help line');
	await ctx.close();
});

test('fr DM screen: a loot-entry shows the item text in lang="fr"', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Loot Camp' })).id;
	const sc = (await api('POST', `/api/campaigns/${camp}/scenes`, { title: 'Vault' })).id;
	const loot = await api('POST', `/api/campaigns/${camp}/scenes/${sc}/loot`, { table: 'items', rarity: 'common', count: 3, seed: 7 });
	const entries = Array.isArray(loot) ? loot : (await api('GET', `/api/campaigns/${camp}/scenes`)).find((s) => s.id === sc).loot;
	assert.ok(entries.length >= 1);
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	assert.equal((await p.goto(`${BASE}/campaigns/${camp}?step=build`)).status(), 200);
	const els = p.locator('[data-testid="loot-entry"]');
	assert.equal(await els.count(), entries.length);
	let checked = 0;
	for (let i = 0; i < entries.length; i++) {
		const id = entries[i].srdId;
		assert.ok(FR[id], `French entry for ${id}`);
		const e = els.nth(i);
		okFr(await langsOf(e, FR[id].name), 'loot name');
		for (const t of paras(id)) { okFr(await langsOf(e, t), 'loot text'); checked++; }
	}
	assert.ok(checked > 0, 'at least one feature paragraph checked');
	await ctx.close();
});
