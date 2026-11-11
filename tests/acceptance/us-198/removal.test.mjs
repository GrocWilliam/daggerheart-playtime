import { test } from 'node:test';
// Note: the API has no GET for /characters, so characters are read from GET /api/campaigns/:id.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const ORIGIN = new URL(BASE).origin;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const postForm = (path, fields) =>
	fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: 'text/html' }, body: new URLSearchParams(fields).toString() });
// us-252: step 3 values are the six traits; the statistics are derived.
const VALUES = { name: 'Mira', class: 'Bard', level: '2', ancestry: 'Clank', community: 'Highborne', agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' };
const campaign = async () => (await api('POST', '/api/campaigns', { name: 'Removal' })).json.id;
const count = async (cid) => (await api("GET", `/api/campaigns/${cid}`)).json.characters.length;

test('grep -rn addCharacter src prints nothing', () => {
	const r = spawnSync('grep', ['-rn', 'addCharacter', 'src'], { encoding: 'utf8' });
	assert.equal(r.status, 1, `matches:\n${r.stdout}`);
	assert.equal(r.stdout, '');
});

test('POST /campaigns/:id?/addCharacter does not create a character', async () => {
	const cid = await campaign();
	await api('POST', `/api/campaigns/${cid}/characters`, { name: 'Setup', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	const before = await count(cid);
	assert.equal(before, 1);
	await postForm(`/campaigns/${cid}?/addCharacter`, { ...VALUES, name: 'Ghost', class: 'Guardian' });
	assert.equal(await count(cid), before);
});

test('Build step still shows new-character linking to the tunnel and the party list', async () => {
	const cid = await campaign();
	await api('POST', `/api/campaigns/${cid}/characters`, { name: 'Member', class: 'Guardian', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
	const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	try {
		const p = await browser.newPage();
		await p.goto(`${BASE}/campaigns/${cid}?step=build`);
		const link = p.locator('[data-testid=new-character]');
		assert.equal(await link.count(), 1);
		assert.equal(await link.getAttribute('href'), `/campaigns/${cid}/characters/new`);
		assert.equal(await p.locator('[data-testid=party-member]').count(), 1);
	} finally { await browser.close(); }
});

test('a character created through the tunnel lands on /characters/:newId', async () => {
	const cid = await campaign();
	const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	try {
		const ctx = await browser.newContext({ javaScriptEnabled: false });
		const p = await ctx.newPage();
		p.setDefaultTimeout(8000);
		await p.goto(`${BASE}/campaigns/${cid}/characters/new?` + new URLSearchParams({ step: '4', ...VALUES }));
		await Promise.all([p.waitForURL(/\/characters\/[^/?]+$/), p.locator('[data-testid=tunnel-create]').click()]);
		const chars = (await api("GET", `/api/campaigns/${cid}`)).json.characters;
		assert.equal(chars.length, 1);
		assert.equal(new URL(p.url()).pathname, `/characters/${chars[0].id}`);
		assert.equal(chars[0].name, 'Mira');
	} finally { await browser.close(); }
});
