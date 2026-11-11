import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;

async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : {},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	return { status: res.status, text, json: text ? JSON.parse(text) : undefined };
}
const page = async (id, query = '') => {
	const res = await fetch(`${BASE}/campaigns/${id}${query}`);
	return { res, html: await res.text() };
};
const attr = (tag, name) => new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(tag)?.[1];
const strip = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Text content of the first element with the given data-testid (no nested same-name tags assumed).
function testid(html, id) {
	const m = new RegExp(`<([a-z0-9]+)\\b[^>]*data-testid=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`, 'i').exec(html);
	return m ? strip(m[2]) : undefined;
}
const has = (html, id) => new RegExp(`data-testid=["']${id}["']`).test(html);

// Split the page into per-card HTML segments (card i runs to the start of card i+1).
function cards(html) {
	const re = /<[a-z0-9]+\b[^>]*data-testid=["']character-card["'][^>]*>/gi;
	const idx = [...html.matchAll(re)].map((m) => m.index);
	return idx.map((s, i) => html.slice(s, idx[i + 1] ?? html.length));
}
const head = (html) => html.slice(0, cards(html).length ? html.indexOf('data-testid="character-card"') : html.length);

function forms(html) {
	return [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((m) => ({ html: m[0], index: m.index }));
}

// Submits a form the way a browser without JS would: hidden/default inputs, overrides,
// and the clicked submit button's name/value.
async function submit(form, { fill = {}, button } = {}) {
	const open = /<form\b[^>]*>/i.exec(form)[0];
	assert.match(attr(open, 'method') ?? 'get', /post/i, 'form uses POST');
	const action = (attr(open, 'action') ?? '').replace(/&amp;/g, '&');
	const body = new URLSearchParams();
	for (const i of form.matchAll(/<input\b[^>]*>/gi)) {
		const t = (attr(i[0], 'type') ?? 'text').toLowerCase();
		const n = attr(i[0], 'name');
		if (!n || t === 'submit' || t === 'checkbox' || t === 'radio') continue;
		body.set(n, attr(i[0], 'value') ?? '');
	}
	for (const [k, v] of Object.entries(fill)) body.set(k, String(v));
	if (button) {
		const n = attr(button, 'name');
		if (n) body.set(n, attr(button, 'value') ?? '');
	}
	const url = new URL(action, BASE + '/campaigns/x');
	const ownUrl = action === '' || action.startsWith('?') ? undefined : url;
	return { ownUrl, body };
}
async function post(pageUrl, form, opts) {
	const { ownUrl, body } = await submit(form, opts);
	const open = /<form\b[^>]*>/i.exec(form)[0];
	const action = (attr(open, 'action') ?? '').replace(/&amp;/g, '&');
	const url = new URL(action, pageUrl);
	return fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
		body: body.toString()
	});
}
const buttons = (formHtml) => [...formHtml.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map((m) => m[0]);
const plusButton = (formHtml) => buttons(formHtml).find((b) => strip(b) === '+');

async function mkCampaign(name = 'Test') {
	const c = await api('POST', '/api/campaigns', { name });
	assert.equal(c.status, 201, c.text);
	return c.json.id;
}
async function mkChar(cid, extra = {}) {
	const r = await api('POST', `/api/campaigns/${cid}/characters`, {
		name: 'Rook', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
		severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2, ...extra
	});
	assert.equal(r.status, 201, r.text);
	return r.json;
}

let cid, rook;

test('GET /campaigns/:unknown-id -> HTTP 404', async () => {
	const res = await fetch(`${BASE}/campaigns/00000000-0000-4000-8000-000000000000`);
	assert.equal(res.status, 404);
	const res2 = await fetch(`${BASE}/campaigns/nope`);
	assert.equal(res2.status, 404);
});

test('campaign "Test" with Rook: page renders all fields', async () => {
	cid = await mkCampaign('Test');
	assert.equal((await api('POST', `/api/campaigns/${cid}/fear`, { delta: 4 })).status, 200);
	rook = await mkChar(cid);
	for (const [p, d] of [['hp', 2], ['stress', 1], ['hope', 1]]) {
		assert.equal((await api('POST', `/api/characters/${rook.id}/${p}`, { delta: d })).status, 200);
	}
	assert.equal((await api('PUT', `/api/characters/${rook.id}/conditions`, { restrained: true })).status, 200);
	const ch = (await api('GET', `/api/characters/${rook.id}`)).json;
	assert.deepEqual([ch.hp, ch.stress, ch.hope, ch.armor], [{ marked: 2, max: 6 }, { marked: 1, max: 6 }, 3, { marked: 0, max: 2 }]);

	const { res, html } = await page(cid);
	assert.equal(res.status, 200);
	assert.match(res.headers.get('content-type') ?? '', /html/);
	assert.ok(testid(html, 'campaign-name')?.includes('Test'));
	assert.equal(testid(html, 'fear'), '4');
	const cs = cards(html);
	assert.equal(cs.length, 1);
	const c = cs[0];
	const link = [...c.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((m) => m[0]).find((a) => /data-testid=["']character-name["']/.test(a));
	assert.ok(link, 'character-name is a link');
	assert.equal(attr(link, 'href'), `/characters/${rook.id}`);
	assert.ok(strip(link).includes('Rook'));
	assert.ok(strip(c).includes('Guardian'));
	assert.match(strip(c), /\b2\b/);
	assert.equal(testid(c, 'hp'), '2/6');
	assert.equal(testid(c, 'stress'), '1/6');
	assert.equal(testid(c, 'hope'), '3');
	assert.equal(testid(c, 'armor'), '0/2');
	assert.equal(testid(c, 'evasion'), '10');
	assert.equal(testid(c, 'thresholds'), '5/10');
	assert.ok(has(c, 'condition-restrained'));
	assert.ok(!has(c, 'condition-vulnerable'));
	assert.ok(!has(c, 'condition-hidden'));
	assert.ok(!has(c, 'down'));
	// each tracker has - and + buttons
	assert.ok(buttons(c).filter((b) => strip(b) === '+').length >= 4, 'card has + buttons');
	assert.ok(buttons(c).filter((b) => strip(b) === '-').length >= 4, 'card has - buttons');
});

test('character with hp.marked === hp.max shows a down badge', async () => {
	const id = await mkCampaign('Downed');
	const ch = await mkChar(id, { maxHp: 3 });
	assert.equal((await api('POST', `/api/characters/${ch.id}/hp`, { delta: 3 })).status, 200);
	const { html } = await page(id);
	const cs = cards(html);
	assert.equal(cs.length, 1);
	assert.equal(testid(cs[0], 'hp'), '3/3');
	assert.ok(has(cs[0], 'down'));
});

test('Fear + button (plain POST) increases fear by 1, clamped at 12', async () => {
	const { html } = await page(cid);
	const f = forms(html).find((x) => plusButton(x.html) && x.index < html.indexOf('data-testid="character-card"'));
	assert.ok(f, 'fear form with + button before the cards');
	const r = await post(`${BASE}/campaigns/${cid}`, f.html, { button: plusButton(f.html) });
	assert.ok(r.status < 400, `status ${r.status}`);
	assert.equal(testid((await page(cid)).html, 'fear'), '5');
	assert.equal((await api('GET', `/api/campaigns/${cid}`)).json.fear, 5);
	// clamp
	await api('POST', `/api/campaigns/${cid}/fear`, { delta: 20 });
	assert.equal((await api('GET', `/api/campaigns/${cid}`)).json.fear, 12);
	const h2 = (await page(cid)).html;
	const f2 = forms(h2).find((x) => plusButton(x.html));
	const r2 = await post(`${BASE}/campaigns/${cid}`, f2.html, { button: plusButton(f2.html) });
	assert.ok(r2.status < 400, `status ${r2.status}`);
	assert.equal(testid((await page(cid)).html, 'fear'), '12');
});

test('add-character form creates a new character-card', async () => {
	// us-197: the Build step's inline form became the character tunnel; its step 4 posts every value as hidden inputs.
	// us-252: step 3 picks the six traits; HP and thresholds are derived (Wizard level 1 unarmored: 5 HP, 1/2).
	const values = { name: 'Nova', class: 'Wizard', level: 1, agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 };
	const url = `${BASE}/campaigns/${cid}/characters/new?${new URLSearchParams({ step: '4', ...values })}`;
	const html = await (await fetch(url)).text();
	const f = forms(html).find((x) => /<form\b[^>]*method=["']?post/i.test(x.html));
	assert.ok(f, 'tunnel step 4 POST form');
	for (const n of ['name', 'class', 'level', 'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge']) {
		assert.match(f.html, new RegExp(`name=["']${n}["']`), `input ${n}`);
	}
	const r = await post(url, f.html);
	assert.ok(r.status < 400, `status ${r.status}`);
	const cs = cards((await page(cid)).html);
	assert.equal(cs.length, 2);
	assert.ok(testid(cs[0], 'character-name').includes('Rook'));
	assert.ok(testid(cs[1], 'character-name').includes('Nova'));
	assert.equal(testid(cs[1], 'hp'), '0/5');
	assert.equal(testid(cs[1], 'thresholds'), '1/2');
});

test('damage form above severeThreshold without armor increases hp by 3', async () => {
	const { html } = await page(cid);
	const card = cards(html)[0];
	assert.equal(testid(card, 'hp'), '2/6');
	const f = forms(card).find((x) => /name=["'][^"']*amount[^"']*["']/i.test(x.html));
	assert.ok(f, 'card has a damage form with an amount input');
	const name = /name=["']([^"']*amount[^"']*)["']/i.exec(f.html)[1];
	assert.match(f.html, /type=["']checkbox["']/i, 'use armor checkbox');
	const r = await post(`${BASE}/campaigns/${cid}`, f.html, { fill: { [name]: 11 } });
	assert.ok(r.status < 400, `status ${r.status}`);
	const ch = (await api('GET', `/api/characters/${rook.id}`)).json;
	assert.deepEqual(ch.hp, { marked: 5, max: 6 });
	assert.deepEqual(ch.armor, { marked: 0, max: 2 });
	assert.equal(testid(cards((await page(cid)).html)[0], 'hp'), '5/6');
	// clamped at max
	await post(`${BASE}/campaigns/${cid}`, f.html, { fill: { [name]: 11 } });
	assert.deepEqual((await api('GET', `/api/characters/${rook.id}`)).json.hp, { marked: 6, max: 6 });
});
