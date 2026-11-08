// us-215: with lang=fr, tier 4 adversaries of a generated encounter show name and features in lang="fr".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body, lang = 'en') => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie: `lang=${lang}` }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
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

test('lang=fr: tier 4 encounter-adversary name and features are in lang="fr" on the DM screen (Build and Run)', async () => {
	const c = (await api('POST', '/api/campaigns', { name: 'Tier4camp' })).json;
	await api('POST', `/api/campaigns/${c.id}/characters`, { name: 'Alyndra', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 });
	const s = (await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Finale', environmentId: 'env_abandoned_grove' })).json;
	await api('PATCH', `/api/campaigns/${c.id}/scenes/${s.id}`, { status: 'current' });
	const enc = await api('POST', `/api/campaigns/${c.id}/scenes/${s.id}/encounter`, { partySize: 4, tier: 4, seed: 7 });
	assert.equal(enc.status, 200, JSON.stringify(enc.json));
	assert.ok(enc.json.adversaries.length > 0);
	for (const [url, scope] of [[`/campaigns/${c.id}?step=build`, '[data-testid=scene]'], [`/campaigns/${c.id}`, '[data-testid=current-scene]']]) {
		const ctx = await browser.newContext();
		await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
		const p = await ctx.newPage();
		p.setDefaultTimeout(8000);
		assert.equal((await p.goto(BASE + url)).status(), 200);
		const loc = p.locator(`${scope} [data-testid=encounter-adversary]`);
		assert.ok((await loc.count()) >= enc.json.adversaries.length);
		for (const a of enc.json.adversaries) {
			const srd = (await api('GET', `/api/srd/adversaries/${a.id}`, undefined, 'fr')).json;
			assert.equal(srd.nameLang ?? 'fr', 'fr');
			const card = loc.filter({ hasText: srd.name }).first();
			const n = await langsOf(card, srd.name);
			assert.ok(n.length > 0 && n.every((x) => x === 'fr'), `name ${srd.name}: ${JSON.stringify(n)}`);
			assert.ok(srd.feature.length > 0);
			for (const f of srd.feature) {
				const fl = await langsOf(card, f.name);
				assert.ok(fl.length > 0 && fl.every((x) => x === 'fr'), `feature ${f.name}: ${JSON.stringify(fl)}`);
			}
		}
		await ctx.close();
	}
});
