import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const CARDS = json('src/lib/srd/core/domain-cards.json');
const CLASSES = json('src/lib/srd/core/classes.json');
// French names from the overlay files: id -> name, one per `name` entry of src/lib/srd/fr/*.json
const FRCARDS = json('src/lib/srd/fr/domain-cards.json');
// Lines as shown in the given language: the French overlay where the card is translated, else English.
const linesIn = (c, lang) => {
	const fr = lang === 'fr' ? FRCARDS[c.id] : undefined;
	if (!fr?.features) return { lang: 'en', ls: lines(c) };
	const ls = fr.features.flatMap((f) => {
		const ps = (f.description ?? []).map((x) => x.paragraph).filter(Boolean);
		return f.name ? [`${f.name}: ${ps[0] ?? ''}`.trim(), ...ps.slice(1)] : ps;
	});
	return { lang: 'fr', ls };
};
const FR = Object.assign({}, ...fs.readdirSync('src/lib/srd/fr').filter((f) => f.endsWith('.json')).map((f) =>
	Object.fromEntries(Object.entries(json(`src/lib/srd/fr/${f}`)).filter(([, e]) => e && 'name' in e).map(([id, e]) => [id, e.name]))));
const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const cardEn = (c) => c.name['en-US'];
const cardName = (c, lang) => (lang === 'fr' ? (FR[c.id] ?? cardEn(c)) : cardEn(c));
const domName = (d, lang) => (lang === 'fr' ? FR[`core_domain_${d.toLowerCase()}`] : cap(d));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const paras = (d) => (d ?? []).map((x) => x.paragraph?.['en-US']).filter(Boolean);
const lines = (c) => c.features.flatMap((f) => {
	const ps = paras(f.description);
	return f.name ? [`${f.name['en-US']}: ${ps[0] ?? ''}`.trim(), ...ps.slice(1)] : ps;
});

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
async function mk(cls = 'Ranger', cards = []) {
	const camp = await api('POST', '/api/campaigns', { name: 'Cards' });
	const r = await api('POST', `/api/campaigns/${camp.json.id}/characters`, {
		name: 'Rook', class: cls, level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	assert.equal(r.status, 201);
	for (const c of cards) assert.equal((await api('POST', `/api/characters/${r.json.id}/cards`, { cardId: c.id })).status, 201);
	return r.json.id;
}
const held = async (id) => (await api('GET', `/api/characters/${id}`)).json.cards;
async function open(lang, path, { js = false, viewport } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: viewport ?? { width: 1000, height: 900 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	await page.goto(BASE + path);
	return { ctx, page };
}
// The add form is the one holding the select grouped by domain.
const addSelect = (page) => page.locator('select[name="cardId"]:has(optgroup)');
const addForm = (page) => page.locator('form:has(select[name="cardId"]:has(optgroup))');
const pick = [CARDS[7], CARDS[100], CARDS[150]];

test('no card held: the sheet lists no card', async () => {
	const id = await mk();
	const { ctx, page } = await open('en', `/characters/${id}`);
	assert.equal(await page.locator('[data-testid="card"]').count(), 0);
	await ctx.close();
});

test('held cards are listed in the order added, each with name, domain and level (en + fr)', async () => {
	const id = await mk('Ranger', pick);
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`);
		const cards = page.locator('[data-testid="card"]');
		assert.equal(await cards.count(), 3);
		for (let i = 0; i < 3; i++) {
			const t = norm(await cards.nth(i).textContent());
			assert.ok(t.includes(cardName(pick[i], lang)), `${lang} name ${cardName(pick[i], lang)} in "${t}"`);
			assert.ok(t.includes(domName(pick[i].domain, lang)), `${lang} domain in "${t}"`);
			assert.ok(new RegExp(`(^|\\D)${pick[i].level}(\\D|$)`).test(t), `${lang} level ${pick[i].level} in "${t}"`);
		}
		await ctx.close();
	}
});

test('each held card has a helper named after it (en + fr)', async () => {
	const id = await mk('Ranger', pick);
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`);
		for (let i = 0; i < 3; i++) {
			const card = page.locator('[data-testid="card"]').nth(i);
			const h = card.locator(`details[data-testid="help"][data-help="${pick[i].id}"]`);
			assert.equal(await h.count(), 1, `${lang} helper of ${pick[i].id}`);
			const sm = h.locator('> summary');
			assert.equal(norm(await sm.textContent()), '?');
			assert.equal(await sm.getAttribute('aria-label'), `${lang === 'fr' ? 'Aide : ' : 'Help: '}${cardName(pick[i], lang)}`);
		}
		await ctx.close();
	}
});

test('opened card helper: 44x44 target, name, SRD text in a lang="en" block, without JavaScript', async () => {
	const id = await mk('Ranger', pick);
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`, { js: false });
		for (const c of pick) {
			const h = page.locator(`[data-testid="card"] details[data-testid="help"][data-help="${c.id}"]`);
			const box = await h.locator('> summary').boundingBox();
			assert.ok(box.width >= 44 && box.height >= 44, `${c.id} target ${box.width}x${box.height}`);
			assert.equal(await h.evaluate((d) => d.open), false);
			await h.locator('> summary').click();
			assert.equal(await h.evaluate((d) => d.open), true);
			assert.ok(norm(await h.textContent()).includes(cardName(c, lang)));
			const exp = linesIn(c, lang);
			const en = h.locator(`[lang="${exp.lang}"]`);
			assert.ok((await en.count()) >= 1, `lang=${exp.lang} block`);
			const txt = norm((await en.allTextContents()).join(' '));
			const ls = exp.ls;
			assert.ok(ls.length > 0);
			for (const l of ls) assert.ok(txt.includes(norm(l)), `${c.id}: ${l.slice(0, 50)}`);
			await h.locator('> summary').click();
			assert.equal(await h.evaluate((d) => d.open), false);
		}
		await ctx.close();
	}
});

test('add form: select of the 189 cards grouped by domain, the class\'s two domains first (every class, en + fr)', async () => {
	assert.equal(CARDS.length, 189);
	for (const lang of ['en', 'fr']) {
		for (const cl of CLASSES) {
			const clsName = cap(cl.name);
			const id = await mk(clsName);
			const { ctx, page } = await open(lang, `/characters/${id}`);
			const sel = addSelect(page);
			assert.equal(await sel.count(), 1, `${clsName}: one grouped select`);
			const groups = await sel.locator('optgroup').evaluateAll((gs) =>
				gs.map((g) => ({ label: g.label, opts: [...g.querySelectorAll('option')].map((o) => [o.value, o.textContent.trim()]) })));
			assert.equal(groups.length, 9);
			const want = [...cl.domains, ...[...new Set(CARDS.map((c) => c.domain))].filter((d) => !cl.domains.includes(d))];
			assert.deepEqual(groups.slice(0, 2).map((g) => g.label), cl.domains.map((d) => domName(d, lang)), `${clsName} ${lang} first domains`);
			assert.deepEqual(groups.map((g) => g.label).sort(), want.map((d) => domName(d, lang)).sort());
			let total = 0;
			for (const g of groups) {
				const d = want.find((x) => domName(x, lang) === g.label);
				const exp = CARDS.filter((c) => c.domain === d);
				assert.deepEqual(g.opts.map((o) => o[0]).sort(), exp.map((c) => c.id).sort(), `${g.label} values`);
				for (const [v, label] of g.opts) assert.equal(label, cardName(CARDS.find((c) => c.id === v), lang));
				total += g.opts.length;
			}
			assert.equal(total, 189);
			await ctx.close();
		}
	}
});

test('submitting the add form holds the card: on the sheet with its helper, and in the API', async () => {
	const id = await mk('Wizard');
	const c = CARDS.find((x) => x.domain === 'CODEX');
	const { ctx, page } = await open('en', `/characters/${id}?new=card`); // the add form lives in a modal (us-195)
	await addSelect(page).selectOption(c.id);
	await Promise.all([page.waitForNavigation(), addForm(page).locator('button[type="submit"]').click()]);
	assert.deepEqual(await held(id), [c.id]);
	const card = page.locator('[data-testid="card"]');
	assert.equal(await card.count(), 1);
	assert.ok(norm(await card.textContent()).includes(cardEn(c)));
	assert.equal(await card.locator(`details[data-help="${c.id}"]`).count(), 1);
	await ctx.close();
});

test('the remove control of a card removes it from the sheet and the API', async () => {
	const id = await mk('Ranger', pick);
	const { ctx, page } = await open('en', `/characters/${id}`);
	const second = page.locator('[data-testid="card"]').nth(1);
	await Promise.all([page.waitForNavigation(), second.locator('button:not(summary)').first().click()]);
	assert.deepEqual(await held(id), [pick[0].id, pick[2].id]);
	const cards = page.locator('[data-testid="card"]');
	assert.equal(await cards.count(), 2);
	const t = norm(await page.locator('[data-testid="card"]').allTextContents().then((a) => a.join(' ')));
	assert.ok(!t.includes(cardEn(pick[1])));
	assert.ok(t.includes(cardEn(pick[0])) && t.includes(cardEn(pick[2])));
	await ctx.close();
});

test('375px wide: no horizontal overflow with cards held, remove controls are 44x44', async () => {
	const id = await mk('Ranger', pick);
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`, { viewport: { width: 375, height: 800 } });
		const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(over <= 0, `overflow ${over}px`);
		const cards = page.locator('[data-testid="card"]');
		for (let i = 0; i < 3; i++) {
			const b = await cards.nth(i).locator('button:not(summary)').first().boundingBox();
			assert.ok(b.width >= 44 && b.height >= 44, `remove ${b.width}x${b.height}`);
		}
		await ctx.close();
	}
});
