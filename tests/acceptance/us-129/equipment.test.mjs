import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const W = json('src/lib/srd/core/weapons.json');
const A = json('src/lib/srd/core/armors.json');
// French names from the overlay files: id -> name, one per `name` entry of src/lib/srd/fr/*.json
const FR = Object.assign({}, ...fs.readdirSync('src/lib/srd/fr').filter((f) => f.endsWith('.json')).map((f) =>
	Object.fromEntries(Object.entries(json(`src/lib/srd/fr/${f}`)).filter(([, e]) => e && 'name' in e).map(([id, e]) => [id, e.name]))));
const FRUI = json('src/lib/i18n/fr.json');
const en = (e) => e.name['en-US'];
const PRIMARY = W.filter((w) => w.type === 'PRIMARY_PHYSICAL' || w.type === 'PRIMARY_MAGIC');
const SECONDARY = W.filter((w) => w.type === 'SECONDARY');
const TIER = (l) => (l === 1 ? 1 : l <= 4 ? 2 : l <= 7 ? 3 : 4);
const paras = (d) => (d ?? []).map((x) => x.paragraph?.['en-US']).filter(Boolean);

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
async function mk(over = {}) {
	const camp = (await api('POST', '/api/campaigns', { name: 'Equipment' })).json.id;
	const r = await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Rook', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 6, ...over });
	assert.equal(r.status, 201, JSON.stringify(r.json));
	return r.json.id;
}
async function open(lang, id) {
	const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1000, height: 900 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	await page.goto(`${BASE}/characters/${id}?tab=gear`);
	return { ctx, page };
}
const sel = (page, name) => page.locator(`select[name="${name}"]`);
const formOf = (page, name) => page.locator(`form:has(select[name="${name}"])`);
const opts = (s) => s.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent.trim(), selected: o.selected })));
async function choose(page, name, value) {
	await sel(page, name).selectOption(value);
	await Promise.all([page.waitForNavigation(), formOf(page, name).locator('button[type=submit]').click()]);
	await page.goto(new URL('?tab=gear', page.url()).href); // us-305: equipment lives on the gear tab
}
const tab = (page, k) => page.goto(new URL(`?tab=${k}`, page.url()).href);
const text = async (page, tid) => (await page.getByTestId(tid).innerText()).replace(/\s+/g, ' ');

test('level 1 primary dropdown: None first, no tier 2+ option; secondary and armor likewise', async () => {
	const id = await mk();
	const { ctx, page } = await open('en', id);
	for (const [name, list] of [['primaryWeapon', PRIMARY], ['secondaryWeapon', SECONDARY], ['armorId', A]]) {
		assert.equal(await sel(page, name).count(), 1, name);
		const o = await opts(sel(page, name));
		assert.equal(o[0].value, '', `${name}: None first`);
		const got = o.slice(1).map((x) => x.value).sort();
		assert.deepEqual(got, list.filter((e) => e.tier === 1).map((e) => e.id).sort(), name);
		assert.ok(!got.some((v) => list.find((e) => e.id === v).tier >= 2));
	}
	// types are not mixed: no secondary in the primary list
	const p = (await opts(sel(page, 'primaryWeapon'))).map((x) => x.value);
	assert.ok(!p.includes('core_weapon_shortsword'));
	await ctx.close();
});

test('level 2 lists include tier 2 options grouped under tier labels', async () => {
	const id = await mk({ level: 2 });
	const { ctx, page } = await open('en', id);
	for (const [name, list] of [['primaryWeapon', PRIMARY], ['secondaryWeapon', SECONDARY], ['armorId', A]]) {
		const s = sel(page, name);
		const o = await opts(s);
		assert.equal(o[0].value, '');
		assert.deepEqual(o.slice(1).map((x) => x.value).sort(), list.filter((e) => e.tier <= 2).map((e) => e.id).sort(), name);
		const groups = await s.locator('optgroup').evaluateAll((gs) => gs.map((g) => ({ label: g.label, values: [...g.querySelectorAll('option')].map((o) => o.value) })));
		assert.equal(groups.length, 2, name);
		groups.forEach((g, i) => {
			assert.ok(g.label.includes(String(i + 1)), `${name}: label "${g.label}" has tier ${i + 1}`);
			for (const v of g.values) assert.equal(list.find((e) => e.id === v).tier, i + 1, `${name} ${v}`);
		});
	}
	await ctx.close();
});

test('tier follows the level: level 5 shows tiers 1-3, not 4', async () => {
	const id = await mk({ level: 5 });
	const { ctx, page } = await open('en', id);
	const o = (await opts(sel(page, 'armorId'))).slice(1).map((x) => x.value);
	assert.deepEqual(o.sort(), A.filter((e) => e.tier <= TIER(5)).map((e) => e.id).sort());
	await ctx.close();
});

test('choosing a weapon shows its details; choosing None clears them', async () => {
	const id = await mk();
	const w = W.find((x) => x.id === 'core_weapon_broadsword');
	let { ctx, page } = await open('en', id);
	await choose(page, 'primaryWeapon', w.id);
	assert.equal((await api('GET', `/api/characters/${id}`)).json.primaryWeapon, w.id);
	assert.equal((await opts(sel(page, 'primaryWeapon'))).find((o) => o.selected).value, w.id);
	const t = await text(page, 'primary-weapon');
	assert.match(t, new RegExp(en(w)));
	assert.match(t, /agility/i);
	assert.match(t, /melee/i);
	assert.match(t, /d8/i);
	assert.match(t, /physical/i);
	assert.match(t, /one.?handed/i);
	for (const f of w.features) {
		assert.ok(t.includes(en(f)), 'feature name');
		assert.ok(t.includes(paras(f.description)[0]), 'feature text');
	}
	assert.doesNotMatch(t, /ONE_HANDED|PRIMARY_|AGILITY/);
	await choose(page, 'primaryWeapon', '');
	assert.equal((await api('GET', `/api/characters/${id}`)).json.primaryWeapon, null);
	const gone = page.getByTestId('primary-weapon');
	if (await gone.count()) assert.ok(!(await gone.innerText()).includes(en(w)));
	await ctx.close();

	// secondary weapon
	const s = SECONDARY.find((x) => x.id === 'core_weapon_round_shield');
	({ ctx, page } = await open('en', id));
	await choose(page, 'secondaryWeapon', s.id);
	const st = await text(page, 'secondary-weapon');
	assert.ok(st.includes(en(s)));
	assert.match(st, new RegExp(s.damage.dice, 'i'));
	await choose(page, 'secondaryWeapon', '');
	const g2 = page.getByTestId('secondary-weapon');
	if (await g2.count()) assert.ok(!(await g2.innerText()).includes(en(s)));
	await ctx.close();
});

test('choosing armor updates Armor max and thresholds to the API values; details show in equipped-armor', async () => {
	const id = await mk();
	const { ctx, page } = await open('en', id);
	await choose(page, 'armorId', 'core_armor_gambeson_armor');
	const g = (await api('GET', `/api/characters/${id}`)).json;
	assert.equal(g.armorId, 'core_armor_gambeson_armor');
	await tab(page, 'play');
	assert.equal(await text(page, 'armor'), `${g.armor.marked}/${g.armor.max}`);
	assert.equal(g.armor.max, 3);
	assert.equal(await text(page, 'thresholds'), `${g.majorThreshold}/${g.severeThreshold}`);
	assert.equal(g.majorThreshold, 6);
	const a = A.find((x) => x.id === 'core_armor_gambeson_armor');
	await tab(page, 'gear');
	const t = await text(page, 'equipped-armor');
	assert.ok(t.includes(en(a)));
	assert.ok(t.includes(`${a.baseMajorThreshold}`) && t.includes(`${a.baseSevereThreshold}`) && t.includes(`${a.baseScore}`));
	for (const f of a.features) {
		assert.ok(t.includes(en(f)));
		assert.ok(t.includes(paras(f.description)[0]));
	}
	await tab(page, 'play');
	assert.equal(await page.getByTestId('armor').count(), 1, 'tracker testid unchanged');
	await ctx.close();
});

test('a two-handed primary hides the secondary dropdown and shows the note; one-handed keeps it', async () => {
	const id = await mk();
	let { ctx, page } = await open('en', id);
	assert.equal(await sel(page, 'secondaryWeapon').count(), 1);
	assert.equal(await page.getByTestId('secondary-blocked').count(), 0);
	await choose(page, 'primaryWeapon', 'core_weapon_longsword');
	assert.equal(await sel(page, 'secondaryWeapon').count(), 0);
	const note = page.getByTestId('secondary-blocked');
	assert.equal(await note.count(), 1);
	assert.ok(await note.isVisible());
	assert.ok((await note.innerText()).trim().length > 3);
	assert.equal(await sel(page, 'primaryWeapon').count(), 1);
	await choose(page, 'primaryWeapon', 'core_weapon_broadsword');
	assert.equal(await sel(page, 'secondaryWeapon').count(), 1);
	assert.equal(await page.getByTestId('secondary-blocked').count(), 0);
	await ctx.close();
});

test('a rejected save shows a translated error from the existing keys', async () => {
	const id = await mk();
	const { ctx, page } = await open('en', id);
	// force an option the API rejects (tier 2 gear on a level 1 character)
	await sel(page, 'armorId').evaluate((s) => { const o = document.createElement('option'); o.value = 'core_armor_improved_gambeson_armor'; o.textContent = 'x'; s.appendChild(o); });
	await sel(page, 'armorId').selectOption('core_armor_improved_gambeson_armor');
	await Promise.all([page.waitForNavigation(), formOf(page, 'armorId').locator('button[type=submit]').click()]);
	const alert = await page.locator('[role=alert]').first().innerText();
	assert.equal(alert.trim(), json('src/lib/i18n/en.json')['error.invalid']);
	assert.equal((await api('GET', `/api/characters/${id}`)).json.armorId, null);
	await ctx.close();
});

test('in French the labels, names and details are translated', async () => {
	const id = await mk({ level: 2 });
	const w = W.find((x) => x.id === 'core_weapon_broadsword');
	const { ctx, page } = await open('fr', id);
	const o = await opts(sel(page, 'primaryWeapon'));
	assert.equal(o[0].value, '');
	assert.notEqual(o[0].label.toLowerCase(), 'none');
	const labels = o.map((x) => x.label);
	assert.ok(labels.includes(FR[w.id]), 'French weapon name');
	assert.ok(!labels.includes(en(w)) || FR[w.id] === en(w));
	const groups = await sel(page, 'primaryWeapon').locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label));
	assert.ok(groups.length === 2 && groups.every((l, i) => l.includes(String(i + 1))));
	assert.ok(!groups.some((l) => /\btier\b/i.test(l)), 'tier label translated');
	await choose(page, 'primaryWeapon', w.id);
	const t = await text(page, 'primary-weapon');
	assert.ok(t.includes(FR[w.id]));
	assert.ok(t.includes(FRUI['trait.agility']));
	assert.ok(/m[êe]l[ée]e/i.test(t) && !/\bmelee\b/i.test(t), 'range translated');
	assert.match(t, /physique/i);
	assert.doesNotMatch(t, /one.?handed|\bphysical\b|MELEE|ONE_HANDED/i);
	await choose(page, 'armorId', 'core_armor_gambeson_armor');
	const at = await text(page, 'equipped-armor');
	assert.ok(at.includes(FR.core_armor_gambeson_armor));
	await choose(page, 'primaryWeapon', 'core_weapon_longsword');
	assert.equal(await sel(page, 'secondaryWeapon').count(), 0);
	const note = await text(page, 'secondary-blocked');
	assert.ok(note.length > 3 && note !== (json('src/lib/i18n/en.json')['equipment.secondaryBlocked'] ?? '\0'));
	assert.doesNotMatch(note, /two-handed|hand free|secondary weapon/i);
	await ctx.close();
});
