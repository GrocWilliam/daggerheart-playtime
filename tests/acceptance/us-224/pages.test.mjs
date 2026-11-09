// us-224: no element outside the footer has lang="en" on French pages; the footer keeps its English licence.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${await r.clone().text()}`);
	return r.json();
};
const KINDS = ['classes', 'subclasses', 'ancestries', 'communities', 'domains', 'domain-cards', 'weapons', 'armors', 'consumables', 'items', 'rules', 'adversaries', 'environments'];

let S;
async function setup() {
	if (S) return S;
	const camp = (await api('POST', '/api/campaigns', { name: 'Complete Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Lina', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3,
		ancestry: 'core_ancestry_dwarf', community: 'core_community_highborne'
	})).id;
	await api('PATCH', `/api/characters/${ch}`, { subclass: 'core_subclass_beastbound', primaryWeapon: 'core_weapon_broadsword', secondaryWeapon: 'core_weapon_round_shield', armorId: 'core_armor_gambeson_armor' });
	await api('POST', `/api/characters/${ch}/cards`, { cardId: 'core_domain_card_a_soldiers_bond' });
	await api('POST', `/api/characters/${ch}/items`, { srdId: 'core_item_premium_bedroll', quantity: 1 });
	const sc = (await api('POST', `/api/campaigns/${camp}/scenes`, { title: 'Scene une', environmentId: 'env_abandoned_grove' })).id;
	await api('PATCH', `/api/campaigns/${camp}/scenes/${sc}`, { status: 'current' });
	await api('POST', `/api/campaigns/${camp}/scenes/${sc}/encounter`, { partySize: 3, tier: 1, seed: 5 });
	await api('POST', `/api/campaigns/${camp}/scenes/${sc}/loot`, { table: 'items', rarity: 'common' });
	return (S = { camp, ch });
}

async function open(path, lang) {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	return { ctx, p };
}
// Elements with lang="en" that are not inside the footer.
const englishOutsideFooter = (p) => p.evaluate(() =>
	[...document.querySelectorAll('[lang="en" i]')]
		.filter((e) => !e.closest('footer'))
		.map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('data-testid') ?? ''}]: ${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)}`));

async function pages() {
	const { camp, ch } = await setup();
	return [
		['/', 'home'],
		['/reference', 'reference'],
		[`/campaigns/${camp}?step=build`, 'build'],
		[`/campaigns/${camp}?step=run`, 'run'],
		...[1, 2, 3, 4].map((s) => [`/campaigns/${camp}/characters/new?step=${s}&name=Zed&class=Wizard&level=1&ancestry=Dwarf&community=Highborne&evasion=10&majorThreshold=5&severeThreshold=10&maxHp=5&maxStress=6&armorSlots=3`, `tunnel step ${s}`]),
		[`/characters/${ch}`, 'sheet']
	];
}

test('lang=fr: no element outside the footer has lang="en" on any page', async () => {
	for (const [path, name] of await pages()) {
		const { ctx, p } = await open(path, 'fr');
		assert.equal(await p.locator('html').getAttribute('lang'), 'fr', name);
		if (name === 'reference') {
			for (const k of KINDS) assert.equal(await p.locator(`[data-testid="ref-${k}"]`).count(), 1, `ref-${k}`);
		}
		assert.deepEqual(await englishOutsideFooter(p), [], `${name} (${path})`);
		await ctx.close();
	}
});

test('lang=fr: the footer srd-licence keeps lang="en" and its English licence text', async () => {
	for (const [path, name] of await pages()) {
		const { ctx, p } = await open(path, 'fr');
		const f = p.locator('[data-testid="srd-licence"]');
		assert.equal(await f.count(), 1, name);
		assert.equal(await f.getAttribute('lang'), 'en', name);
		assert.match((await f.textContent()).replace(/\s+/g, ' '), /Daggerheart|licen[cs]e|Darrington/i, name);
		await ctx.close();
	}
});

test('lang=en: English SRD names are shown as before', async () => {
	const { camp, ch } = await setup();
	let { ctx, p } = await open(`/campaigns/${camp}?step=build`, 'en');
	assert.ok((await p.locator('[data-testid="current-scene"], [data-testid="scene"]').first().textContent()).includes('Abandoned Grove'));
	await ctx.close();
	({ ctx, p } = await open('/reference?q=Acid+Burrower', 'en'));
	assert.ok((await p.locator('[data-testid="ref-adversaries"]').textContent()).includes('Acid Burrower'));
	await ctx.close();
	({ ctx, p } = await open(`/characters/${ch}`, 'en'));
	const t = (await p.locator('body').textContent()).replace(/\s+/g, ' ');
	for (const n of ['Broadsword', 'Beastbound', 'Dwarf', 'Highborne']) assert.ok(t.includes(n), n);
	await ctx.close();
});
