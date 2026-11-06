import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;

async function api(method, url, body) {
	const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return { status: res.status, json: await res.json().catch(() => undefined) };
}
async function get(url, lang) {
	const res = await fetch(BASE + url, { headers: { cookie: `lang=${lang}`, accept: 'text/html' } });
	return { status: res.status, html: await res.text() };
}
async function post(url, lang, fields) {
	const res = await fetch(BASE + url, {
		method: 'POST',
		redirect: 'manual',
		headers: { cookie: `lang=${lang}`, origin: ORIGIN, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields)
	});
	return { status: res.status, html: await res.text() };
}
const alertOf = (html) => /<p[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1]?.trim();

async function setup() {
	const camp = (await api('POST', '/api/campaigns', { name: 'C' })).json;
	const ch = (await api('POST', `/api/campaigns/${camp.id}/characters`, { name: 'Ayla', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 })).json;
	return { camp, ch };
}

// Each case: a failing form post; the API's English error must not leak into fr, and the page shows some message.
async function cases() {
	const { camp, ch } = await setup();
	const bad = { name: '', class: '', level: '', evasion: '', majorThreshold: '', severeThreshold: '', maxHp: '', maxStress: '', armorSlots: '' };
	return [
		{ id: 'campaign damage', url: `/campaigns/${camp.id}?/damage`, fields: { characterId: ch.id, amount: 'abc' }, apiCall: () => api('POST', `/api/characters/${ch.id}/damage`, { amount: 'abc', useArmor: false }) },
		{ id: 'character damage', url: `/characters/${ch.id}?/damage`, fields: { amount: 'abc' }, apiCall: () => api('POST', `/api/characters/${ch.id}/damage`, { amount: 'abc', useArmor: false }) },
		{ id: 'character edit', url: `/characters/${ch.id}?/edit`, fields: bad, apiCall: () => api('PATCH', `/api/characters/${ch.id}`, { name: '' }) },
		{ id: 'character gold', url: `/characters/${ch.id}?/gold`, fields: { handfuls: '-5' }, apiCall: () => api('POST', `/api/characters/${ch.id}/gold`, { handfuls: -5 }) },
		{ id: 'character add item', url: `/characters/${ch.id}?/addItem`, fields: { name: '' }, apiCall: () => api('POST', `/api/characters/${ch.id}/items`, { name: '' }) }
	];
}

test('fr: form errors on campaign and character pages are translated, not the raw API string', async () => {
	let checked = 0;
	for (const c of await cases()) {
		const apiErr = (await c.apiCall()).json?.error;
		assert.ok(apiErr, `${c.id}: API should reject`);
		const fr = await post(c.url, 'fr', c.fields);
		assert.ok(fr.status >= 400 && fr.status < 500, `${c.id}: status ${fr.status}`);
		const msg = alertOf(fr.html);
		assert.ok(msg, `${c.id}: fr page shows an alert`);
		assert.ok(!fr.html.includes(apiErr), `${c.id}: raw API error "${apiErr}" leaked into fr page`);
		assert.doesNotMatch(msg, /request failed/i, c.id);
		checked++;
	}
	assert.ok(checked >= 5);
});

test('en: the same errors still show a non-empty message', async () => {
	for (const c of await cases()) {
		const en = await post(c.url, 'en', c.fields);
		assert.ok(alertOf(en.html), `${c.id}: en page shows an alert`);
	}
});

test('fr: home page empty-name error is translated', async () => {
	const fr = await post('/', 'fr', { name: '' });
	const en = await post('/', 'en', { name: '' });
	assert.equal(fr.status, 400);
	assert.ok(alertOf(fr.html));
	assert.notEqual(alertOf(fr.html), alertOf(en.html));
	assert.ok(!fr.html.includes('Enter a campaign name'));
});

test('fr: unknown campaign and character pages show translated 404 text', async () => {
	const id = '00000000-0000-0000-0000-000000000000';
	for (const [url, en] of [[`/campaigns/${id}`, 'Campaign not found'], [`/characters/${id}`, 'Character not found'], ['/campaigns/nope', 'Campaign not found'], ['/characters/nope', 'Character not found']]) {
		const fr = await get(url, 'fr');
		assert.equal(fr.status, 404, url);
		assert.ok(!fr.html.includes(en), `${url}: "${en}" in fr page`);
		const e = await get(url, 'en');
		assert.equal(e.status, 404, url);
		assert.match(e.html, /not found/i);
	}
});

test('fr: pages have the French lang attribute and no English UI text from the catalog', async () => {
	const { camp, ch } = await setup();
	await api('POST', `/api/characters/${ch.id}/items`, { name: 'Rope', quantity: 2 });
	const enCat = (await import('node:fs')).readFileSync(new URL('../../../src/lib/i18n/en.json', import.meta.url), 'utf8');
	const frCat = (await import('node:fs')).readFileSync(new URL('../../../src/lib/i18n/fr.json', import.meta.url), 'utf8');
	const en = JSON.parse(enCat), fr = JSON.parse(frCat);
	const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<footer[\s\S]*?<\/footer>/g, '').replace(/<[^>]+>/g, '|');
	let sample = 0;
	for (const url of ['/', `/campaigns/${camp.id}`, `/characters/${ch.id}`]) {
		const { html } = await get(url, 'fr');
		assert.match(html, /<html lang="fr"/);
		const text = strip(html);
		for (const k of Object.keys(en)) {
			if (en[k] === fr[k] || en[k].length < 5 || !/^[A-Z]/.test(en[k])) continue;
			// only strings that the page would show: skip those that the fr text happens to contain
			if (text.includes(en[k]) && !text.includes(fr[k])) assert.fail(`${url}: English "${en[k]}" shown in fr`);
			sample++;
		}
	}
	assert.ok(sample >= 5);
});

test('fr: reference page chrome is French', async () => {
	const { html } = await get('/reference', 'fr');
	assert.match(html, /<html lang="fr"/);
	for (const w of ['SRD reference', '>Filter<', '>Kind', '>All<']) assert.ok(!html.includes(w), w);
});

test('fr: aria-labels and the help summary are translated', async () => {
	const { ch } = await setup();
	const { html } = await get(`/characters/${ch.id}`, 'fr');
	assert.ok(!/aria-label="Help:/.test(html));
	assert.ok(!/aria-label="Main"/.test(html));
	assert.ok(!/aria-label="Language"/.test(html));
});
