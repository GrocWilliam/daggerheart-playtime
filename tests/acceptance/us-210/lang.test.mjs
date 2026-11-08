// us-210 browser tests: per-line `lang` on SRD names and help lines (reference, character sheet, tunnel).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const FR = JSON.parse(readFileSync(new URL('../../../src/lib/i18n/fr.json', import.meta.url), 'utf8'));
let browser;

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${await r.clone().text()}`);
	return r.json();
};
const srdName = async (kind, id, lang) => {
	const list = await (await fetch(`${BASE}/api/srd/${kind}`, { headers: { cookie: `lang=${lang}` } })).json();
	const e = list.find((x) => x.id === id);
	assert.ok(e, `${kind} ${id} listed`);
	return e.name;
};
async function open(lang, path) {
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	return { ctx, p };
}

// For each text node under `root` containing `text`: the lang of its nearest [lang] ancestor, and whether that
// ancestor is the page root (html/body) rather than an element on the content itself.
const langsOf = (root, text) =>
	root.evaluate((el, text) => {
		const out = [];
		const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			if (!n.textContent.includes(text)) continue;
			const l = n.parentElement.closest('[lang]');
			out.push({ lang: l?.getAttribute('lang') ?? null, page: !l || l === document.documentElement || l === document.body });
		}
		return out;
	}, text);

// Help lines: innermost elements with a lang attribute inside the help's content (not its summary), excluding the
// element's name. Returns [{ lang, text }] in document order.
const helpLinesOf = (details, name) =>
	details.evaluate((d, name) => {
		const els = [...d.querySelectorAll('[lang]')].filter((e) => !e.closest('summary') && !e.querySelector('[lang]'));
		return els.map((e) => ({ lang: e.getAttribute('lang'), text: e.textContent.trim() })).filter((l) => l.text !== name && l.text !== '');
	}, name);

async function refHelp(lang, kind, id, q) {
	const { ctx, p } = await open(lang, `/reference?kind=${kind}&q=${encodeURIComponent(q)}`);
	const details = p.locator(`[data-testid="ref-${kind}"] [data-testid="ref-item"] details[data-testid="help"][data-help="${id}"]`);
	assert.equal(await details.count(), 1, `${id} help on /reference`);
	const lines = await helpLinesOf(details, await srdName(kind, id, lang));
	assert.ok(lines.length > 0, `${id}: help has lines with a lang attribute`);
	return { ctx, p, details, lines };
}

before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => {
	await browser?.close();
});

test('French reference: core_class_bard shows Barde with lang="fr", its translated description with lang="fr"', async () => {
	const { ctx, p } = await open('fr', '/reference?q=Barde');
	const item = p.locator('[data-testid="ref-classes"] [data-testid="ref-item"]').filter({ has: p.locator('details[data-help="core_class_bard"]') });
	assert.equal(await item.count(), 1, 'one ref-item for core_class_bard');
	const name = await langsOf(item, 'Barde');
	assert.ok(name.some((x) => !x.page && x.lang === 'fr'), `Barde inside an element with lang="fr": ${JSON.stringify(name)}`);
	const desc = await langsOf(item, 'Les bardes sont les êtres les plus charismatiques');
	assert.ok(desc.length > 0, 'description line shown');
	for (const d of desc) assert.ok(!d.page && d.lang === 'fr', `description inside lang="fr": ${JSON.stringify(desc)}`);
	await ctx.close();
});

test('weapon core_weapon_broadsword help: first line lang="fr" with Mêlée in French, lang="en" with Melee in English', async () => {
	for (const [lang, word] of [['fr', 'Mêlée'], ['en', 'Melee']]) {
		const { ctx, lines } = await refHelp(lang, 'weapons', 'core_weapon_broadsword', 'Broadsword');
		assert.equal(lines[0].lang, lang, `${lang}: first line lang ${JSON.stringify(lines[0])}`);
		assert.ok(lines[0].text.includes(word), `${lang}: first line "${lines[0].text}" contains ${word}`);
		await ctx.close();
	}
});

test('armor help facts line: seuils and score (fr), thresholds and score (en)', async () => {
	for (const [lang, words] of [['fr', ['seuils', 'score']], ['en', ['thresholds', 'score']]]) {
		const { ctx, lines } = await refHelp(lang, 'armors', 'core_armor_gambeson_armor', 'Gambeson');
		assert.equal(lines[0].lang, lang, `${lang}: ${JSON.stringify(lines[0])}`);
		for (const w of words) assert.ok(lines[0].text.includes(w), `${lang}: "${lines[0].text}" contains ${w}`);
		await ctx.close();
	}
});

test('domain card help facts line: niveau and coût de rappel (fr), level and recall cost (en)', async () => {
	for (const [lang, words] of [['fr', ['niveau', 'coût de rappel']], ['en', ['level', 'recall cost']]]) {
		const { ctx, lines } = await refHelp(lang, 'domain-cards', 'core_domain_card_a_soldiers_bond', "A Soldier's Bond");
		assert.equal(lines[0].lang, lang, `${lang}: ${JSON.stringify(lines[0])}`);
		for (const w of words) assert.ok(lines[0].text.includes(w), `${lang}: "${lines[0].text}" contains ${w}`);
		await ctx.close();
	}
});

test('French adversary adv_acid_burrower help: no raw key, facts line lang="fr" with the role label Solo', async () => {
	const { ctx, details, lines } = await refHelp('fr', 'adversaries', 'adv_acid_burrower', await srdName('adversaries', 'adv_acid_burrower', 'fr'));
	const all = await details.evaluate((d) => d.textContent);
	assert.doesNotMatch(all, /motives_and_tactics\s*:/);
	assert.doesNotMatch(all, /\b[a-z]+(_[a-z]+)+\s*:/, 'no snake_case key followed by a colon');
	assert.doesNotMatch(all, /\b(difficulty|thresholds)\s*:/, 'no raw English key');
	const role = FR['adversary.role.Solo'];
	assert.equal(role, 'Solo', 'fr adversary.role.Solo');
	const facts = lines.find((l) => l.text.includes(FR['srd.field.difficulty'] ?? '\u0000'));
	assert.ok(facts, `a facts line with the srd.field.difficulty label: ${JSON.stringify(lines)}`);
	assert.equal(facts.lang, 'fr');
	assert.ok(facts.text.includes(role), `facts line "${facts.text}" shows ${role}`);
	assert.equal(lines[0], facts, 'the facts line comes first');
	await ctx.close();
});

test('French character sheet: Chosen, domain card and equipment names carry lang="fr"', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Lang Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Lina', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3,
		ancestry: 'core_ancestry_dwarf', community: 'core_community_highborne'
	})).id;
	await api('PATCH', `/api/characters/${ch}`, { subclass: 'core_subclass_beastbound', primaryWeapon: 'core_weapon_broadsword', armorId: 'core_armor_gambeson_armor' });
	await api('POST', `/api/characters/${ch}/cards`, { cardId: 'core_domain_card_a_soldiers_bond' });
	const expected = [
		['subclass', 'subclasses', 'core_subclass_beastbound'],
		['ancestry', 'ancestries', 'core_ancestry_dwarf'],
		['community', 'communities', 'core_community_highborne'],
		['card', 'domain-cards', 'core_domain_card_a_soldiers_bond'],
		['primary-weapon', 'weapons', 'core_weapon_broadsword'],
		['equipped-armor', 'armors', 'core_armor_gambeson_armor']
	];
	const { ctx, p } = await open('fr', `/characters/${ch}`);
	for (const [testid, kind, id] of expected) {
		const fr = await srdName(kind, id, 'fr');
		assert.notEqual(fr, await srdName(kind, id, 'en'), `${id} has a French name`);
		const el = p.locator(`[data-testid="${testid}"]`).filter({ hasText: fr });
		assert.equal(await el.count(), 1, `${testid} shows ${fr}`);
		const ls = await langsOf(el, fr);
		assert.ok(ls.some((x) => !x.page && x.lang === 'fr'), `${testid}: ${fr} carries lang="fr" (${JSON.stringify(ls)})`);
	}
	await ctx.close();
});

test('French tunnel: the class select posts the English value Bard and creating the character succeeds', async () => {
	const camp = (await api('POST', '/api/campaigns', { name: 'Tunnel Camp' })).id;
	const { ctx, p } = await open('fr', `/campaigns/${camp}/characters/new`);
	await p.locator('input[name="name"]').fill('Brin');
	const cls = p.locator('select[name="class"]');
	await cls.selectOption({ label: 'Barde' });
	assert.equal(await cls.inputValue(), 'Bard');
	await Promise.all([p.waitForURL(/step=2/), p.getByTestId('tunnel-next').click()]);
	assert.equal(new URL(p.url()).searchParams.get('class'), 'Bard');
	await Promise.all([p.waitForURL(/step=3/), p.getByTestId('tunnel-next').click()]);
	for (const [f, v] of [['evasion', '10'], ['majorThreshold', '5'], ['severeThreshold', '10'], ['maxHp', '5'], ['maxStress', '6'], ['armorSlots', '3']]) {
		await p.locator(`input[name="${f}"]`).fill(v);
	}
	await Promise.all([p.waitForURL(/step=4/), p.getByTestId('tunnel-next').click()]);
	await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), p.getByTestId('tunnel-create').click()]);
	const id = new URL(p.url()).pathname.split('/').pop();
	const c = await api('GET', `/api/characters/${id}`);
	assert.equal(c.class, 'Bard');
	assert.equal(c.name, 'Brin');
	await ctx.close();
});
