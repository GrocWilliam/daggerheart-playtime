import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT;
const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	assert.ok(r.status < 300, `${method} ${path} -> ${r.status} ${await r.clone().text()}`);
	return r.json();
};

let S;
async function setup() {
	if (S) return S;
	const camp = (await api('POST', '/api/campaigns', { name: 'Forms Camp' })).id;
	const ch = (await api('POST', `/api/campaigns/${camp}/characters`, {
		name: 'Lina', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 5, maxStress: 6, armorSlots: 3
	})).id;
	const sc = (await api('POST', `/api/campaigns/${camp}/scenes`, { title: 'Scene une', environmentId: 'env_abandoned_grove' })).id;
	await api('PATCH', `/api/campaigns/${camp}/scenes/${sc}`, { status: 'current' });
	await api('POST', `/api/campaigns/${camp}/scenes/${sc}/encounter`, { partySize: 3, tier: 1, seed: 5 });
	await api('POST', `/api/campaigns/${camp}/scenes/${sc}/loot`, { table: 'items', rarity: 'common' });
	return (S = { camp, ch });
}
async function open(path, w = 1024, h = 768) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const p = await ctx.newPage();
	p.setDefaultTimeout(10000);
	const r = await p.goto(BASE + path);
	assert.equal(r.status(), 200, path);
	return { ctx, p };
}
async function paths() {
	const { camp, ch } = await setup();
	return [[`/characters/${ch}`, 'sheet'], [`/campaigns/${camp}?step=run`, 'run'], [`/campaigns/${camp}?step=build`, 'build']];
}

test('forms outside dialogs have no box and a 12px bottom margin', async () => {
	for (const [path, name] of await paths()) {
		const { ctx, p } = await open(path);
		const bad = await p.evaluate(() => {
			const forms = [...document.querySelectorAll('form')].filter((f) => !f.closest('dialog'));
			const out = [];
			for (const f of forms) {
				const s = getComputedStyle(f);
				const got = [s.backgroundColor, s.borderTopStyle, s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft, s.marginBottom].join('|');
				if (got !== 'rgba(0, 0, 0, 0)|none|0px|0px|0px|0px|12px') out.push(`${f.getAttribute('action') ?? f.className}: ${got}`);
			}
			return { n: forms.length, out };
		});
		assert.ok(bad.n > 0, `${name} has forms`);
		assert.deepEqual(bad.out, [], name);
		await ctx.close();
	}
});

test('app.css has a form rule with only margin-bottom: 0.75rem and stays under 150 lines', () => {
	const css = readFileSync(join(ROOT, 'src/app.css'), 'utf8');
	assert.ok(css.split('\n').length < 150);
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const rules = [...stripped.matchAll(/(?:^|[}\s;])form\s*\{([^}]*)\}/g)].map((m) => m[1]);
	assert.ok(rules.length >= 1, 'form rule exists');
	for (const body of rules) {
		const decls = body.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean);
		assert.deepEqual(decls, ['margin-bottom: 0.75rem']);
	}
});

test('character-card, encounter-adversary and loot-entry keep the double 3px border and a surface background', async () => {
	const { camp } = await setup();
	const { ctx, p } = await open(`/campaigns/${camp}?step=run`);
	for (const id of ['character-card', 'encounter-adversary', 'loot-entry']) {
		const loc = p.locator(`[data-testid="${id}"]`);
		await loc.first().waitFor();
		const rows = await loc.evaluateAll((els) => els.map((e) => {
			const s = getComputedStyle(e);
			return [s.borderTopStyle, s.borderTopWidth, s.backgroundColor];
		}));
		assert.ok(rows.length > 0, id);
		for (const [style, width, bg] of rows) {
			assert.equal(style, 'double', id);
			assert.equal(width, '3px', id);
			assert.ok(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', `${id} bg ${bg}`);
		}
	}
	await ctx.close();
});

test('the modal-campaign panel keeps the surface background', async () => {
	const { ctx, p } = await open('/?new=campaign');
	const d = p.locator('[data-testid="modal-campaign"]');
	await d.waitFor({ state: 'visible' });
	const bg = await d.evaluate((e) => {
		const own = getComputedStyle(e).backgroundColor;
		if (own !== 'rgba(0, 0, 0, 0)') return own;
		const inner = e.firstElementChild;
		return inner ? getComputedStyle(inner).backgroundColor : own;
	});
	const surface = await p.evaluate(() => {
		const t = document.createElement('div');
		t.className = 'bg-surface';
		document.body.append(t);
		const c = getComputedStyle(t).backgroundColor;
		t.remove();
		return c;
	});
	assert.ok(bg !== 'rgba(0, 0, 0, 0)');
	assert.equal(bg, 'rgb(26, 42, 34)');
	assert.ok(surface === 'rgba(0, 0, 0, 0)' || surface === bg);
	await ctx.close();
});

test('h2 on the sheet and DM screen have margin 16px top and 8px bottom', async () => {
	for (const [path, name] of await paths()) {
		const { ctx, p } = await open(path);
		const r = await p.evaluate(() => {
			const hs = [...document.querySelectorAll('h2')].filter((h) => !h.closest('dialog') && h.getClientRects().length > 0);
			return { n: hs.length, bad: hs.map((h) => { const s = getComputedStyle(h); return `${h.textContent.trim()}: ${s.marginTop}/${s.marginBottom}`; }).filter((x) => !x.endsWith(': 16px/8px')) };
		});
		assert.ok(r.n > 0, `${name} has h2`);
		assert.deepEqual(r.bad, [], name);
		await ctx.close();
	}
});

test('no file under src contains rounded-none!', () => {
	const hits = [];
	const walk = (d) => {
		for (const f of readdirSync(d)) {
			const p = join(d, f);
			if (statSync(p).isDirectory()) walk(p);
			else if (readFileSync(p, 'utf8').includes('rounded-none!')) hits.push(p);
		}
	};
	walk(join(ROOT, 'src'));
	assert.deepEqual(hits, []);
});

test('exactly one divider on the sheet, directly after the h1', async () => {
	const { ch } = await setup();
	const { ctx, p } = await open(`/characters/${ch}`);
	assert.equal(await p.locator('[data-testid="divider"]').count(), 1);
	assert.equal(await p.evaluate(() => document.querySelector('h1').nextElementSibling?.getAttribute('data-testid')), 'divider');
	await ctx.close();
});

for (const [w, h] of [[375, 812], [1024, 768]]) {
	test(`no horizontal scroll and 44px targets at ${w}x${h}`, async () => {
		for (const [path, name] of await paths()) {
			const { ctx, p } = await open(path, w, h);
			const r = await p.evaluate(() => {
				const small = [...document.querySelectorAll('a, button, input, select, summary')]
					.filter((e) => !e.closest('dialog:not([open])') && !(e.type === 'hidden') && !e.closest('[popover]:not(:popover-open)') && e.getClientRects().length > 0)
					.filter((e) => { const b = (['checkbox', 'radio'].includes(e.type) && e.closest('label') ? e.closest('label') : e).getBoundingClientRect(); return b.width < 43.5 || b.height < 43.5; })
					.map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('data-testid') ?? e.name ?? ''}] ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
				return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, small };
			});
			assert.ok(r.sw <= r.iw, `${name} scrollWidth ${r.sw} > ${r.iw}`);
			assert.deepEqual(r.small, [], `${name} small targets`);
			await ctx.close();
		}
	});
}
