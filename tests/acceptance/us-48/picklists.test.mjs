import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const core = (f) => json(`src/lib/srd/core/${f}.json`);
const FR = json('src/lib/srd/fr.json');
const CLASSES = core('classes');
const SUBS = core('subclasses');
const ANCS = core('ancestries');
const COMS = core('communities');
const enName = (e) => (typeof e.name === 'string' ? e.name.charAt(0) + e.name.slice(1).toLowerCase() : e.name['en-US']);
const nameIn = (e, lang) => (lang === 'fr' ? (FR[e.id] ?? enName(e)) : enName(e));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function api(method, path, body) {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
async function mk(over = {}, campId) {
	campId ??= (await api('POST', '/api/campaigns', { name: 'Picklists' })).json.id;
	const r = await api('POST', `/api/campaigns/${campId}/characters`, {
		name: 'Rook', class: 'Ranger', level: 2, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3, ...over });
	assert.equal(r.status, 201);
	return { id: r.json.id, campId };
}
const sub = (cls, i = 0) => SUBS.filter((s) => s.class === cls.toUpperCase())[i];
async function open(lang, path, { js = false, viewport } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: viewport ?? { width: 1000, height: 900 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(BASE + path);
	return { ctx, page };
}
const editForm = (page) => page.locator('form[action="?/edit"]');
const opts = async (sel) => sel.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent.trim(), selected: o.selected })));

test('edit form: class is a select of the 9 SRD classes, values Bard.., labels in the page language', async () => {
	const { id } = await mk();
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`);
		const sel = editForm(page).locator('select[name="class"]');
		assert.equal(await sel.count(), 1, 'select[name=class]');
		assert.equal(await editForm(page).locator('input[name="class"]').count(), 0);
		const os = (await opts(sel)).filter((o) => o.value !== '');
		assert.equal(os.length, 9);
		for (const c of CLASSES) {
			const v = enName(c);
			const o = os.find((x) => x.value === v);
			assert.ok(o, `${lang}: option value ${v}`);
			assert.equal(o.label, nameIn(c, lang), `${lang}: label of ${v}`);
		}
		assert.equal(os.find((o) => o.selected)?.value, 'Ranger');
		await ctx.close();
	}
});

test('edit form: subclass select has none + only the 2 subclasses of the chosen class; ancestry and community have none + all', async () => {
	const { id } = await mk({ class: 'Ranger' });
	for (const lang of ['en', 'fr']) {
		const { ctx, page } = await open(lang, `/characters/${id}`);
		const f = editForm(page);
		const s = await opts(f.locator('select[name="subclass"]'));
		const want = SUBS.filter((x) => x.class === 'RANGER');
		assert.equal(want.length, 2);
		assert.deepEqual(s.filter((o) => o.value !== '').map((o) => [o.value, o.label]), want.map((w) => [w.id, nameIn(w, lang)]));
		assert.equal(s.filter((o) => o.value === '').length, 1, 'one "none" option');
		assert.equal(s.length, 3);
		assert.ok(s.find((o) => o.value === '').selected, 'none selected by default');
		for (const [name, list] of [['ancestry', ANCS], ['community', COMS]]) {
			const o = await opts(f.locator(`select[name="${name}"]`));
			assert.equal(o.length, list.length + 1, name);
			assert.deepEqual(o.filter((x) => x.value !== '').map((x) => [x.value, x.label]), list.map((e) => [e.id, nameIn(e, lang)]));
			assert.equal(o.filter((x) => x.value === '').length, 1);
		}
		await ctx.close();
	}
});

test('edit form: a stored class that is not one of the 9 stays selected as is', async () => {
	const { id } = await mk({ class: 'Homebrew Hero' });
	const { ctx, page } = await open('en', `/characters/${id}`);
	const sel = editForm(page).locator('select[name="class"]');
	const os = await opts(sel);
	const cur = os.find((o) => o.selected);
	assert.equal(cur?.value, 'Homebrew Hero');
	assert.equal(os.filter((o) => o.value !== '' && o.value !== 'Homebrew Hero').length, 9);
	// saving without touching it keeps the class
	await ctx.close();
	const { ctx: c2, page: p2 } = await open('en', `/characters/${id}`, { js: true });
	await editForm(p2).locator('button[type="submit"]').click();
	await p2.waitForLoadState('networkidle');
	assert.equal((await api('GET', `/api/characters/${id}`)).json.class, 'Homebrew Hero');
	await c2.close();
});

test('saving the edit form persists class, subclass, ancestry and community; "none" resets them', async () => {
	const { id } = await mk({ class: 'Ranger' });
	const s = sub('Ranger', 1), a = ANCS[2], c = COMS[1];
	// no JavaScript: a plain form submit
	const { ctx, page } = await open('en', `/characters/${id}`);
	const f = editForm(page);
	await f.locator('select[name="class"]').selectOption('Ranger');
	await f.locator('select[name="subclass"]').selectOption(s.id);
	await f.locator('select[name="ancestry"]').selectOption(a.id);
	await f.locator('select[name="community"]').selectOption(c.id);
	await Promise.all([page.waitForNavigation(), f.locator('button[type="submit"]').click()]);
	let g = (await api('GET', `/api/characters/${id}`)).json;
	assert.deepEqual([g.class, g.subclass, g.ancestry, g.community], ['Ranger', s.id, a.id, c.id]);
	// reopen: the stored choices are the selected options
	const f2 = editForm(page);
	for (const [n, v] of [['subclass', s.id], ['ancestry', a.id], ['community', c.id]]) {
		assert.equal((await opts(f2.locator(`select[name="${n}"]`))).find((o) => o.selected)?.value, v, n);
	}
	for (const n of ['subclass', 'ancestry', 'community']) await f2.locator(`select[name="${n}"]`).selectOption('');
	await Promise.all([page.waitForNavigation(), f2.locator('button[type="submit"]').click()]);
	g = (await api('GET', `/api/characters/${id}`)).json;
	assert.deepEqual([g.subclass, g.ancestry, g.community], [null, null, null]);
	await ctx.close();
});

test('changing the class in the form to another class works (subclass none)', async () => {
	const { id } = await mk({ class: 'Ranger' });
	const { ctx, page } = await open('en', `/characters/${id}`);
	const f = editForm(page);
	await f.locator('select[name="class"]').selectOption('Bard');
	await Promise.all([page.waitForNavigation(), f.locator('button[type="submit"]').click()]);
	const g = (await api('GET', `/api/characters/${id}`)).json;
	assert.equal(g.class, 'Bard');
	assert.equal(g.subclass, null);
	const o = await opts(editForm(page).locator('select[name="subclass"]'));
	assert.deepEqual(o.filter((x) => x.value).map((x) => x.value), SUBS.filter((x) => x.class === 'BARD').map((x) => x.id));
	await ctx.close();
});

// expected texts of an SRD element: description paragraphs and "name: text" features
function expected(e) {
	const paras = [], feats = [];
	const para = (d) => (Array.isArray(d) ? d.map((x) => x.paragraph?.['en-US']).filter(Boolean) : []);
	paras.push(...para(e.description));
	(function walk(n) {
		if (Array.isArray(n)) return n.forEach(walk);
		if (n && typeof n === 'object') {
			if (n.name?.['en-US'] && Array.isArray(n.description) && n !== e) feats.push([n.name['en-US'], para(n.description)]);
			else for (const [k, v] of Object.entries(n)) if (k !== 'description') walk(v);
		}
	})(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'description' && k !== 'name')));
	return { paras, feats };
}

async function setup() {
	const s = sub('Ranger', 1), a = ANCS[2], c = COMS[1];
	const { id, campId } = await mk({ class: 'Ranger' });
	await mk({ name: 'Plain', class: 'Wizard' }, campId); // no elements chosen
	const r = await api('PATCH', `/api/characters/${id}`, { subclass: s.id, ancestry: a.id, community: c.id });
	assert.equal(r.status, 200);
	return { id, campId, els: { subclass: s, ancestry: a, community: c } };
}
const SCOPES = {
	sheet: (x) => ({ path: `/characters/${x.id}`, scope: (p) => p.locator('body') }),
	card: (x) => ({ path: `/campaigns/${x.campId}`, scope: (p) => p.locator('[data-testid="character-card"]').filter({ hasText: 'Rook' }) })
};

for (const [label, mkScope] of Object.entries(SCOPES)) {
	test(`${label}: chosen subclass, ancestry and community show their name and a helper (en + fr)`, async () => {
		const x = await setup();
		const S = mkScope(x);
		for (const lang of ['en', 'fr']) {
			const { ctx, page } = await open(lang, S.path);
			for (const [k, e] of Object.entries(x.els)) {
				const t = S.scope(page).locator(`[data-testid="${k}"]`);
				assert.equal(await t.count(), 1, `${lang} ${label} ${k}`);
				assert.ok(norm(await t.textContent()).includes(nameIn(e, lang)), `${lang} ${k}: name ${nameIn(e, lang)}`);
				const h = S.scope(page).locator(`details[data-testid="help"][data-help="${e.id}"]`);
				assert.equal(await h.count(), 1, `${lang} ${k} helper`);
				const sm = h.locator('> summary');
				assert.equal(norm(await sm.textContent()), '?');
				assert.equal(await sm.getAttribute('aria-label'), `${lang === 'fr' ? 'Aide : ' : 'Help: '}${nameIn(e, lang)}`);
			}
			await ctx.close();
		}
	});

	test(`${label}: no subclass, ancestry or community shown when none is chosen`, async () => {
		const x = await setup();
		const campId = x.campId;
		const plain = (await api('GET', `/api/campaigns/${campId}`)).json.characters?.find?.((c) => c.name === 'Plain');
		const { ctx, page } = await open('en', label === 'sheet' ? `/characters/${plain?.id ?? (await mk({ name: 'Plain2' })).id}` : `/campaigns/${campId}`);
		const scope = label === 'sheet' ? page.locator('body') : page.locator('[data-testid="character-card"]').filter({ hasText: 'Plain' });
		for (const k of Object.keys(x.els)) {
			const t = scope.locator(`[data-testid="${k}"]`);
			const n = await t.count();
			for (let i = 0; i < n; i++) assert.equal(norm(await t.nth(i).textContent()), '', `${k} empty`);
		}
		await ctx.close();
	});

	test(`${label}: opened helper of an SRD element shows its name, description and "<feature>: <text>" in a lang="en" block, 44x44 target, no JavaScript`, async () => {
		const x = await setup();
		const S = mkScope(x);
		for (const lang of ['en', 'fr']) {
			const { ctx, page } = await open(lang, S.path, { js: false });
			for (const e of Object.values(x.els)) {
				const h = S.scope(page).locator(`details[data-testid="help"][data-help="${e.id}"]`);
				const box = await h.locator('> summary').boundingBox();
				assert.ok(box.width >= 44 && box.height >= 44, `${e.id} target ${box.width}x${box.height}`);
				assert.equal(await h.evaluate((d) => d.open), false);
				await h.locator('> summary').click();
				assert.equal(await h.evaluate((d) => d.open), true);
				const body = norm(await h.textContent());
				assert.ok(body.includes(nameIn(e, lang)), `${e.id} name`);
				const en = h.locator('[lang="en"]');
				assert.ok((await en.count()) >= 1, `${e.id} lang=en block`);
				const txt = norm((await en.allTextContents()).join(' '));
				const { paras, feats } = expected(e);
				assert.ok(paras.length > 0 || feats.length > 0);
				for (const p of paras) assert.ok(txt.includes(norm(p)), `${e.id} paragraph: ${p.slice(0, 40)}`);
				for (const [n, ps] of feats) {
					assert.ok(txt.includes(`${n}: ${norm(ps[0] ?? '')}`), `${e.id} feature "${n}: ..."`);
					for (const p of ps) assert.ok(txt.includes(norm(p)), `${e.id} feature text`);
				}
				// the summary is the only thing hidden when closed
				await h.locator('> summary').click();
				assert.equal(await h.evaluate((d) => d.open), false);
			}
			await ctx.close();
		}
	});
}

test('sheet and card on a 375px wide screen: no horizontal overflow with the chosen elements', async () => {
	const x = await setup();
	for (const S of [SCOPES.sheet(x), SCOPES.card(x)]) {
		const { ctx, page } = await open('fr', S.path, { viewport: { width: 375, height: 800 } });
		const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(over <= 0, `overflow ${over}px on ${S.path}`);
		await ctx.close();
	}
});
