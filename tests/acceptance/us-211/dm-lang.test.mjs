// us-211: the DM screen shows SRD adversaries, environments and loot in the page language.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const cat = (l) => JSON.parse(readFileSync(new URL(`../../../src/lib/i18n/${l}.json`, import.meta.url), 'utf8'));
const CAT = { en: cat('en'), fr: cat('fr') };
const FR_ITEMS = JSON.parse(readFileSync(new URL('../../../src/lib/srd/fr/items.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body, lang = 'en') => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie: `lang=${lang}` }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const CH = { class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
async function setup() {
	const c = (await api('POST', '/api/campaigns', { name: 'Langcamp' })).json;
	await api('POST', `/api/campaigns/${c.id}/characters`, { ...CH, name: 'Alyndra' });
	const s = (await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Grovescene', environmentId: 'env_abandoned_grove' })).json;
	await api('PATCH', `/api/campaigns/${c.id}/scenes/${s.id}`, { status: 'current' });
	return { c, s };
}
async function open(path, lang) {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	return { ctx, p };
}
// lang of the nearest [lang] ancestor of each text node containing `text` under `root` (page root => null).
const langsOf = (root, text) => root.evaluate((el, text) => {
	const out = [];
	const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let n = w.nextNode(); n; n = w.nextNode()) {
		if (!n.textContent.includes(text)) continue;
		const l = n.parentElement.closest('[lang]');
		out.push(l && l !== document.documentElement && l !== document.body ? l.getAttribute('lang') : null);
	}
	return out;
}, text);
const norm = (s) => s.replace(/\s+/g, ' ');
const parseDamage = (d) => { const m = /^(\S+)\s+(phy|mag)/i.exec(d.trim()); assert.ok(m, `damage "${d}"`); return { dice: m[1], type: m[2].toLowerCase() === 'phy' ? 'PHYSICAL' : 'MAGICAL' }; };

async function withEncounter(seed = 5) {
	const { c, s } = await setup();
	const enc = await api('POST', `/api/campaigns/${c.id}/scenes/${s.id}/encounter`, { partySize: 3, tier: 1, seed });
	assert.equal(enc.status, 200, JSON.stringify(enc.json));
	return { c, s, enc: enc.json };
}
const cards = async (p, enc, scope) => {
	const loc = p.locator(`${scope} [data-testid=encounter-adversary]`);
	assert.ok((await loc.count()) >= enc.adversaries.length);
	return loc;
};

test('lang=en: adversary cards show English name, role, attack, damage dice and feature texts; damage type from the catalog', async () => {
	const { c, enc } = await withEncounter();
	const { ctx, p } = await open(`/campaigns/${c.id}?step=build`, 'en');
	const loc = await cards(p, enc, '[data-testid=scene]');
	for (const a of enc.adversaries) {
		const srd = (await api('GET', `/api/srd/adversaries/${a.id}`)).json;
		const card = loc.filter({ hasText: a.name }).first();
		const t = norm(await card.textContent());
		assert.ok(t.includes(a.name), 'name');
		assert.ok(t.toLowerCase().includes(CAT.en[`adversary.role.${srd.role}`].toLowerCase()), `role in "${t}"`);
		const d = parseDamage(srd.damage);
		assert.ok(t.includes(d.dice), `dice ${d.dice} in "${t}"`);
		assert.ok(/physical|magic/i.test(t), 'damage type word');
		assert.ok(!/\b(phy|mag)\b/.test(t), 'raw damage abbreviation not shown');
		for (const f of srd.feature) assert.ok(t.includes(norm(f.name)), `feature ${f.name}`);
	}
	await ctx.close();
});

test('lang=fr: role and damage type come from the catalog in lang="fr", dice unchanged', async () => {
	assert.equal(CAT.fr['adversary.role.Solo'], 'Solo');
	assert.equal(CAT.fr['adversary.role.Bruiser'], 'Cogneur');
	const { c, enc } = await withEncounter();
	for (const [url, scope] of [[`/campaigns/${c.id}?step=build`, '[data-testid=scene]'], [`/campaigns/${c.id}`, '[data-testid=current-scene]']]) {
		const { ctx, p } = await open(url, 'fr');
		const loc = await cards(p, enc, scope);
		for (const a of enc.adversaries) {
			const srd = (await api('GET', `/api/srd/adversaries/${a.id}`)).json;
			const card = loc.filter({ hasText: a.name }).first();
			const role = CAT.fr[`adversary.role.${srd.role}`];
			const l = await langsOf(card, role);
			assert.ok(l.includes('fr'), `${a.name}: role "${role}" in lang=fr: ${JSON.stringify(l)}`);
			const d = parseDamage(srd.damage);
			const type = CAT.fr[`damage.${d.type}`];
			assert.ok((await langsOf(card, type)).includes('fr'), `damage type "${type}" in lang=fr`);
			assert.ok(norm(await card.textContent()).includes(d.dice), `dice ${d.dice}`);
			assert.ok(!/\b(phy|mag)\b/.test(norm(await card.textContent())), 'no raw abbreviation');
		}
		await ctx.close();
	}
});

test('lang=fr: untranslated adversary name and features are in lang="en"', async () => {
	const { c, enc } = await withEncounter();
	for (const [url, scope] of [[`/campaigns/${c.id}?step=build`, '[data-testid=scene]'], [`/campaigns/${c.id}`, '[data-testid=current-scene]']]) {
		const { ctx, p } = await open(url, 'fr');
		const loc = await cards(p, enc, scope);
		for (const a of enc.adversaries) {
			const srd = (await api('GET', `/api/srd/adversaries/${a.id}`, undefined, 'fr')).json;
			const card = loc.filter({ hasText: a.name }).first();
			const n = await langsOf(card, srd.name);
			assert.ok(n.length > 0 && n.every((x) => x === 'en'), `name ${srd.name}: ${JSON.stringify(n)}`);
			assert.ok(srd.feature.length > 0);
			for (const f of srd.feature) {
				const fl = await langsOf(card, f.name);
				assert.ok(fl.length > 0 && fl.every((x) => x === 'en'), `feature ${f.name}: ${JSON.stringify(fl)}`);
			}
		}
		await ctx.close();
	}
});

test('lang=fr: environment type Exploration in lang="fr" in scene-environment (Build) and current-scene (Run)', async () => {
	assert.equal(CAT.fr['environment.type.Exploration'], 'Exploration');
	const { c } = await setup();
	const env = (await api('GET', '/api/srd/environments/env_abandoned_grove', undefined, 'fr')).json;
	for (const [url, scope] of [[`/campaigns/${c.id}?step=build`, '[data-testid=scene] [data-testid=scene-environment]'], [`/campaigns/${c.id}`, '[data-testid=current-scene]']]) {
		const { ctx, p } = await open(url, 'fr');
		const box = p.locator(scope).first();
		assert.equal(await box.count(), 1, scope);
		const l = await langsOf(box, 'Exploration');
		assert.ok(l.includes('fr'), `Exploration in lang=fr under ${scope}: ${JSON.stringify(l)}`);
		const n = await langsOf(box, env.name);
		assert.ok(n.length > 0 && n.every((x) => x === (env.nameLang ?? 'en') || x === 'en' || x === 'fr'), `env name has a lang: ${JSON.stringify(n)}`);
		assert.ok(n.every((x) => x !== null), 'env name carries its own lang');
		await ctx.close();
	}
});

test('encounter API: same seed gives the same adversaries, with English name and role', async () => {
	const { c, s } = await setup();
	const url = `/api/campaigns/${c.id}/scenes/${s.id}/encounter`;
	const body = { partySize: 4, tier: 2, seed: 42 };
	const a = await api('POST', url, body, 'fr');
	const b = await api('POST', url, body);
	assert.equal(a.status, 200);
	assert.deepEqual(a.json.adversaries, b.json.adversaries);
	for (const x of a.json.adversaries) {
		const srd = (await api('GET', `/api/srd/adversaries/${x.id}`, undefined, 'en')).json;
		assert.equal(x.name, srd.name);
		assert.equal(x.role, srd.role);
	}
});

test('loot: rolling and giving work; lang=fr loot-entry shows the item name with its lang', async () => {
	const { c, s } = await setup();
	for (let i = 0; i < 3; i++) {
		const r = await api('POST', `/api/campaigns/${c.id}/scenes/${s.id}/loot`, { table: 'items', rarity: 'common' });
		assert.ok(r.status < 300, JSON.stringify(r.json));
	}
	const stored = (await api('GET', `/api/campaigns/${c.id}/scenes`)).json.find((x) => x.id === s.id).loot;
	assert.equal(stored.length, 3);
	const { ctx, p } = await open(`/campaigns/${c.id}`, 'fr');
	const entries = p.locator('[data-testid=current-scene] [data-testid=loot-entry]');
	assert.equal(await entries.count(), 3);
	let checkedFr = 0;
	for (let i = 0; i < stored.length; i++) {
		const frName = FR_ITEMS[stored[i].srdId]?.name;
		const entry = entries.nth(i);
		const name = frName ?? (await api('GET', `/api/srd/items/${stored[i].srdId}`)).json.name;
		const l = await langsOf(entry, name);
		assert.ok(l.length > 0, `name ${name} shown`);
		assert.ok(l.every((x) => x === (frName ? 'fr' : 'en')), `${name}: ${JSON.stringify(l)}`);
		if (frName) checkedFr++;
	}
	assert.ok(checkedFr > 0 || stored.every((x) => !FR_ITEMS[x.srdId]), 'translated items were checked');
	await entries.first().getByRole('button', { name: /^donner$/i }).click();
	await p.waitForFunction(() => document.querySelector('[data-testid=current-scene] [data-testid=loot-entry]')?.getAttribute('data-given') === 'true');
	await ctx.close();
});
