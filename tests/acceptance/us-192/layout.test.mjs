import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser, cid;
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	const api = async (method, path, body) => {
		const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		return r.json().catch(() => null);
	};
	cid = (await api('POST', '/api/campaigns', { name: 'Tabletcamp' })).id;
	for (const name of ['Alyndra', 'Brom', 'Cyra'])
		await api('POST', `/api/campaigns/${cid}/characters`, { name, class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3 });
	const a = await api('POST', `/api/campaigns/${cid}/scenes`, { title: 'Alphaglade' });
	await api('POST', `/api/campaigns/${cid}/scenes`, { title: 'Betahollow' });
	await fetch(BASE + `/api/campaigns/${cid}/scenes/${a.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'current' }) });
});
after(async () => { await browser?.close(); });

const VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];

async function open(step, [width, height]) {
	const ctx = await browser.newContext({ viewport: { width, height } });
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	await p.goto(`${BASE}/campaigns/${cid}?step=${step}`);
	await p.waitForSelector(`[data-testid=${step === 'run' ? 'run' : 'build'}]`);
	return p;
}
const box = (p, id) => p.locator(`[data-testid=${id}]`).first().boundingBox();
const cards = async (p) => {
	const l = p.locator('[data-testid=character-card]');
	assert.equal(await l.count(), 3);
	return Promise.all([0, 1, 2].map((i) => l.nth(i).boundingBox()));
};

for (const step of ['run', 'build']) {
	for (const vp of VIEWPORTS) {
		test(`${step} step at ${vp.join('x')}: no horizontal scroll, 44px targets, 16px inputs, visible controls`, async () => {
			const p = await open(step, vp);
			const r = await p.evaluate(() => {
				const rect = (e) => e.getBoundingClientRect();
				const els = [...document.querySelectorAll('a, button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, summary')]
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
		});
	}
}

test('run at 375x812: one column for current-scene, party and journal', async () => {
	const p = await open('run', [375, 812]);
	const xs = [];
	for (const id of ['current-scene', 'party', 'journal']) xs.push((await box(p, id)).x);
	for (const x of xs) assert.ok(Math.abs(x - xs[0]) <= 2, `lefts ${xs}`);
	const cs = await cards(p);
	assert.deepEqual(new Set(cs.map((c) => Math.round(c.x))).size, 1, 'party single column');
});

test('run at 768x1024: 2-column party first, then scene, then journal', async () => {
	const p = await open('run', [768, 1024]);
	const s = await box(p, 'current-scene'), party = await box(p, 'party'), j = await box(p, 'journal');
	assert.ok(s.y >= party.y + party.height - 1, 'scene below party');
	const cs = await cards(p);
	assert.ok(cs.some((a, i) => cs.some((b, k) => k !== i && Math.abs(a.y - b.y) <= 2 && Math.abs(a.x - b.x) > 2)), 'two cards on one row');
	assert.ok(j.y >= s.y + s.height - 1, 'journal below scene');
});

for (const vp of [[1024, 768], [1180, 820]]) {
	test(`run at ${vp.join('x')}: party left, scene and journal in the right column`, async () => {
		const p = await open('run', vp);
		const s = await box(p, 'current-scene'), j = await box(p, 'journal'), party = await box(p, 'party');
		assert.ok(Math.abs(s.x - j.x) <= 2, `scene/journal lefts ${s.x} ${j.x}`);
		assert.ok(party.x + party.width <= s.x + 2, 'party is left of the aside');
		assert.ok(j.y >= s.y + s.height - 1, 'journal below scene');
	});
}

for (const vp of [[768, 1024], [1024, 768]]) {
	test(`build at ${vp.join('x')}: party one third left, scenes two thirds right`, async () => {
		const p = await open('build', vp);
		const a = await box(p, 'build-party'), b = await box(p, 'build-scenes');
		assert.ok(Math.abs(a.y - b.y) <= 2, `tops ${a.y} ${b.y}`);
		assert.ok(a.x < b.x, 'party on the left');
		const ratio = a.width / (a.width + b.width);
		assert.ok(ratio >= 0.25 && ratio <= 0.4, `ratio ${ratio}`);
	});
}

test('build at 375x812: scenes stack below the party', async () => {
	const p = await open('build', [375, 812]);
	const a = await box(p, 'build-party'), b = await box(p, 'build-scenes');
	assert.ok(b.y >= a.y + a.height - 1, `${b.y} vs ${a.y + a.height}`);
});
