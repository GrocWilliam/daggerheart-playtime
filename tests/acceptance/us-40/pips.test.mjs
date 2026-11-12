import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(process.env.PW_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const VIEWPORTS = [['phone', 375, 667], ['desktop', 1280, 800]];
const LANGS = ['en', 'fr'];
const HEX = { '--danger': '#ee8070', '--accent': '#d4a050', '--teal': '#6cc3b5', '--muted': '#b9b08f' };
const rgb = (hex) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const COLOR = { hp: '--danger', stress: '--accent', hope: '--teal', armor: '--muted', fear: '--danger' };
const TRACKERS = ['hp', 'stress', 'hope', 'armor'];

async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body)
	});
	const json = res.status === 204 ? null : await res.json();
	assert.ok(res.status < 300, `${method} ${path}: ${res.status}`);
	return json;
}

let browser, campaignPath, chars = [], states = {}, fear;
before(async () => {
	const camp = await api('POST', '/api/campaigns', { name: 'Pips campaign' });
	await api('POST', `/api/campaigns/${camp.id}/fear`, { delta: 3 });
	const setups = [
		{ maxHp: 6, maxStress: 5, armorSlots: 2, hp: 6, stress: 3, hope: 2, armor: 1 }, // Vulnerable, Down
		{ maxHp: 8, maxStress: 6, armorSlots: 3, hp: 2, stress: 0, hope: 4, armor: 0 }, // Restrained
		{ maxHp: 4, maxStress: 7, armorSlots: 4, hp: 0, stress: 7, hope: 0, armor: 3 } // Hidden
	];
	for (let i = 0; i < 3; i++) {
		const s = setups[i];
		const ch = await api('POST', `/api/campaigns/${camp.id}/characters`, {
			name: `Hero ${i}`, class: 'Guardian', level: 2, evasion: 10, majorThreshold: 5,
			severeThreshold: 10, maxHp: s.maxHp, maxStress: s.maxStress, armorSlots: s.armorSlots
		});
		await api('PUT', `/api/characters/${ch.id}/conditions`, {
			vulnerable: i === 0, restrained: i === 1, hidden: i === 2
		});
		for (const t of TRACKERS) if (s[t]) await api('POST', `/api/characters/${ch.id}/${t}`, { delta: s[t] });
		chars.push(ch.id);
	}
	for (const id of chars) {
		const c = await api('GET', `/api/characters/${id}`);
		states[id] = {
			hp: [c.hp.max, c.hp.marked], stress: [c.stress.max, c.stress.marked],
			hope: [6, c.hope], armor: [c.armor.max, c.armor.marked]
		};
	}
	// sanity: the seed really produces varied values
	assert.ok(states[chars[1]].hp[1] === 2 && states[chars[0]].hp[1] === 6, JSON.stringify(states));
	const camp2 = await api('GET', `/api/campaigns/${camp.id}`);
	fear = camp2.fear;
	assert.equal(fear, 3);
	campaignPath = `/campaigns/${camp.id}`;
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function withPage(path, w, h, lang, fn) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	const requests = [];
	page.on('request', (r) => requests.push(r.url()));
	try {
		await page.goto(BASE + path, { waitUntil: 'networkidle' });
		return await fn(page, requests);
	} finally { await ctx.close(); }
}
async function eachCombo(paths, fn) {
	for (const [path, name] of paths)
		for (const [vp, w, h] of VIEWPORTS)
			for (const lang of LANGS)
				await withPage(path, w, h, lang, (page, reqs) => fn(page, `${name} ${vp} ${lang}`, reqs));
}
const campaign = () => [[campaignPath, 'campaign']];
const sheets = () => chars.map((id, i) => [`/characters/${id}`, `sheet${i}`]);
const allPages = () => [['/', 'home'], ...campaign(), ...sheets()];

// Collects, in each scope (card i / sheet / campaign), the pips element description of each tracker.
const COLLECT = `(() => {
	const describe = (el) => {
		if (!el) return null;
		const cs = getComputedStyle(el);
		return {
			ariaHidden: el.getAttribute('aria-hidden'), fontSize: cs.fontSize, text: el.textContent,
			slots: [...el.children].map((c) => {
				const s = getComputedStyle(c), r = c.getBoundingClientRect();
				return {
					cls: c.className, w: r.width, h: r.height, bg: s.backgroundColor,
					borders: ['Top', 'Right', 'Bottom', 'Left'].map((x) => [s['border' + x + 'Width'], s['border' + x + 'Style'], s['border' + x + 'Color']])
				};
			})
		};
	};
	const q = (root, id) => describe(root.querySelector('[data-testid="' + id + '-pips"]'));
	const names = ['hp', 'stress', 'hope', 'armor'];
	const cards = [...document.querySelectorAll('[data-testid="character-card"]')].map((card) => ({
		name: card.querySelector('[data-testid="character-name"]').textContent,
		pips: Object.fromEntries(names.map((n) => [n, q(card, n)]))
	}));
	return {
		cards,
		sheet: Object.fromEntries(names.map((n) => [n, q(document, n)])),
		fear: q(document, 'fear'),
		counts: Object.fromEntries([...names, 'fear'].map((n) => [n, document.querySelectorAll('[data-testid="' + n + '-pips"]').length]))
	};
})()`;

const stateOf = (name) => states[chars[Number(name.replace('Hero ', ''))]];

test('pips elements appear on each character card, the character sheet and the campaign page (fear), with aria-hidden, 16px font-size and no text', async () => {
	await eachCombo(campaign(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		assert.equal(d.cards.length, 3, id);
		for (const c of d.cards) for (const t of TRACKERS) {
			assert.ok(c.pips[t], `${id} ${c.name} ${t}-pips`);
			assert.equal(c.pips[t].ariaHidden, 'true', `${id} ${t}`);
			assert.equal(c.pips[t].fontSize, '16px', `${id} ${t}`);
			assert.equal(c.pips[t].text, '', `${id} ${t} contains text`);
		}
		for (const t of TRACKERS) assert.equal(d.counts[t], 3, `${id} ${t}-pips count`);
		assert.ok(d.fear, `${id} fear-pips`);
		assert.equal(d.fear.ariaHidden, 'true', id);
		assert.equal(d.fear.fontSize, '16px', id);
		assert.equal(d.fear.text, '', id);
		assert.equal(d.counts.fear, 1, id);
	});
	await eachCombo(sheets(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		for (const t of TRACKERS) {
			assert.equal(d.counts[t], 1, `${id} ${t}-pips count`);
			assert.ok(d.sheet[t], `${id} ${t}-pips`);
			assert.equal(d.sheet[t].ariaHidden, 'true', `${id} ${t}`);
			assert.equal(d.sheet[t].fontSize, '16px', `${id} ${t}`);
			assert.equal(d.sheet[t].text, '', `${id} ${t}`);
		}
		assert.equal(d.counts.fear, 0, `${id} no fear-pips on the sheet`);
	});
	await eachCombo([['/', 'home']], async (page, id) => {
		const d = await page.evaluate(COLLECT);
		for (const k of Object.keys(d.counts)) assert.equal(d.counts[k], 0, `${id} ${k}-pips on home`);
	});
});

const classes = (s) => s.cls.split(/\s+/);
function checkSlots(p, [max, filled], id) {
	assert.ok(p, id);
	assert.equal(p.slots.length, max, `${id}: slot count`);
	for (const [i, s] of p.slots.entries()) {
		assert.ok(classes(s).includes('pip'), `${id}: child ${i} has class pip`);
		assert.equal(classes(s).includes('filled'), i < filled, `${id}: child ${i} filled state (expected ${filled} filled)`);
	}
}

test('each pips element has one .pip per slot and its first filled children also have .filled (hp, stress, hope, armor, fear 12)', async () => {
	await eachCombo(campaign(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		for (const c of d.cards) for (const t of TRACKERS) checkSlots(c.pips[t], stateOf(c.name)[t], `${id} ${c.name} ${t}`);
		checkSlots(d.fear, [12, fear], `${id} fear`);
	});
	await eachCombo(sheets(), async (page, id, ) => {
		const d = await page.evaluate(COLLECT);
		const st = states[chars[Number(id.match(/sheet(\d)/)[1])]];
		for (const t of TRACKERS) checkSlots(d.sheet[t], st[t], `${id} ${t}`);
	});
});

function eachPip(d, fn) {
	for (const c of d.cards) for (const t of TRACKERS) fn(c.pips[t], t, c.name);
}

test('a filled pip is at least 10x10 px with the tracker colour as background', async () => {
	const check = (p, t, id) => {
		const filled = p.slots.filter((s) => classes(s).includes('filled'));
		for (const s of filled) {
			assert.ok(s.w >= 10 && s.h >= 10, `${id} ${t}: size ${s.w}x${s.h}`);
			assert.equal(s.bg, rgb(HEX[COLOR[t]]), `${id} ${t}: background`);
		}
	};
	await eachCombo(campaign(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		eachPip(d, (p, t, n) => check(p, t, `${id} ${n}`));
		check(d.fear, 'fear', `${id}`);
	});
	await eachCombo(sheets(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		for (const t of TRACKERS) check(d.sheet[t], t, id);
	});
});

test('an empty pip has a transparent background and a 1px border of the tracker colour', async () => {
	const check = (p, t, id) => {
		const empty = p.slots.filter((s) => !classes(s).includes('filled'));
		for (const s of empty) {
			assert.ok(['rgba(0, 0, 0, 0)', 'transparent'].includes(s.bg), `${id} ${t}: background ${s.bg}`);
			for (const b of s.borders)
				assert.deepEqual(b.map((x, i) => (i === 1 ? x !== 'none' && x !== 'hidden' : x)),
					['1px', true, rgb(HEX[COLOR[t]])], `${id} ${t}: border ${b}`);
		}
	};
	await eachCombo(campaign(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		eachPip(d, (p, t, n) => check(p, t, `${id} ${n}`));
		check(d.fear, 'fear', id);
	});
	await eachCombo(sheets(), async (page, id) => {
		const d = await page.evaluate(COLLECT);
		for (const t of TRACKERS) check(d.sheet[t], t, id);
	});
});

// For each tracker value span: its text, the buttons of its form, and the pips element's position.
const LAYOUT = `(() => {
	const out = [];
	for (const t of ['hp', 'stress', 'hope', 'armor', 'fear']) {
		for (const span of document.querySelectorAll('[data-testid="' + t + '"]')) {
			const scope = span.closest('[data-testid="character-card"]') || document;
			const pips = scope.querySelector('[data-testid="' + t + '-pips"]');
			const form = span.closest('form');
			const btns = [...form.querySelectorAll('button:not([data-testid^="help-"])')];
			const r = (e) => e.getBoundingClientRect();
			out.push({
				t, text: span.textContent, buttons: btns.length, pips: !!pips,
				spanBottom: r(span).bottom, spanTop: r(span).top,
				btnBottom: Math.max(...btns.map((b) => r(b).bottom)),
				btnTop: Math.min(...btns.map((b) => r(b).top)),
				pipsTop: pips ? r(pips).top : null, pipsH: pips ? r(pips).height : null
			});
		}
	}
	return out;
})()`;

test('value text and − / + buttons are unchanged and the pips sit on their own line below them', async () => {
	const verify = (rows, id, expect) => {
		for (const [i, r] of rows.entries()) {
			assert.equal(r.buttons, 2, `${id} ${r.t}: buttons`);
			assert.ok(r.pips, `${id} ${r.t}: pips present`);
			if (r.t === 'fear') assert.equal(r.text, String(fear), id);
			else {
				const e = expect(r.t, i);
				assert.equal(r.text, r.t === 'hope' ? String(e[1]) : `${e[1]}/${e[0]}`, `${id} ${r.t} text`);
			}
			assert.ok(r.pipsH > 0, `${id} ${r.t}: pips visible`);
			// us-301 and spec #298 (Fear bar): every tracker's pips share its row (Tracker.svelte), Fear's included.
			// value and buttons still on one line
			assert.ok(r.spanTop < r.btnBottom && r.btnTop < r.spanBottom, `${id} ${r.t}: value and buttons on one line`);
		}
	};
	await eachCombo(campaign(), async (page, id) => {
		const rows = await page.evaluate(LAYOUT);
		assert.equal(rows.length, 13, id);
		verify(rows.filter((r) => r.t === 'fear'), id, null);
		// card trackers are listed per tracker then per card: map index -> card
		for (const t of TRACKERS) {
			const rs = rows.filter((r) => r.t === t);
			verify(rs, id, (tr, i) => states[chars[i]][tr]);
		}
	});
	await eachCombo(sheets(), async (page, id) => {
		const rows = await page.evaluate(LAYOUT);
		assert.equal(rows.length, 4, id);
		const st = states[chars[Number(id.match(/sheet(\d)/)[1])]];
		verify(rows, id, (t) => st[t]);
	});
});

test('no horizontal overflow and no external request with the pips', async () => {
	await eachCombo(allPages(), async (page, id, reqs) => {
		const o = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
		assert.ok(o[0] <= o[1], `${id}: scrollWidth ${o[0]} > ${o[1]}`);
		const external = reqs.filter((u) => /^https?:/.test(u) && new URL(u).origin !== BASE);
		assert.deepEqual(external, [], id);
	});
});
