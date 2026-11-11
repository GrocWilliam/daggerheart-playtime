// us-222: French weapon and armor detail on the character sheet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const rd = (p) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));
const FRW = rd('src/lib/srd/fr/weapons.json');
const FRA = rd('src/lib/srd/fr/armors.json');
const ENW = rd('src/lib/srd/core/weapons.json');
const ENA = rd('src/lib/srd/core/armors.json');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const plain = (v) => (typeof v === 'string' ? v : v?.['en-US']);
const WID = 'core_weapon_broadsword';
const AID = 'core_armor_gambeson_armor';
const texts = (fr) => (fr.features ?? []).flatMap((f) => [plain(f.name), ...(f.description ?? []).map((d) => plain(d.paragraph))]).filter(Boolean).map(norm);
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status}`);
	return r.json();
};
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

test('fr character sheet: primary-weapon and equipped-armor show name and feature texts in lang="fr" elements', async () => {
	assert.ok(ENW.some((e) => e.id === WID) && ENA.some((e) => e.id === AID));
	const camp = (await api('POST', '/api/campaigns', { name: 'Gear Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, { name: 'Ivo', class: 'Warrior', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, armorSlots: 3 })).id;
	await api('PATCH', `/api/characters/${ch}`, { primaryWeapon: WID, armorId: AID });
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	assert.equal((await p.goto(`${BASE}/characters/${ch}?tab=gear`)).status(), 200);
	for (const [testid, id, FR] of [['primary-weapon', WID, FRW], ['equipped-armor', AID, FRA]]) {
		const box = p.locator(`[data-testid="${testid}"]`);
		assert.equal(await box.count(), 1);
		okFr(await langsOf(box, norm(FR[id].name)), `${testid} name`);
		const ts = texts(FR[id]);
		assert.ok(ts.length >= 2, 'feature texts');
		for (const t of ts) okFr(await langsOf(box, t), `${testid} text ${t}`);
	}
	await ctx.close();
});
