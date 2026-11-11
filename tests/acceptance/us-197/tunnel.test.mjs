import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const postForm = (path, fields) =>
	fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' }, body: new URLSearchParams(fields).toString() });
const campaign = async (name = 'Tunnelcamp') => (await api('POST', '/api/campaigns', { name })).json.id;

// A complete, valid set of tunnel values (ancestry/community are English SRD names, as the selects post them).
// us-252: step 3 picks the six traits (and an optional armor) instead of typing the statistics.
const TRAITS = { agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' };
const VALUES = { name: 'Mira', class: 'Bard', level: '2', ancestry: 'Clank', community: 'Highborne', ...TRAITS };
const tunnel = (cid, q = '') => `/campaigns/${cid}/characters/new${q}`;
const stepUrl = (cid, step, values = VALUES) => tunnel(cid, '?' + new URLSearchParams({ step: String(step), ...values }));

const STEPS = { en: ['Identity', 'Heritage', 'Statistics', 'Review'], fr: ['Identité', 'Héritage', 'Statistiques', 'Récapitulatif'] };
const progressText = (lang, n) => (lang === 'fr' ? `Étape ${n} sur 4` : `Step ${n} of 4`);

async function open(path, { js = false, lang = 'en', viewport } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	const res = await p.goto(BASE + path);
	if (js) await p.waitForLoadState('networkidle');
	return { p, ctx, res };
}
const tid = (p, id) => p.locator(`[data-testid=${id}]`);
const stepForm = (p) => p.locator('form', { has: tid(p, 'tunnel-next') });
const field = (p, name) => stepForm(p).locator(`input[name=${name}]:not([type=hidden]), select[name=${name}]`);
const currentStep = (p) => tid(p, 'tunnel-progress').locator('li[aria-current=step]');
const query = (p) => new URL(p.url()).searchParams;
async function assertStep(p, n, lang = 'en') {
	assert.ok((await tid(p, 'tunnel-progress').innerText()).includes(progressText(lang, n)), `progress shows ${progressText(lang, n)}`);
	assert.equal(await currentStep(p).count(), 1, 'one current step');
	assert.ok((await currentStep(p).innerText()).includes(STEPS[lang][n - 1]), `current step is ${STEPS[lang][n - 1]}`);
}
const waitStep = (p, n) => p.waitForURL((u) => new URL(u).searchParams.get('step') === String(n));

// --- DM screen link -------------------------------------------------------

test('Build step: new-character is a link reading New character (fr Nouveau personnage) to the tunnel; no input[name=maxHp]', async () => {
	const cid = await campaign();
	for (const [lang, text] of [['en', 'New character'], ['fr', 'Nouveau personnage']]) {
		const { p, ctx } = await open(`/campaigns/${cid}?step=build`, { lang });
		const link = tid(p, 'build-party').locator('[data-testid=new-character]');
		assert.equal(await link.count(), 1);
		assert.equal(await link.evaluate((e) => e.tagName), 'A');
		assert.equal(await link.getAttribute('href'), `/campaigns/${cid}/characters/new`);
		assert.equal((await link.innerText()).trim(), text);
		assert.equal(await p.locator('input[name=maxHp]').count(), 0);
		await ctx.close();
	}
});

// --- step 1 by default ----------------------------------------------------

test('GET /campaigns/:id/characters/new and ?step=9 show step 1 with the 4 step names (en, fr)', async () => {
	const cid = await campaign();
	for (const lang of ['en', 'fr']) {
		for (const q of ['', '?step=9']) {
			const { p, ctx, res } = await open(tunnel(cid, q), { lang });
			assert.equal(res.status(), 200);
			await assertStep(p, 1, lang);
			const text = await tid(p, 'tunnel-progress').innerText();
			for (const s of STEPS[lang]) assert.ok(text.includes(s), `${lang} ${q}: step name ${s}`);
			await ctx.close();
		}
	}
});

test('GET /campaigns/unknown/characters/new answers 404 with the error page', async () => {
	const r = await fetch(BASE + '/campaigns/unknown/characters/new', { headers: { cookie: 'lang=en' } });
	assert.equal(r.status, 404);
	assert.ok((await r.text()).includes('Page not found'), '+error.svelte text');
	const { p, ctx, res } = await open('/campaigns/unknown/characters/new');
	assert.equal(res.status(), 404);
	assert.equal((await p.locator('h1').innerText()).trim(), 'Page not found');
	await ctx.close();
});

// --- no-JS walk through ---------------------------------------------------

test('without JS: steps 1 to 4 with Next, then Create, lead to the new character sheet', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(tunnel(cid));
	// step 1
	await field(p, 'name').fill('Mira');
	await field(p, 'class').selectOption('Bard');
	await field(p, 'level').fill('2');
	await Promise.all([waitStep(p, 2), tid(p, 'tunnel-next').click()]);
	let q = query(p);
	assert.equal(q.get('step'), '2');
	assert.equal(q.get('name'), 'Mira');
	assert.equal(q.get('class'), 'Bard');
	assert.equal(q.get('level'), '2');
	await assertStep(p, 2);
	// step 2
	await field(p, 'ancestry').selectOption('Clank');
	await field(p, 'community').selectOption('Highborne');
	await Promise.all([waitStep(p, 3), tid(p, 'tunnel-next').click()]);
	await assertStep(p, 3);
	q = query(p);
	assert.equal(q.get('name'), 'Mira', 'step 1 values carried over');
	assert.equal(q.get('ancestry'), 'Clank');
	assert.equal(q.get('community'), 'Highborne');
	// step 3
	for (const [k, v] of Object.entries(TRAITS)) await field(p, k).selectOption(v);
	await Promise.all([waitStep(p, 4), tid(p, 'tunnel-next').click()]);
	await assertStep(p, 4);
	const summary = await tid(p, 'tunnel-summary').innerText();
	for (const s of ['Mira', 'Bard', '2', 'Clank', 'Highborne', '+2', '-1']) assert.ok(summary.includes(s), `summary contains ${s}: ${summary}`);
	// create
	await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), tid(p, 'tunnel-create').click()]);
	const newId = new URL(p.url()).pathname.split('/').pop();
	assert.equal((await tid(p, 'character-name').first().innerText()).trim(), 'Mira');
	const ch = (await api('GET', `/api/characters/${newId}`)).json;
	assert.equal(ch.name, 'Mira');
	assert.equal(ch.class, 'Bard');
	assert.equal(ch.level, 2);
	assert.ok(ch.ancestry && ch.community, 'ancestry and community stored');
	assert.ok((await api('GET', `/api/campaigns/${cid}`)).json.characters.some((c) => c.id === newId), 'in the campaign');
	await ctx.close();
});

// --- Back, Edit, Cancel ----------------------------------------------------

test('tunnel-back on step 3 goes to step 2 with the selected ancestry still selected', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(stepUrl(cid, 3));
	await assertStep(p, 3);
	await Promise.all([waitStep(p, 2), tid(p, 'tunnel-back').click()]);
	await assertStep(p, 2);
	assert.equal(await field(p, 'ancestry').inputValue(), 'Clank');
	assert.equal(await field(p, 'community').inputValue(), 'Highborne');
	await ctx.close();
});

test('tunnel-edit-1 on step 4 goes to step 1 with name prefilled; tunnel-edit-2 and -3 go to steps 2 and 3', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(stepUrl(cid, 4));
	await assertStep(p, 4);
	for (const k of [2, 3]) {
		const href = await tid(p, `tunnel-edit-${k}`).getAttribute('href');
		const u = new URL(href, BASE);
		assert.equal(u.pathname, tunnel(cid));
		assert.equal(u.searchParams.get('step'), String(k));
		assert.equal(u.searchParams.get('name'), 'Mira');
	}
	await Promise.all([waitStep(p, 1), tid(p, 'tunnel-edit-1').click()]);
	await assertStep(p, 1);
	assert.equal(await field(p, 'name').inputValue(), 'Mira');
	await ctx.close();
});

test('tunnel-cancel on step 1 goes to /campaigns/:id?step=build', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(tunnel(cid));
	await Promise.all([p.waitForURL((u) => new URL(u).pathname === `/campaigns/${cid}`), tid(p, 'tunnel-cancel').click()]);
	assert.equal(query(p).get('step'), 'build');
	assert.equal(await tid(p, 'build').count(), 1);
	await ctx.close();
});

// --- required / min / max --------------------------------------------------

test('each step\'s inputs carry required, plus min and max on the numbers', async () => {
	const cid = await campaign();
	const attrs = (l) => l.evaluate((e) => ({ required: e.required, min: e.getAttribute('min'), max: e.getAttribute('max') }));
	// step 1
	let { p, ctx } = await open(tunnel(cid));
	assert.equal((await attrs(field(p, 'name'))).required, true, 'name required');
	assert.equal((await attrs(field(p, 'class'))).required, true, 'class required');
	assert.equal(await field(p, 'class').evaluate((e) => e.tagName), 'SELECT');
	assert.deepEqual(await attrs(field(p, 'level')), { required: true, min: '1', max: '10' });
	assert.equal(await field(p, 'level').inputValue(), '1', 'level defaults to 1');
	await ctx.close();
	// step 2: optional selects with an empty option
	({ p, ctx } = await open(stepUrl(cid, 2, { name: 'Mira', class: 'Bard', level: '2' })));
	for (const n of ['ancestry', 'community']) {
		assert.equal(await field(p, n).evaluate((e) => e.tagName), 'SELECT', n);
		assert.equal((await attrs(field(p, n))).required, false, `${n} optional`);
		assert.equal(await field(p, n).locator('option[value=""]').count(), 1, `${n} empty option`);
	}
	await ctx.close();
	// step 3 (us-252): required trait selects, optional armor select
	({ p, ctx } = await open(stepUrl(cid, 3, { name: 'Mira', class: 'Bard', level: '2' })));
	for (const n of Object.keys(TRAITS)) assert.equal((await attrs(field(p, n))).required, true, `${n} required`);
	assert.equal((await attrs(field(p, 'armorId'))).required, false, 'armorId optional');
	await ctx.close();
});

// --- invalid values in the URL ---------------------------------------------

test('?step=3 with level=11 redirects (303) to step=1&invalid=level; alert names the level label; level prefilled with 11', async () => {
	const cid = await campaign();
	const q = { name: 'Mira', class: 'Bard', level: '11' };
	const r = await fetch(BASE + stepUrl(cid, 3, q), { redirect: 'manual' });
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.pathname, tunnel(cid));
	assert.equal(loc.searchParams.get('step'), '1');
	assert.equal(loc.searchParams.get('invalid'), 'level');
	for (const [lang, label] of [['en', 'Level'], ['fr', 'Niveau']]) {
		const { p, ctx } = await open(stepUrl(cid, 3, q), { lang });
		assert.equal(query(p).get('invalid'), 'level');
		await assertStep(p, 1, lang);
		assert.equal(await p.locator('[role=alert]').filter({ hasText: label }).count(), 1, `${lang} alert names ${label}`);
		assert.equal(await field(p, 'level').inputValue(), '11');
		await ctx.close();
	}
});

test('boundary: ?step=3 with level=10 is valid and shows step 3 (no redirect)', async () => {
	const cid = await campaign();
	const r = await fetch(BASE + stepUrl(cid, 3, { name: 'Mira', class: 'Bard', level: '10' }), { redirect: 'manual' });
	assert.equal(r.status, 200);
});

// us-252: thresholds are derived now; an invalid step 3 is a trait set that breaks the array.
test('?step=4 with traits 2,2,1,0,0,-1 redirects to step=3&invalid=traits with an alert', async () => {
	const cid = await campaign();
	const url = stepUrl(cid, 4, { ...VALUES, strength: '2' });
	const r = await fetch(BASE + url, { redirect: 'manual' });
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'traits');
	const { p, ctx } = await open(url);
	await assertStep(p, 3);
	assert.equal(await p.locator('[role=alert]').filter({ hasText: 'Assign +2, +1, +1, +0, +0 and -1, each exactly once.' }).count(), 1);
	await ctx.close();
});

// us-252: the form no longer posts maxHp; an invalid step-4 POST is one whose traits break the array.
test('a step-4 POST with invalid traits redirects to step=3&invalid=traits with an alert', async () => {
	const cid = await campaign();
	const r = await postForm(stepUrl(cid, 4), { ...VALUES, agility: '1' });
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.pathname, tunnel(cid));
	assert.equal(loc.searchParams.get('step'), '3');
	assert.equal(loc.searchParams.get('invalid'), 'traits');
	assert.equal(loc.searchParams.get('name'), 'Mira', 'values kept');
	assert.equal((await api('GET', `/api/campaigns/${cid}`)).json.characters.length, 0, 'nothing created');
	const { p, ctx } = await open(loc.pathname + loc.search);
	await assertStep(p, 3);
	assert.equal(await p.locator('[role=alert]').filter({ hasText: 'Assign +2, +1, +1, +0, +0 and -1, each exactly once.' }).count(), 1);
	await ctx.close();
});

// --- with JavaScript -------------------------------------------------------

test('with JS: steps 1→4 with Next and Back are client-side navigations (window.__marker kept)', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(tunnel(cid), { js: true });
	await p.evaluate(() => { window.__marker = 1; });
	await field(p, 'name').fill('Mira');
	await field(p, 'class').selectOption('Bard');
	await field(p, 'level').fill('2');
	await Promise.all([waitStep(p, 2), tid(p, 'tunnel-next').click()]);
	await p.waitForFunction(() => document.querySelector('[data-testid=tunnel-progress]')?.textContent.includes('Step 2 of 4'));
	await field(p, 'ancestry').selectOption('Clank');
	await Promise.all([waitStep(p, 3), tid(p, 'tunnel-next').click()]);
	await p.waitForFunction(() => document.querySelector('[data-testid=tunnel-progress]')?.textContent.includes('Step 3 of 4'));
	await Promise.all([waitStep(p, 2), tid(p, 'tunnel-back').click()]);
	await p.waitForFunction(() => document.querySelector('[data-testid=tunnel-progress]')?.textContent.includes('Step 2 of 4'));
	assert.equal(await field(p, 'ancestry').inputValue(), 'Clank');
	await Promise.all([waitStep(p, 3), tid(p, 'tunnel-next').click()]);
	await p.waitForFunction(() => document.querySelector('[data-testid=tunnel-progress]')?.textContent.includes('Step 3 of 4'));
	for (const [k, v] of Object.entries(TRAITS)) await field(p, k).selectOption(v);
	await Promise.all([waitStep(p, 4), tid(p, 'tunnel-next').click()]);
	await tid(p, 'tunnel-summary').waitFor();
	assert.equal(query(p).get('step'), '4');
	assert.equal(await p.evaluate(() => window.__marker), 1, 'document was reloaded (marker lost)');
	await ctx.close();
});

test('with JS: creating from step 4 lands on /characters/:newId', async () => {
	const cid = await campaign();
	const { p, ctx } = await open(stepUrl(cid, 4), { js: true });
	await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), tid(p, 'tunnel-create').click()]);
	const newId = new URL(p.url()).pathname.split('/').pop();
	await tid(p, 'character-name').first().waitFor();
	assert.equal((await tid(p, 'character-name').first().innerText()).trim(), 'Mira');
	const cs = (await api('GET', `/api/campaigns/${cid}`)).json.characters;
	assert.deepEqual(cs.map((c) => c.id), [newId]);
	await ctx.close();
});

// --- French buttons ----------------------------------------------------------

test('button texts on the right steps: en Next/Back/Cancel/Edit/Create character, fr Suivant/Retour/Annuler/Modifier/Créer le personnage', async () => {
	const cid = await campaign();
	const T = {
		en: { next: 'Next', back: 'Back', cancel: 'Cancel', edit: 'Edit', create: 'Create character' },
		fr: { next: 'Suivant', back: 'Retour', cancel: 'Annuler', edit: 'Modifier', create: 'Créer le personnage' }
	};
	const txt = async (p, id) => (await tid(p, id).innerText()).trim();
	for (const lang of ['en', 'fr']) {
		const w = T[lang];
		let { p, ctx } = await open(tunnel(cid), { lang });
		assert.equal(await txt(p, 'tunnel-next'), w.next);
		assert.equal(await txt(p, 'tunnel-cancel'), w.cancel);
		assert.equal(await tid(p, 'tunnel-back').count(), 0, 'no Back on step 1');
		await ctx.close();
		for (const n of [2, 3]) {
			({ p, ctx } = await open(stepUrl(cid, n), { lang }));
			assert.equal(await txt(p, 'tunnel-next'), w.next, `step ${n} next`);
			assert.equal(await txt(p, 'tunnel-back'), w.back, `step ${n} back`);
			await ctx.close();
		}
		({ p, ctx } = await open(stepUrl(cid, 4), { lang }));
		assert.equal(await txt(p, 'tunnel-back'), w.back);
		for (const k of [1, 2, 3]) assert.equal(await txt(p, `tunnel-edit-${k}`), w.edit, `edit-${k}`);
		assert.equal(await txt(p, 'tunnel-create'), w.create);
		await ctx.close();
	}
});

// --- tablet / phone rules ----------------------------------------------------

const VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];
let layoutCid;
for (const step of [1, 2, 3, 4]) {
	for (const [width, height] of VIEWPORTS) {
		test(`step ${step} at ${width}x${height}: no horizontal scroll, 44px targets, 16px text inputs, visible controls`, async () => {
			layoutCid ??= await campaign('Layoutcamp');
			const { p, ctx } = await open(stepUrl(layoutCid, step), { js: true, viewport: { width, height } });
			await tid(p, 'tunnel-progress').waitFor();
			const r = await p.evaluate(() => {
				const rect = (e) => e.getBoundingClientRect();
				const els = [...document.querySelectorAll('a, button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select')]
					.filter((e) => rect(e).width > 0 && rect(e).height > 0);
				const name = (e) => `${e.tagName.toLowerCase()}[${e.getAttribute('data-testid') || e.getAttribute('name') || e.textContent.trim().slice(0, 20)}]`;
				return {
					scroll: [document.documentElement.scrollWidth, window.innerWidth],
					n: els.length,
					small: els.filter((e) => rect(e).width < 43.5 || rect(e).height < 43.5).map((e) => `${name(e)} ${Math.round(rect(e).width)}x${Math.round(rect(e).height)}`),
					font: [...document.querySelectorAll('input[type=text], input:not([type])')].filter((e) => rect(e).width > 0)
						.filter((e) => getComputedStyle(e).fontSize !== '16px').map(name),
					hidden: els.filter((e) => getComputedStyle(e).visibility !== 'visible' || !(parseFloat(getComputedStyle(e).opacity) > 0)).map(name)
				};
			});
			assert.ok(r.scroll[0] <= r.scroll[1], `scrollWidth ${r.scroll}`);
			assert.ok(r.n > 0);
			assert.deepEqual(r.small, [], 'controls under 44x44');
			assert.deepEqual(r.font, [], 'text inputs not 16px');
			assert.deepEqual(r.hidden, [], 'controls not visible');
			await ctx.close();
		});
	}
}
