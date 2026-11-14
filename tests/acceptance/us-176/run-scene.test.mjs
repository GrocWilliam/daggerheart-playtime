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
const CH = { class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 };
async function setup() {
	const c = (await api('POST', '/api/campaigns', { name: 'Runcamp' })).json;
	await api('POST', `/api/campaigns/${c.id}/characters`, { ...CH, name: 'Alyndra' });
	const envs = (await api('GET', '/api/srd/environments')).json;
	return { c, env: envs[0] };
}
const scenesOf = async (c) => (await api('GET', `/api/campaigns/${c.id}/scenes`)).json;
const mk = async (c, title, extra = {}) => (await api('POST', `/api/campaigns/${c.id}/scenes`, { title, ...extra })).json;
const setStatus = (c, s, status) => api('PATCH', `/api/campaigns/${c.id}/scenes/${s.id}`, { status });
async function open(path, { lang = 'en', js = true, viewport } = {}) {
	const ctx = await browser.newContext({ javaScriptEnabled: js, viewport });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(6000);
	await p.goto(BASE + path);
	return p;
}
const cur = (p) => p.locator('[data-testid=run] [data-testid=current-scene]');
const postForm = (path, fields) =>
	fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' }, body: new URLSearchParams(fields).toString() });

async function twoScenes() {
	const { c, env } = await setup();
	const a = await mk(c, 'Alphaglade', { environmentId: env.id, notes: 'start notes' });
	const b = await mk(c, 'Betahollow');
	await setStatus(c, a, 'current');
	return { c, a, b, env };
}

test('Run shows the current scene with title and environment, not other scenes', async () => {
	const { c, env } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`);
	const t = await cur(p).textContent();
	assert.match(t, /Alphaglade/);
	assert.ok(t.includes(env.name), `environment ${env.name} in ${t}`);
	assert.doesNotMatch(t, /Betahollow/);
});

test('current scene shows its encounter adversaries and loot with give forms', async () => {
	const { c, a } = await twoScenes();
	const enc = await api('POST', `/api/campaigns/${c.id}/scenes/${a.id}/encounter`, { partySize: 3, tier: 1, seed: 5 });
	assert.ok(enc.status < 300);
	const loot = await api('POST', `/api/campaigns/${c.id}/scenes/${a.id}/loot`, { table: 'items', rarity: 'common' });
	assert.ok(loot.status < 300);
	const p = await open(`/campaigns/${c.id}`);
	assert.ok((await cur(p).locator('[data-testid=encounter-adversary]').count()) >= 1);
	assert.equal(await cur(p).locator('[data-testid=loot-entry]').count(), 1);
	await cur(p).locator('[data-testid=loot-entry]').getByRole('button', { name: /^give$|^donner$/i }).click();
	await p.waitForFunction(() => document.querySelector('[data-testid=run] [data-testid=loot-entry]')?.getAttribute('data-given') === 'true');
	assert.equal((await scenesOf(c)).find((s) => s.id === a.id).loot[0].given, true);
});

for (const [lang, text] of [['en', 'No scene is being played.'], ['fr', "Aucune scène n'est en cours."]]) {
	test(`without a current scene: message, build link, no Next scene, no notes (${lang})`, async () => {
		const { c } = await setup();
		await mk(c, 'Onlyplanned');
		const p = await open(`/campaigns/${c.id}`, { lang });
		const run = p.locator('[data-testid=run]');
		const t = (await run.textContent()).replace(/\s+/g, ' ');
		assert.ok(t.includes(text), t);
		assert.ok((await run.locator('a[href*="step=build"]').count()) >= 1);
		assert.equal(await run.getByRole('button', { name: /next scene|scène suivante/i }).count(), 0);
		assert.equal(await p.locator('[data-testid=scene-notes]').count(), 0);
	});
}

test('nextScene: A done, B current; Next scene button shown when a scene is current', async () => {
	const { c, a, b } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`);
	await p.locator('[data-testid=run]').getByRole('button', { name: 'Next scene' }).click();
	await p.waitForFunction(() => /Betahollow/.test(document.querySelector('[data-testid=run] [data-testid=current-scene]')?.textContent ?? ''));
	const ss = await scenesOf(c);
	assert.equal(ss.find((s) => s.id === a.id).status, 'done');
	assert.equal(ss.find((s) => s.id === b.id).status, 'current');
});

test('nextScene on the last scene: it is done and nothing is current (no JS form post)', async () => {
	const { c, a, b } = await twoScenes();
	await setStatus(c, a, 'planned');
	await setStatus(c, b, 'current');
	const r = await postForm(`/campaigns/${c.id}?/nextScene`, {});
	assert.ok(r.status < 400, `status ${r.status}`);
	const ss = await scenesOf(c);
	assert.equal(ss.find((s) => s.id === b.id).status, 'done');
	assert.equal(ss.filter((s) => s.status === 'current').length, 0);
	const p = await open(`/campaigns/${c.id}`);
	assert.equal(await p.getByRole('button', { name: 'Next scene' }).count(), 0);
});

test('nextScene follows position order, not creation order', async () => {
	const { c, a, b } = await twoScenes();
	const third = await mk(c, 'Gammapeak');
	await api('POST', `/api/campaigns/${c.id}/scenes/${third.id}/move`, { position: 1 });
	await postForm(`/campaigns/${c.id}?/nextScene`, {});
	const ss = await scenesOf(c);
	assert.equal(ss.find((s) => s.id === a.id).status, 'done');
	assert.equal(ss.find((s) => s.id === third.id).status, 'current');
	assert.equal(ss.find((s) => s.id === b.id).status, 'planned');
});

test('JS: typing autosaves after ~800 ms with Saving… then Saved', async () => {
	const { c, a } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`);
	await p.route(`**/api/campaigns/${c.id}/scenes/${a.id}`, async (route) => {
		if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 500));
		await route.continue();
	});
	const ta = p.locator('[data-testid=scene-notes]');
	assert.equal(await ta.inputValue(), 'start notes');
	await ta.fill('Fresh notes here');
	const st = p.locator('[data-testid=notes-status]');
	await st.filter({ hasText: 'Saving…' }).waitFor();
	await st.filter({ hasText: 'Saved' }).waitFor();
	assert.equal((await scenesOf(c)).find((s) => s.id === a.id).notes, 'Fresh notes here');
});

test('JS: blur saves immediately, French status texts', async () => {
	const { c, a } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`, { lang: 'fr' });
	const ta = p.locator('[data-testid=scene-notes]');
	await ta.fill('Blur notes');
	await ta.blur();
	await p.locator('[data-testid=notes-status]').filter({ hasText: 'Enregistré' }).waitFor();
	assert.equal((await scenesOf(c)).find((s) => s.id === a.id).notes, 'Blur notes');
});

test('JS: a failed PATCH shows the error.server text', async () => {
	const { c, a } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`);
	await p.route(`**/api/campaigns/${c.id}/scenes/${a.id}`, (route) => route.request().method() === 'PATCH' ? route.abort() : route.continue());
	const ta = p.locator('[data-testid=scene-notes]');
	await ta.fill('will fail');
	await ta.blur();
	await p.locator('[data-testid=notes-status]').filter({ hasText: 'Something went wrong. Please try again.' }).waitFor();
	assert.equal((await scenesOf(c)).find((s) => s.id === a.id).notes, 'start notes');
});

test('scene-notes has maxlength 5000', async () => {
	const { c } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`);
	assert.equal(await p.locator('[data-testid=scene-notes]').getAttribute('maxlength'), '5000');
});

test('no JS: Save posts only notes; other fields unchanged', async () => {
	const { c, a, env } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`, { js: false });
	const form = p.locator('[data-testid=run] form').filter({ has: p.locator('[data-testid=scene-notes]') });
	await form.locator('[data-testid=scene-notes]').fill('Offline notes');
	await Promise.all([p.waitForLoadState('load'), form.getByRole('button', { name: 'Save', exact: true }).click()]);
	const s = (await scenesOf(c)).find((x) => x.id === a.id);
	assert.equal(s.notes, 'Offline notes');
	assert.equal(s.title, 'Alphaglade');
	assert.equal(s.environmentId, env.id);
	assert.equal(s.status, 'current');
	assert.equal(await p.locator('[data-testid=scene-notes]').inputValue(), 'Offline notes');
});

// Spec #298, reversed by #339: the Fear bar runs full width above the grid; from 1024px the party sits left of the scene.
test('layout: two columns at 1280px', async () => {
	const { c } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`, { viewport: { width: 1280, height: 900 } });
	const s = await cur(p).boundingBox();
	const f = await p.locator('[data-testid=run] [data-testid=fear]').boundingBox();
	const party = await p.locator('[data-testid=party]').boundingBox();
	assert.ok(f.y + f.height <= s.y + 2, `fear ${JSON.stringify(f)} above scene ${JSON.stringify(s)}`);
	assert.ok(party.x + party.width <= s.x + 2, `party ${JSON.stringify(party)} scene ${JSON.stringify(s)}`);
});

test('layout: stacked at 390px without horizontal scroll', async () => {
	const { c } = await twoScenes();
	const p = await open(`/campaigns/${c.id}`, { viewport: { width: 390, height: 800 } });
	const s = await cur(p).boundingBox();
	const f = await p.locator('[data-testid=run] form:has([data-testid=fear])').boundingBox();
	assert.ok(f.y >= s.y + s.height - 2 || s.y >= f.y + f.height - 2, 'stacked');
	assert.ok(Math.abs(f.x - s.x) < 40, 'same column');
	assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});
