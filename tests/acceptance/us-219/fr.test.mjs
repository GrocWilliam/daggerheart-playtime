// us-219: French VALOR card on the character sheet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const CARD = 'core_domain_card_armorer';
const FR = JSON.parse(readFileSync(new URL('../../../src/lib/srd/fr/domain-cards.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};

test('fr character sheet with a VALOR card shows its name and text in lang="fr" elements', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Valor Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Vala', class: 'Warrior', level: 5, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3
	})).id;
	await api('POST', `/api/characters/${ch}/cards`, { cardId: CARD });
	const frName = FR[CARD].name;
	const para = FR[CARD].features[0].description[0].paragraph;
	assert.ok(para && para !== 'undefined');
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	assert.equal((await p.goto(`${BASE}/characters/${ch}`)).status(), 200);
	const card = p.locator('[data-testid="card"]').filter({ hasText: frName });
	assert.equal(await card.count(), 1);
	const langs = (text) => card.evaluate((el, text) => {
		const out = [];
		const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			if (!n.textContent.replace(/\s+/g, ' ').includes(text)) continue;
			const l = n.parentElement.closest('[lang]');
			out.push({ lang: l?.getAttribute('lang') ?? null, page: !l || l === document.documentElement || l === document.body });
		}
		return out;
	}, text);
	const nl = await langs(frName);
	assert.ok(nl.length && nl.every((x) => !x.page && x.lang === 'fr'), 'name ' + JSON.stringify(nl));
	// text: the help <details> is closed; textContent is still in the DOM
	const tl = await langs(para.replace(/\s+/g, ' '));
	assert.ok(tl.length > 0 && tl.every((x) => !x.page && x.lang === 'fr'), 'text ' + JSON.stringify(tl));
	await ctx.close();
});
