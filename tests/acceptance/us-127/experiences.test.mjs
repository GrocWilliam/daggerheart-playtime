import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// us-178: forms update in place (use:enhance), so there is no navigation to wait for: wait for the POST response, then for the network to settle.
const afterSubmit = async (p, click) => {
	const res = p.waitForResponse((r) => r.request().method() === 'POST');
	await click;
	await res;
	await p.waitForLoadState('networkidle');
};

const BASE = process.env.BASE_URL;
const waitFor = async (fn, ok) => {
	const end = Date.now() + 10000;
	let v;
	while (Date.now() < end) { v = await fn(); if (ok(v)) return v; await new Promise((r) => setTimeout(r, 100)); }
	return v;
};
const call = async (method, path, body) => {
	const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await res.text();
	return { status: res.status, json: text ? JSON.parse(text) : undefined, text };
};
const valid = { name: 'Rook', class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
const mk = async () => {
	const camp = (await call('POST', '/api/campaigns', { name: 'C' })).json;
	const ch = (await call('POST', `/api/campaigns/${camp.id}/characters`, { ...valid })).json;
	return { camp, ch };
};
const add = (id, name, modifier = 2) => call('POST', `/api/characters/${id}/experiences`, { name, modifier });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('a new character has experiences: []', async () => {
	const { ch } = await mk();
	assert.deepEqual(ch.experiences, []);
	assert.deepEqual((await call('GET', `/api/characters/${ch.id}`)).json.experiences, []);
});

test('POST trims the name, returns 201 with the character, oldest first', async () => {
	const { ch } = await mk();
	const r = await add(ch.id, '  Bounty hunter ', 2);
	assert.equal(r.status, 201, r.text);
	assert.equal(r.json.id, ch.id);
	assert.equal(r.json.experiences.length, 1);
	const e = r.json.experiences[0];
	assert.match(e.id, UUID);
	assert.deepEqual({ name: e.name, modifier: e.modifier }, { name: 'Bounty hunter', modifier: 2 });
	for (const k of ['id', 'modifier', 'name']) assert.ok(k in e, `missing key ${k}`);
	const r2 = await add(ch.id, 'Sailor', 3);
	assert.deepEqual(r2.json.experiences.map((x) => x.name), ['Bounty hunter', 'Sailor']);
	assert.deepEqual((await call('GET', `/api/characters/${ch.id}`)).json.experiences.map((x) => x.name), ['Bounty hunter', 'Sailor']);
});

test('an 11th experience returns 400', async () => {
	const { ch } = await mk();
	for (let i = 0; i < 10; i++) assert.equal((await add(ch.id, 'Exp ' + i, 1)).status, 201);
	const r = await add(ch.id, 'One too many');
	assert.equal(r.status, 400);
	assert.deepEqual(r.json, { error: 'a character has at most 10 experiences' });
	assert.equal((await call('GET', `/api/characters/${ch.id}`)).json.experiences.length, 10);
});

test('duplicate name (case/spaces) returns 409; PATCH to a duplicate returns 409', async () => {
	const { ch } = await mk();
	await add(ch.id, 'Bounty hunter');
	for (const n of ['bounty HUNTER', '  Bounty hunter  ']) {
		const r = await add(ch.id, n);
		assert.equal(r.status, 409, n);
		assert.deepEqual(r.json, { error: 'experience already exists' });
	}
	const other = (await add(ch.id, 'Sailor')).json.experiences[1];
	const p = await call('PATCH', `/api/characters/${ch.id}/experiences/${other.id}`, { name: ' BOUNTY hunter' });
	assert.equal(p.status, 409);
	assert.deepEqual(p.json, { error: 'experience already exists' });
	// same name in another character is fine
	const { ch: ch2 } = await mk();
	assert.equal((await add(ch2.id, 'Bounty hunter')).status, 201);
});

test('invalid modifier or name returns 400 over HTTP', async () => {
	const { ch } = await mk();
	for (const body of [{ name: 'A', modifier: 0 }, { name: 'A', modifier: 6 }, { name: 'A', modifier: 1.5 }, { name: '', modifier: 2 }, { name: 'x'.repeat(101), modifier: 2 }]) {
		const r = await call('POST', `/api/characters/${ch.id}/experiences`, body);
		assert.equal(r.status, 400, JSON.stringify(body).slice(0, 40));
		assert.equal(typeof r.json.error, 'string');
	}
	assert.deepEqual((await call('GET', `/api/characters/${ch.id}`)).json.experiences, []);
});

test('PATCH changes the modifier (and name); DELETE removes', async () => {
	const { ch } = await mk();
	const e = (await add(ch.id, 'Hunter', 2)).json.experiences[0];
	const p = await call('PATCH', `/api/characters/${ch.id}/experiences/${e.id}`, { modifier: 4 });
	assert.equal(p.status, 200, p.text);
	assert.equal(p.json.id, ch.id);
	assert.deepEqual(p.json.experiences, [{ id: e.id, name: 'Hunter', modifier: 4 }]);
	const p2 = await call('PATCH', `/api/characters/${ch.id}/experiences/${e.id}`, { name: ' Tracker ' });
	assert.deepEqual(p2.json.experiences, [{ id: e.id, name: 'Tracker', modifier: 4 }]);
	assert.equal((await call('PATCH', `/api/characters/${ch.id}/experiences/${e.id}`, { modifier: 9 })).status, 400);
	const d = await call('DELETE', `/api/characters/${ch.id}/experiences/${e.id}`);
	assert.equal(d.status, 200, d.text);
	assert.equal(d.json.id, ch.id);
	assert.deepEqual(d.json.experiences, []);
	assert.deepEqual((await call('GET', `/api/characters/${ch.id}`)).json.experiences, []);
});

test('unknown character or experience (or another character\'s) returns 404', async () => {
	const { ch } = await mk();
	const { ch: ch2 } = await mk();
	const e = (await add(ch.id, 'Hunter')).json.experiences[0];
	const ghost = '00000000-0000-4000-8000-000000000000';
	const checks = [
		['POST', `/api/characters/${ghost}/experiences`, { name: 'A', modifier: 2 }],
		['PATCH', `/api/characters/${ghost}/experiences/${e.id}`, { modifier: 2 }],
		['DELETE', `/api/characters/${ghost}/experiences/${e.id}`],
		['PATCH', `/api/characters/${ch.id}/experiences/${ghost}`, { modifier: 2 }],
		['DELETE', `/api/characters/${ch.id}/experiences/${ghost}`],
		['PATCH', `/api/characters/${ch2.id}/experiences/${e.id}`, { modifier: 2 }],
		['DELETE', `/api/characters/${ch2.id}/experiences/${e.id}`]
	];
	for (const [m, p, b] of checks) {
		const r = await call(m, p, b);
		assert.equal(r.status, 404, `${m} ${p}`);
		assert.equal(typeof r.json.error, 'string');
	}
	assert.equal((await call('GET', `/api/characters/${ch.id}`)).json.experiences.length, 1);
});

test('deleting the character or campaign removes experiences (204, no body)', async () => {
	const { camp, ch } = await mk();
	await add(ch.id, 'Hunter');
	const d = await call('DELETE', `/api/characters/${ch.id}`);
	assert.equal(d.status, 204);
	assert.equal(d.text, '');
	assert.equal((await call('GET', `/api/characters/${ch.id}`)).status, 404);
	assert.equal((await call('DELETE', `/api/characters/${ch.id}/experiences/x`)).status, 404);
	const { camp: c2, ch: ch2 } = await mk();
	await add(ch2.id, 'Hunter');
	const dc = await call('DELETE', `/api/campaigns/${c2.id}`);
	assert.equal(dc.status, 204);
	assert.equal(dc.text, '');
	assert.equal((await call('GET', `/api/characters/${ch2.id}`)).status, 404);
});

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const items = (page) => page.locator('[data-testid=experience]');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// Assumed markup: add form = a form (outside any experience item) with inputs name="name" and name="modifier";
// per experience: a form with input name="modifier" + submit button, and a separate form with a remove button.
const addForm = (page) => page.locator('form:not([data-testid=experience] form)').filter({ has: page.locator('input[name=name]') }).filter({ has: page.locator('input[name=modifier], select[name=modifier]') });

test('sheet shows "Bounty hunter +2"', async () => {
	const { ch } = await mk();
	await add(ch.id, 'Bounty hunter', 2);
	const page = await browser.newPage();
	await page.goto(BASE + `/characters/${ch.id}`);
	assert.equal(await items(page).count(), 1);
	assert.match(norm(await items(page).first().innerText()), /^Bounty hunter \+2/);
	assert.match(await page.locator('body').innerText(), /Experiences/);
	await page.close();
});

test('add form (modifier defaults to 2), change form and remove button work', async () => {
	const { ch } = await mk();
	const page = await browser.newPage();
	await page.goto(BASE + `/characters/${ch.id}`);
	await page.locator('[data-testid=new-experience]').click(); // the add form lives in a modal (us-195)
	const f = addForm(page).first();
	assert.equal(await f.locator('[name=modifier]').inputValue(), '2');
	await f.locator('input[name=name]').fill('Bounty hunter');
	await afterSubmit(page, f.locator('button[type=submit], button:not([type])').first().click());
	let g = (await waitFor(() => call('GET', `/api/characters/${ch.id}`), (x) => x.json.experiences.length === 1)).json;
	assert.deepEqual(g.experiences.map((e) => [e.name, e.modifier]), [['Bounty hunter', 2]]);
	await page.goto(BASE + `/characters/${ch.id}`);
	assert.match(norm(await items(page).first().innerText()), /^Bounty hunter \+2/);

	const chg = items(page).first().locator('form').filter({ has: page.locator('[name=modifier]') });
	await chg.locator('[name=modifier]').fill('4');
	await afterSubmit(page, chg.locator('button[type=submit], button:not([type])').first().click());
	g = (await waitFor(() => call('GET', `/api/characters/${ch.id}`), (x) => x.json.experiences[0]?.modifier === 4)).json;
	assert.equal(g.experiences[0].modifier, 4);
	await page.goto(BASE + `/characters/${ch.id}`);
	assert.match(norm(await items(page).first().innerText()), /^Bounty hunter \+4/);

	const rm = items(page).first().locator('form').filter({ hasNot: page.locator('[name=modifier]') }).locator('button').first();
	await afterSubmit(page, rm.click());
	assert.deepEqual((await waitFor(() => call('GET', `/api/characters/${ch.id}`), (x) => x.json.experiences.length === 0)).json.experiences, []);
	await page.goto(BASE + `/characters/${ch.id}`);
	assert.equal(await items(page).count(), 0);
	await page.close();
});

test('adding a duplicate on the sheet shows a translated error key, not API English', async () => {
	const { ch } = await mk();
	await add(ch.id, 'Hunter');
	const page = await browser.newPage();
	await page.goto(BASE + `/characters/${ch.id}`);
	await page.locator('[data-testid=new-experience]').click(); // the add form lives in a modal (us-195)
	const f = addForm(page).first();
	await f.locator('input[name=name]').fill('hunter');
	await afterSubmit(page, f.locator('button[type=submit], button:not([type])').first().click());
	await page.waitForLoadState('networkidle');
	assert.doesNotMatch(await page.locator('body').innerText(), /experience already exists/);
	assert.equal((await call('GET', `/api/characters/${ch.id}`)).json.experiences.length, 1);
	await page.close();
});

test('sheet renders the section in French', async () => {
	const { ch } = await mk();
	const get = async (lang) => (await fetch(BASE + `/characters/${ch.id}`, { headers: { cookie: `lang=${lang}`, accept: 'text/html' } })).text();
	const en = await get('en'), fr = await get('fr');
	assert.match(en, />\s*Experiences\s*</);
	assert.doesNotMatch(fr, />\s*Experiences\s*</);
	assert.match(fr, /Expériences/);
});
