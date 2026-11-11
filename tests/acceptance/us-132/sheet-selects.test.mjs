import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const core = (f) => json(`src/lib/srd/core/${f}.json`);
// French names from the overlay files: id -> name, one per `name` entry of src/lib/srd/fr/*.json
const FR = Object.assign({}, ...fs.readdirSync('src/lib/srd/fr').filter((f) => f.endsWith('.json')).map((f) =>
	Object.fromEntries(Object.entries(json(`src/lib/srd/fr/${f}`)).filter(([, e]) => e && 'name' in e).map(([id, e]) => [id, e.name]))));
const SUBS = core('subclasses'), ANCS = core('ancestries'), COMS = core('communities'), CLASSES = core('classes');
const enName = (e) => (typeof e.name === 'string' ? e.name.charAt(0) + e.name.slice(1).toLowerCase() : e.name['en-US']);
const nameIn = (e, lang) => (lang === 'fr' ? (FR[e.id] ?? enName(e)) : enName(e));

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
async function mk(over = {}) {
	const camp = (await api('POST', '/api/campaigns', { name: 'Sheet selects' })).json.id;
	const r = await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Rook', class: 'Wizard', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3, ...over });
	assert.equal(r.status, 201, JSON.stringify(r.json));
	return r.json.id;
}
async function open(lang, id) {
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/characters/${id}?new=edit`);
	return { ctx, page };
}
const edit = (page) => page.locator('form[action="?/edit"]');
const opts = (sel) => sel.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent.trim(), selected: o.selected })));

test('class, subclass, ancestry and community are selects with SRD options; French labels, stable values', async () => {
	const id = await mk();
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, id);
		const f = edit(page);
		for (const n of ['class', 'subclass', 'ancestry', 'community']) {
			assert.equal(await f.locator(`input[name=${n}]`).count(), 0, `${n} not a text input`);
			assert.equal(await f.locator(`select[name=${n}]`).count(), 1, `${n} select`);
		}
		const cls = await opts(f.locator('select[name=class]'));
		for (const c of CLASSES) assert.equal(cls.find((o) => o.value === enName(c))?.label, nameIn(c, lang));
		for (const [n, list] of [['ancestry', ANCS], ['community', COMS]]) {
			const os = await opts(f.locator(`select[name=${n}]`));
			assert.equal(os[0].value, '', `${n}: None first`);
			assert.equal(os.length, list.length + 1);
			for (const e of list) assert.equal(os.find((o) => o.value === e.id)?.label, nameIn(e, lang), `${lang} ${n} ${e.id}`);
		}
		await ctx.close();
	}
});

test('for a Wizard the subclass select lists only the Wizard subclasses', async () => {
	const id = await mk({ class: 'Wizard' });
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, id);
		const os = (await opts(edit(page).locator('select[name=subclass]'))).filter((o) => o.value);
		const want = SUBS.filter((s) => s.class === 'WIZARD');
		assert.ok(want.length > 0);
		assert.deepEqual(os.map((o) => o.value).sort(), want.map((s) => s.id).sort());
		for (const s of want) assert.equal(os.find((o) => o.value === s.id).label, nameIn(s, lang));
		await ctx.close();
	}
});

test('choosing another class, saving and reloading shows the new class and its subclasses', async () => {
	const id = await mk({ class: 'Wizard' });
	const { ctx, page } = await open('en', id);
	await edit(page).locator('select[name=class]').selectOption('Bard');
	await Promise.all([page.waitForNavigation(), edit(page).locator('button[type=submit]').click()]);
	await page.goto(`${BASE}/characters/${id}?new=edit`);
	const f = edit(page);
	assert.equal((await opts(f.locator('select[name=class]'))).find((o) => o.selected).value, 'Bard');
	const os = (await opts(f.locator('select[name=subclass]'))).filter((o) => o.value);
	assert.deepEqual(os.map((o) => o.value).sort(), SUBS.filter((s) => s.class === 'BARD').map((s) => s.id).sort());
	await ctx.close();
});

test('a legacy ancestry "Homebrew" is the selected option and saving keeps it', async () => {
	const id = process.env.LEGACY_ID; // seeded by run.sh straight into the database
	const { ctx, page } = await open('en', id);
	const f = edit(page);
	for (const [n, v] of [['ancestry', 'Homebrew'], ['community', 'Wanderers of old']]) {
		const os = await opts(f.locator(`select[name=${n}]`));
		const sel = os.filter((o) => o.selected);
		assert.equal(sel.length, 1, `${n}: one selected`);
		assert.equal(sel[0].value, v);
	}
	await Promise.all([page.waitForNavigation(), f.locator('button[type=submit]').click()]);
	const g = (await api('GET', `/api/characters/${id}`)).json;
	assert.equal(g.ancestry, 'Homebrew');
	assert.equal(g.community, 'Wanderers of old');
	await ctx.close();
});

test('the domain card picker is a select grouped by domain', async () => {
	const id = await mk({ class: 'Wizard' });
	const { ctx, page } = await open('en', id);
	await page.goto(`${BASE}/characters/${id}?new=card&tab=cards`); // us-305: the card picker is on the cards tab
	const sel = page.locator('select[name=cardId]');
	assert.equal(await sel.count(), 1);
	const groups = await sel.locator('optgroup').count();
	assert.ok(groups >= 1, 'optgroups');
	assert.ok((await sel.locator('optgroup option').count()) > 0);
	await ctx.close();
});
