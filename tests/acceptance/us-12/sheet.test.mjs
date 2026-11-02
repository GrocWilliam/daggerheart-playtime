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
	let json;
	try { json = text ? JSON.parse(text) : undefined; } catch {}
	return { status: res.status, text, json };
}
const attr = (tag, name) => new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(tag)?.[1];
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (s) => unesc(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
function testid(html, id) {
	const m = new RegExp(`<([a-z0-9]+)\\b[^>]*data-testid=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`, 'i').exec(html);
	return m ? strip(m[2]) : undefined;
}
const has = (html, id) => new RegExp(`data-testid=["']${id}["']`).test(html);
const forms = (html) => [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((m) => ({ html: m[0], index: m.index }));
const buttons = (f) => [...f.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map((m) => m[0]);
const inputs = (f) => [...f.matchAll(/<input\b[^>]*>/gi)].map((m) => m[0]);
const textareas = (f) => [...f.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)];

// Per-item segments (from one item element to the next one, or to the end of the page).
function itemSegments(html) {
	const re = /<[a-z0-9]+\b[^>]*data-testid=["']item["'][^>]*>/gi;
	const idx = [...html.matchAll(re)].map((m) => m.index);
	return idx.map((s, i) => html.slice(s, idx[i + 1] ?? html.length));
}
function itemTexts(html) {
	return [...html.matchAll(/<([a-z0-9]+)\b[^>]*data-testid=["']item["'][^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => strip(m[2]));
}

/**
 * Submit a form like a browser without JS: defaults of inputs/textareas, then overrides in
 * `fill`, then the checkboxes listed in `check`, then the clicked button's name/value.
 */
async function post(pageUrl, formHtml, { fill = {}, check = [], button } = {}) {
	const open = /<form\b[^>]*>/i.exec(formHtml)[0];
	assert.match(attr(open, 'method') ?? 'get', /post/i, 'form uses POST');
	const action = unesc(attr(open, 'action') ?? '');
	const body = new URLSearchParams();
	for (const i of inputs(formHtml)) {
		const t = (attr(i, 'type') ?? 'text').toLowerCase();
		const n = attr(i, 'name');
		if (!n || ['submit', 'checkbox', 'radio', 'button'].includes(t)) continue;
		body.set(n, unesc(attr(i, 'value') ?? ''));
	}
	for (const [, a, content] of textareas(formHtml)) {
		const n = attr(a, 'name');
		if (n) body.set(n, unesc(content));
	}
	for (const [k, v] of Object.entries(fill)) body.set(k, String(v));
	for (const n of check) {
		const c = inputs(formHtml).find((i) => attr(i, 'name') === n && /checkbox/i.test(i));
		body.set(n, c ? (attr(c, 'value') ?? 'on') : 'on');
	}
	if (button) {
		const n = attr(button, 'name');
		if (n) body.set(n, unesc(attr(button, 'value') ?? ''));
	}
	return fetch(new URL(action, pageUrl), {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
		body: body.toString()
	});
}

async function mkChar(extra = {}) {
	const c = await api('POST', '/api/campaigns', { name: 'Test' });
	assert.equal(c.status, 201, c.text);
	const r = await api('POST', `/api/campaigns/${c.json.id}/characters`, {
		name: 'Rook', class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
		severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2, ...extra
	});
	assert.equal(r.status, 201, r.text);
	return r.json.id;
}
const url = (id) => `${BASE}/characters/${id}`;
async function sheet(id) {
	const res = await fetch(url(id));
	return { res, html: await res.text() };
}
const getApi = async (id) => (await api('GET', `/api/characters/${id}`)).json;

const editForm = (html) => forms(html).find((f) => /name=["']majorThreshold["']/.test(f.html));
const notesForm = (html) => forms(html).find((f) => /<textarea\b[^>]*data-testid=["']notes["']/i.test(f.html));
function goldForm(html) {
	const cand = forms(html).filter((f) => {
		const ins = inputs(f.html).filter((i) => !['hidden', 'submit', 'button'].includes((attr(i, 'type') ?? 'text').toLowerCase()));
		return ins.length === 1 && !/checkbox/i.test(ins[0]) && !/name=["'](quantity|name)["']/.test(ins[0]);
	});
	return cand.find((f) => /name=["'][^"']*(handful|gold)[^"']*["']/i.test(f.html)) ?? cand[0];
}
const numberInputName = (f) => attr(inputs(f).find((i) => !['hidden', 'submit', 'checkbox'].includes((attr(i, 'type') ?? 'text').toLowerCase())), 'name');
const addItemForm = (html) =>
	forms(html).find((f) => inputs(f.html).some((i) => attr(i, 'name') === 'name' && /text/i.test(attr(i, 'type') ?? 'text')) && /name=["']quantity["']/.test(f.html) && !/majorThreshold/.test(f.html));
// Forms belonging to an item: those inside its segment, else those mentioning its id.
function itemForms(html, itemId, label) {
	const seg = itemSegments(html).find((s) => strip(s).includes(label));
	let fs = seg ? forms(seg) : [];
	if (!fs.length && itemId) fs = forms(html).filter((f) => f.html.includes(itemId));
	return fs.filter((f) => !/majorThreshold/.test(f.html));
}
const qtyForm = (fs) => fs.find((f) => /name=["']quantity["']/.test(f.html));

test('GET /characters/:unknown-id -> HTTP 404', async () => {
	assert.equal((await fetch(`${BASE}/characters/00000000-0000-4000-8000-000000000000`)).status, 404);
	assert.equal((await fetch(`${BASE}/characters/nope`)).status, 404);
});

test('character with notes, gold and one item: sheet shows notes, gold and the item', async () => {
	const id = await mkChar();
	let r = await api('PATCH', `/api/characters/${id}`, { notes: 'Has a scar' });
	assert.equal(r.status, 200, r.text);
	r = await api('POST', `/api/characters/${id}/gold`, { handfuls: 123 }); // 1 chest, 2 bags, 3 handfuls
	assert.equal(r.status, 200, r.text);
	assert.deepEqual(r.json.gold, { handfuls: 3, bags: 2, chests: 1 });
	r = await api('POST', `/api/characters/${id}/items`, { name: 'Torch', quantity: 3 });
	assert.ok(r.status < 300, r.text);

	const { res, html } = await sheet(id);
	assert.equal(res.status, 200);
	assert.match(res.headers.get('content-type') ?? '', /html/);
	const ta = /<textarea\b[^>]*data-testid=["']notes["'][^>]*>([\s\S]*?)<\/textarea>/i.exec(html);
	assert.ok(ta, 'notes textarea');
	assert.ok(unesc(ta[1]).includes('Has a scar'));
	assert.ok(testid(html, 'gold')?.includes('1 chests, 2 bags, 3 handfuls'), testid(html, 'gold'));
	const items = itemTexts(html);
	assert.equal(items.length, 1);
	assert.ok(items[0].includes('Torch ×3'), items[0]);
});

test('sheet renders the same details as the campaign card, with tracker buttons and damage form', async () => {
	const id = await mkChar();
	for (const [p, d] of [['hp', 2], ['stress', 1], ['hope', 1]]) {
		assert.equal((await api('POST', `/api/characters/${id}/${p}`, { delta: d })).status, 200);
	}
	assert.equal((await api('PUT', `/api/characters/${id}/conditions`, { restrained: true })).status, 200);
	const { html } = await sheet(id);
	assert.ok(testid(html, 'character-name')?.includes('Rook'));
	assert.ok(strip(html).includes('Guardian'));
	assert.equal(testid(html, 'hp'), '2/6');
	assert.equal(testid(html, 'stress'), '1/6');
	assert.equal(testid(html, 'hope'), '3');
	assert.equal(testid(html, 'armor'), '0/2');
	assert.equal(testid(html, 'evasion'), '10');
	assert.equal(testid(html, 'thresholds'), '5/10');
	assert.ok(has(html, 'condition-restrained'));
	assert.ok(!has(html, 'condition-vulnerable'));
	assert.ok(!has(html, 'condition-hidden'));
	assert.ok(!has(html, 'down'));
	const plus = buttons(html).filter((b) => strip(b) === '+');
	assert.ok(plus.length >= 4 && buttons(html).filter((b) => strip(b) === '-').length >= 4, 'tracker buttons');
	// a + button works as a plain form post
	const f = forms(html).find((x) => buttons(x.html).some((b) => strip(b) === '+') && /hope/i.test(x.html));
	assert.ok(f, 'hope tracker form');
	const rr = await post(url(id), f.html, { button: buttons(f.html).find((b) => strip(b) === '+') });
	assert.ok(rr.status < 400, `status ${rr.status}`);
	assert.equal(testid((await sheet(id)).html, 'hope'), '4');
	// damage form
	const dmg = forms(html).find((x) => /name=["'][^"']*amount[^"']*["']/i.test(x.html) && /checkbox/i.test(x.html));
	assert.ok(dmg, 'damage form');
	const nm = /name=["']([^"']*amount[^"']*)["']/i.exec(dmg.html)[1];
	const dr = await post(url(id), dmg.html, { fill: { [nm]: 11 } });
	assert.ok(dr.status < 400, `status ${dr.status}`);
	assert.equal(testid((await sheet(id)).html, 'hp'), '5/6');
});

test('character with hp.marked === hp.max shows a down badge on the sheet', async () => {
	const id = await mkChar({ maxHp: 3 });
	assert.equal((await api('POST', `/api/characters/${id}/hp`, { delta: 3 })).status, 200);
	const { html } = await sheet(id);
	assert.equal(testid(html, 'hp'), '3/3');
	assert.ok(has(html, 'down'));
});

test('edit form with new name and level updates the character; invalid evasion -1 changes nothing', async () => {
	const id = await mkChar();
	const { html } = await sheet(id);
	const f = editForm(html);
	assert.ok(f, 'edit form with majorThreshold input');
	for (const n of ['name', 'class', 'level', 'evasion', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'armorSlots']) {
		assert.match(f.html, new RegExp(`name=["']${n}["']`), `input ${n}`);
	}
	const r = await post(url(id), f.html, { fill: { name: 'Rook II', level: 5 } });
	assert.ok(r.status < 400, `status ${r.status}`);
	const after = await sheet(id);
	assert.ok(testid(after.html, 'character-name')?.includes('Rook II'));
	assert.ok(strip(after.html).match(/\b5\b/), 'level 5 shown');
	const a = await getApi(id);
	assert.equal(a.name, 'Rook II');
	assert.equal(a.level, 5);
	assert.equal(a.evasion, 10);

	const bad = await post(url(id), editForm(after.html).html, { fill: { name: 'Hacked', evasion: -1 } });
	assert.ok(bad.status >= 200);
	const b = await getApi(id);
	assert.equal(b.name, 'Rook II');
	assert.equal(b.evasion, 10);
	assert.equal(b.level, 5);
	assert.ok(testid((await sheet(id)).html, 'character-name')?.includes('Rook II'));
});

test('vulnerable toggle submitted on shows condition-vulnerable (and API conditions.vulnerable)', async () => {
	const id = await mkChar();
	const { html } = await sheet(id);
	assert.ok(!has(html, 'condition-vulnerable'));
	const f = forms(html).find((x) => /vulnerable/i.test(x.html) && !/majorThreshold/.test(x.html));
	assert.ok(f, 'vulnerable toggle form');
	const hasCheckbox = inputs(f.html).some((i) => /checkbox/i.test(i) && /vulnerable/i.test(i));
	const hasSelect = /name=["']vulnerable["']/.test(f.html);
	const btn = buttons(f.html)[0];
	const r = await post(url(id), f.html, hasCheckbox ? { check: ['vulnerable'] } : { button: btn });
	assert.ok(r.status < 400, `status ${r.status} (checkbox=${hasCheckbox}, named=${hasSelect})`);
	const c = (await getApi(id)).conditions;
	assert.deepEqual(c, { vulnerable: true, restrained: false, hidden: false });
	const after = (await sheet(id)).html;
	assert.ok(has(after, 'condition-vulnerable'));
	assert.ok(!has(after, 'condition-restrained'));
	assert.ok(!has(after, 'condition-hidden'));
	// restrained and hidden toggles exist too
	for (const k of ['restrained', 'hidden']) {
		assert.ok(forms(after).some((x) => new RegExp(k, 'i').test(x.html) && !/majorThreshold/.test(x.html)), `${k} toggle`);
	}
});

test('saving new notes text via the notes form persists it', async () => {
	const id = await mkChar();
	const { html } = await sheet(id);
	const f = notesForm(html);
	assert.ok(f, 'notes form');
	const ta = textareas(f.html)[0];
	const field = attr(ta[1], 'name');
	assert.ok(field, 'notes textarea has a name');
	const r = await post(url(id), f.html, { fill: { [field]: 'Afraid of heights' } });
	assert.ok(r.status < 400, `status ${r.status}`);
	assert.equal((await getApi(id)).notes, 'Afraid of heights');
	const after = (await sheet(id)).html;
	const m = /<textarea\b[^>]*data-testid=["']notes["'][^>]*>([\s\S]*?)<\/textarea>/i.exec(after);
	assert.equal(unesc(m[1]).trim(), 'Afraid of heights');
});

test('gold form: spending -2 handfuls from empty gold is rejected and gold stays 0/0/0; adding works', async () => {
	const id = await mkChar();
	const { html } = await sheet(id);
	assert.equal(testid(html, 'gold'), '0 chests, 0 bags, 0 handfuls');
	const f = goldForm(html);
	assert.ok(f, 'gold form with a single integer input');
	const field = numberInputName(f.html);
	await post(url(id), f.html, { fill: { [field]: -2 } });
	assert.deepEqual((await getApi(id)).gold, { handfuls: 0, bags: 0, chests: 0 });
	assert.equal(testid((await sheet(id)).html, 'gold'), '0 chests, 0 bags, 0 handfuls');
	// adding handfuls works and normalizes
	const ok = await post(url(id), f.html, { fill: { [field]: 12 } });
	assert.ok(ok.status < 400, `status ${ok.status}`);
	assert.equal(testid((await sheet(id)).html, 'gold'), '0 chests, 1 bags, 2 handfuls');
});

test('add-item form with "Rope" x2 shows an item "Rope ×2"', async () => {
	const id = await mkChar();
	const { html } = await sheet(id);
	assert.equal(itemTexts(html).length, 0);
	const f = addItemForm(html);
	assert.ok(f, 'add-item form with name and quantity inputs');
	const r = await post(url(id), f.html, { fill: { name: 'Rope', quantity: 2 } });
	assert.ok(r.status < 400, `status ${r.status}`);
	const items = itemTexts((await sheet(id)).html);
	assert.equal(items.length, 1);
	assert.ok(items[0].includes('Rope ×2'), items[0]);
	assert.equal((await getApi(id)).items[0].name, 'Rope');
	// quantity is optional (defaults to 1)
	const f2 = addItemForm((await sheet(id)).html);
	const r2 = await post(url(id), f2.html, { fill: { name: 'Lantern', quantity: '' } });
	assert.ok(r2.status < 400, `status ${r2.status}`);
	assert.ok(itemTexts((await sheet(id)).html).some((t) => t.includes('Lantern ×1')));
});

test('changing Rope quantity to 5 shows "Rope ×5"; removing it leaves no Rope item', async () => {
	const id = await mkChar();
	const add = await api('POST', `/api/characters/${id}/items`, { name: 'Rope', quantity: 2 });
	assert.ok(add.status < 300, add.text);
	await api('POST', `/api/characters/${id}/items`, { name: 'Torch', quantity: 3 });
	let html = (await sheet(id)).html;
	let fs = itemForms(html, add.json.id, 'Rope ×2');
	let q = qtyForm(fs);
	assert.ok(q, 'per-item quantity form');
	let r = await post(url(id), q.html, { fill: { quantity: 5 } });
	assert.ok(r.status < 400, `status ${r.status}`);
	html = (await sheet(id)).html;
	const texts = itemTexts(html);
	assert.ok(texts.some((t) => t.includes('Rope ×5')), texts.join('|'));
	assert.ok(texts.some((t) => t.includes('Torch ×3')), 'other item untouched');

	fs = itemForms(html, add.json.id, 'Rope ×5');
	const rm = fs.find((f) => buttons(f.html).some((b) => /remove|delete|✕|×|x$/i.test(strip(b)))) ;
	if (rm) {
		const btn = buttons(rm.html).find((b) => /remove|delete|✕|×|x$/i.test(strip(b)));
		r = await post(url(id), rm.html, { button: btn });
	} else {
		r = await post(url(id), qtyForm(fs).html, { fill: { quantity: 0 } });
	}
	assert.ok(r.status < 400, `status ${r.status}`);
	const after = itemTexts((await sheet(id)).html);
	assert.ok(!after.some((t) => t.includes('Rope')), after.join('|'));
	assert.ok(after.some((t) => t.includes('Torch ×3')));
	assert.deepEqual((await getApi(id)).items.map((i) => i.name), ['Torch']);
});
