import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openSceneMore } from '../support/scenes.mjs';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser, camp, chars = [], scenes = [];
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return r.json().catch(() => null);
};
const ch = (name) => ({ name, class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	camp = (await api('POST', '/api/campaigns', { name: 'Densecamp' })).id;
	for (const n of ['Alyndra', 'Brom']) {
		const c = await api('POST', `/api/campaigns/${camp}/characters`, ch(n));
		await api('PATCH', `/api/characters/${c.id}`, { subclass: 'core_subclass_beastbound', ancestry: 'core_ancestry_clank', community: 'core_community_highborne' });
		chars.push(c.id);
	}
	for (const [title, env] of [['Alphaglade', 'env_abandoned_grove'], ['Zetaplain', undefined], ['Omegaridge', 'env_abandoned_grove']]) {
		const s = await api('POST', `/api/campaigns/${camp}/scenes`, { title, environmentId: env });
		scenes.push(s.id);
	}
	await api('PATCH', `/api/campaigns/${camp}/scenes/${scenes[0]}`, { status: 'current' });
	const url = `/api/campaigns/${camp}/scenes/${scenes[0]}/encounter`;
	await api('POST', url, { partySize: 4, tier: 1, seed: 1 });
	await api('PATCH', url, { adversaries: [{ id: 'adv_acid_burrower', count: 1 }, { id: 'adv_giant_rat', count: 3 }] });
});
after(async () => { await browser?.close(); });

async function open(path, [width, height], opts = {}) {
	const ctx = await browser.newContext({ viewport: { width, height }, ...opts });
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	await p.goto(`${BASE}${path}`);
	return p;
}
const run = (vp, o) => open(`/campaigns/${camp}?step=run`, vp, o);
const build = (vp, o) => open(`/campaigns/${camp}?step=build`, vp, o);
const cy = (b) => b.y + b.height / 2;
const spread = (a) => Math.max(...a) - Math.min(...a);

test('run cards do not show subclass, ancestry or community; the sheet header does', async () => {
	const p = await run([1024, 768]);
	await p.waitForSelector('[data-testid=character-card]');
	assert.equal(await p.locator('[data-testid=character-card]').count(), 2);
	for (const k of ['subclass', 'ancestry', 'community'])
		assert.equal(await p.locator(`[data-testid=character-card] [data-testid=${k}]`).count(), 0, k);
	const s = await open(`/characters/${chars[0]}`, [1024, 768]);
	for (const k of ['subclass', 'ancestry', 'community'])
		assert.equal(await s.locator(`[data-testid=${k}]`).count(), 1, `sheet ${k}`);
});

test('character card: name and class/level on one row, then hp, stress, hope, armor, evasion, damage form', async () => {
	const p = await run([1024, 768]);
	await p.waitForSelector('[data-testid=character-card]');
	const cards = p.locator('[data-testid=character-card]');
	for (let i = 0; i < 2; i++) {
		const c = cards.nth(i);
		const r = await c.evaluate((card) => {
			const rc = (e) => e.getBoundingClientRect();
			const name = card.querySelector('[data-testid=character-name]');
			let node = null;
			const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
			for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.includes('Ranger')) { node = n; break; }
			const rg = document.createRange();
			rg.selectNodeContents(node);
			const top = (id) => rc(card.querySelector(`[data-testid=${id}]`)).y;
			const form = card.querySelector('form[action^="?/damage"]');
			return { nameY: rc(name).y + rc(name).height / 2, clsY: rc(rg).y + rc(rg).height / 2, nameBottom: rc(name).bottom,
				tops: ['hp', 'stress', 'hope', 'armor', 'evasion'].map(top), form: rc(form).y };
		});
		assert.ok(Math.abs(r.nameY - r.clsY) <= 6, `centres ${r.nameY} ${r.clsY}`);
		assert.ok(r.tops[0] > r.nameBottom - 1, 'hp below name row');
		for (let k = 1; k < r.tops.length; k++) assert.ok(r.tops[k] > r.tops[k - 1], `order ${r.tops}`);
		assert.ok(r.form > r.tops[4], `damage form below evasion ${r.form} ${r.tops[4]}`);
	}
});

const unit = (p, i = 0) => p.locator(`[data-testid=battle-unit][data-adversary=adv_giant_rat][data-index="${i}"]`);

test('battle unit controls stay inside the unit at 1024x768 (18rem sidebar, may wrap)', async () => {
	const p = await run([1024, 768]);
	const u = unit(p);
	await u.waitFor();
	const boxes = [];
	boxes.push(await u.locator('[lang]').first().boundingBox());
	for (const id of ['unit-hp', 'unit-damage', 'unit-hit', 'unit-hp-minus', 'unit-hp-plus'])
		boxes.push(await u.locator(`[data-testid=${id}]`).boundingBox());
	const ub = await u.boundingBox();
	for (const b of boxes)
		assert.ok(b.x >= ub.x - 1 && b.x + b.width <= ub.x + ub.width + 1, `control outside unit: ${JSON.stringify(b)} vs ${JSON.stringify(ub)}`);
});

test('battle units at 375x812: no horizontal scroll, 44x44 targets', async () => {
	const p = await run([375, 812]);
	await unit(p).waitFor();
	assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scroll');
	const over = await p.locator('[data-testid=battle-unit]').evaluateAll((l) => l.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
	assert.equal(over, 0, 'units overflow');
	for (const id of ['unit-hit', 'unit-hp-minus', 'unit-hp-plus']) {
		const b = await unit(p).locator(`[data-testid=${id}]`).boundingBox();
		assert.ok(b.width >= 43.5 && b.height >= 43.5, `${id} ${b.width}x${b.height}`);
	}
});

test('entering damage and hitting still changes unit-hp', async () => {
	const p = await open(`/campaigns/${camp}?step=run`, [1024, 768]);
	const u = p.locator('[data-testid=battle-unit][data-adversary=adv_acid_burrower]');
	await u.waitFor();
	assert.equal((await u.locator('[data-testid=unit-hp]').textContent()).trim(), '0/8');
	await u.locator('[data-testid=unit-damage]').fill('7');
	await u.locator('[data-testid=unit-hit]').click();
	await p.waitForFunction(() => document.querySelector('[data-testid=battle-unit][data-adversary=adv_acid_burrower] [data-testid=unit-hp]')?.textContent.trim() === '1/8');
});

test('build has no border and no padding', async () => {
	const p = await build([1024, 768]);
	await p.waitForSelector('[data-testid=build]');
	const s = await p.locator('[data-testid=build]').evaluate((e) => {
		const c = getComputedStyle(e);
		return [c.borderTopStyle, c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft];
	});
	assert.deepEqual(s, ['none', '0px', '0px', '0px', '0px']);
});

test('build-party 1/3 and build-scenes 2/3 side by side at 1024x768, stacked at 375x812', async () => {
	let p = await build([1024, 768]);
	await p.waitForSelector('[data-testid=build-party]');
	let a = await p.locator('[data-testid=build-party]').boundingBox();
	let b = await p.locator('[data-testid=build-scenes]').boundingBox();
	assert.ok(Math.abs(a.y - b.y) <= 2, `tops ${a.y} ${b.y}`);
	assert.ok(b.x >= a.x + a.width - 1, 'scenes right of party');
	const ratio = b.width / a.width;
	assert.ok(ratio > 1.7 && ratio < 2.3, `ratio ${ratio}`);
	p = await build([375, 812]);
	await p.waitForSelector('[data-testid=build-party]');
	a = await p.locator('[data-testid=build-party]').boundingBox();
	b = await p.locator('[data-testid=build-scenes]').boundingBox();
	assert.ok(b.y >= a.y + a.height - 1, 'stacked');
});

test('scene header is one row (title, status, status buttons, edit link) with the environment below at 1024x768', async () => {
	const p = await build([1024, 768]);
	await p.waitForSelector('[data-testid=scene]');
	const all = p.locator('[data-testid=scene]');
	assert.ok((await all.count()) >= 3);
	let withEnv = 0;
	for (let i = 0; i < (await all.count()); i++) {
		await openSceneMore(all.nth(i)); // US-341: environment sits in scene-more
		const r = await all.nth(i).evaluate((sc) => {
			const rc = (e) => e.getBoundingClientRect();
			const h3 = sc.querySelector('h3');
			let node = null;
			const w = document.createTreeWalker(h3 || sc, NodeFilter.SHOW_TEXT);
			for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim()) { node = n; break; }
			const rg = document.createRange();
			rg.selectNodeContents(node);
			const btns = [...sc.querySelectorAll('form[action^="?/status&"] button, [data-testid=scene-edit-open]')].map(rc);
			const env = sc.querySelector('[data-testid=scene-environment]');
			return { cys: [rc(rg), rc(sc.querySelector('[data-testid=scene-status]')), ...btns].map((b) => b.y + b.height / 2),
				n: btns.length, bottom: Math.max(...btns.map((b) => b.bottom)), env: env ? rc(env).y : null };
		});
		assert.ok(r.n >= 2, 'buttons');
		assert.ok(spread(r.cys) <= 8, `centres ${r.cys}`);
		if (r.env !== null) { withEnv++; assert.ok(r.env >= r.bottom - 1, `env ${r.env} below ${r.bottom}`); }
	}
	assert.ok(withEnv >= 1);
});

test('build page has no horizontal scroll at the four viewports', async () => {
	for (const vp of [[375, 812], [768, 1024], [1024, 768], [1180, 820]]) {
		const p = await build(vp);
		await p.waitForSelector('[data-testid=build]');
		assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `build ${vp}`);
		const r = await run(vp);
		await r.waitForSelector('[data-testid=run]');
		assert.ok(await r.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `run ${vp}`);
	}
});

test('without JavaScript, changing a scene status and deleting it end on ?step=build', async () => {
	const p = await build([1024, 768], { javaScriptEnabled: false });
	const sc = () => p.locator('[data-testid=scene]', { hasText: 'Zetaplain' });
	await Promise.all([p.waitForNavigation(), sc().locator('button[name=status][value=done]').click()]);
	assert.equal(new URL(p.url()).searchParams.get('step'), 'build');
	assert.equal(new URL(p.url()).searchParams.get('_'), null);
	assert.equal(await sc().getAttribute('data-status'), 'done');
	await openSceneMore(sc());
	await Promise.all([p.waitForNavigation(), sc().locator('form[action^="?/delete&"] button').click()]);
	assert.equal(new URL(p.url()).searchParams.get('step'), 'build');
	assert.equal(await sc().count(), 0);
});
