import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const TRACKERS = ['hp', 'stress', 'hope', 'armor'];
const VIEWPORTS = [
	['small phone', 320, 568],
	['phone', 375, 667],
	['tablet portrait', 768, 1024],
	['tablet landscape', 1024, 768],
	['desktop', 1280, 800]
];

async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const json = await res.json();
	assert.ok(res.status < 300, `${method} ${path}: ${res.status}`);
	return json;
}

let browser;
let campaignPath;
let characterPath;

before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Tracker campaign' });
	for (let i = 0; i < 3; i++) {
		const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
			name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
			severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 2
		});
		await api('PATCH', `/api/characters/${ch.id}`, { notes: 'n'.repeat(500) });
		for (let j = 0; j < 3; j++) {
			await api('POST', `/api/characters/${ch.id}/items`, { name: `Item ${i}-${j}`, quantity: j + 1 });
		}
		characterPath ??= `/characters/${ch.id}`;
	}
	campaignPath = `/campaigns/${camp.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

// Returns, per scope (each character-card, or the whole page when no card), per tracker,
// the boxes of the first and last button of the value's form, and of the value.
async function measure(path, w, h, cardScope) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	try {
		await page.goto(BASE + path, { waitUntil: 'networkidle' });
		return await page.evaluate(({ trackers, cardScope }) => {
			const scopes = cardScope
				? [...document.querySelectorAll('[data-testid="character-card"]')]
				: [document];
			const box = (e) => {
				const r = e.getBoundingClientRect();
				return { l: r.left, r: r.right, cy: r.top + r.height / 2, w: r.width, h: r.height };
			};
			return scopes.map((scope) =>
				trackers.map((key) => {
					const value = scope.querySelector(`[data-testid="${key}"]`);
					if (!value) return { key, missing: true };
					let p = value.parentElement;
					while (p && p.querySelectorAll('button').length < 2) p = p.parentElement;
					const btns = p ? [...p.querySelectorAll('button')] : [];
					return {
						key,
						value: box(value),
						minus: btns[0] && box(btns[0]),
						plus: btns.length > 1 && box(btns[btns.length - 1]),
						labels: btns.map((b) => b.textContent.trim())
					};
				})
			);
		}, { trackers: TRACKERS, cardScope });
	} finally { await ctx.close(); }
}

function check(results, where, kind) {
	assert.ok(results.length > 0, `${where}: no scope found`);
	for (const scope of results) {
		for (const t of scope) {
			const id = `${where} ${t.key}`;
			assert.ok(!t.missing && t.minus && t.plus && t.value.w > 0, `${id}: tracker not rendered`);
			if (kind === 'line') {
				for (const [n, b] of [['-', t.minus], ['+', t.plus]]) {
					const d = Math.abs(b.cy - t.value.cy);
					assert.ok(d <= 8, `${id}: ${n} button centre differs from value by ${d.toFixed(1)}px`);
				}
			} else {
				assert.ok(t.minus.r <= t.value.l + 0.5, `${id}: - button (right ${t.minus.r}) not left of value (left ${t.value.l})`);
				assert.ok(t.plus.l >= t.value.r - 0.5, `${id}: + button (left ${t.plus.l}) not right of value (right ${t.value.r})`);
			}
		}
	}
}

for (const [kind, title] of [
	['line', 'for each tracker the - button, value and + button have vertical centres within 8px'],
	['order', 'the - button is left of the value and the + button right of it']
]) {
	test(`${title} on every character-card of the campaign page at every viewport`, async () => {
		for (const [name, w, h] of VIEWPORTS) {
			check(await measure(campaignPath, w, h, true), `campaign ${name} ${w}x${h}`, kind);
		}
	});
	test(`${title} on the character page at every viewport`, async () => {
		for (const [name, w, h] of VIEWPORTS) {
			check(await measure(characterPath, w, h, false), `character ${name} ${w}x${h}`, kind);
		}
	});
}
