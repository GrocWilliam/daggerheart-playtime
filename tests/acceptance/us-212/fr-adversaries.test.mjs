// us-212: tier 1 adversaries translated into French.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^﻿/, ''));
const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const EN = read('../../../src/lib/srd/adversaries.json').filter((a) => Number(a.tier) <= 1).map((a) => ({ ...a, id: `adv_${slug(a.name)}` }));
const FR = read('../../../src/lib/srd/fr/adversaries.json');
const STR = ['name', 'description', 'motives_and_tactics', 'attack'];
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const get = async (path, lang) => {
	const r = await fetch(BASE + path, { headers: { cookie: `lang=${lang}` } });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const numbers = (s) => (s.match(/\d+d\d+(\+\d+)?|\b\d+\b/g) ?? []).sort();
const frStrings = (e) => [...STR, 'experience'].filter((f) => typeof e[f] === 'string').map((f) => e[f]).concat((e.feature ?? []).flatMap((x) => [x.name, x.text]));

test('there are 52 tier 1 adversaries and each has a complete French entry with the English shape', () => {
	assert.equal(EN.length, 52);
	const problems = [];
	for (const en of EN) {
		const fr = FR[en.id];
		if (!fr) { problems.push(`${en.id}: missing`); continue; }
		for (const f of STR) if (typeof fr[f] !== 'string' || !fr[f].trim()) problems.push(`${en.id}.${f}`);
		if (en.experience && (typeof fr.experience !== 'string' || !fr.experience.trim())) problems.push(`${en.id}.experience`);
		if (!Array.isArray(fr.feature) || fr.feature.length !== (en.feature ?? []).length) { problems.push(`${en.id}.feature length`); continue; }
		fr.feature.forEach((x, i) => {
			if (!x || typeof x.name !== 'string' || !x.name.trim() || typeof x.text !== 'string' || !x.text.trim()) problems.push(`${en.id}.feature[${i}]`);
		});
	}
	assert.deepEqual(problems, []);
});

test('French values keep every dice expression and number of the English text', () => {
	const problems = [];
	for (const en of EN) {
		const fr = FR[en.id];
		if (!fr) continue;
		const pairs = [...STR, 'experience'].filter((f) => typeof en[f] === 'string' && typeof fr[f] === 'string').map((f) => [en[f], fr[f], f]);
		(en.feature ?? []).forEach((x, i) => { const y = fr.feature?.[i]; if (y) pairs.push([x.name, y.name, `feature[${i}].name`], [x.text, y.text, `feature[${i}].text`]); });
		for (const [e, t, f] of pairs) {
			const have = numbers(t);
			for (const n of numbers(e)) if (!have.includes(n)) problems.push(`${en.id}.${f}: ${n}`);
		}
	}
	assert.deepEqual(problems, []);
});

test('the French description of every tier 1 adversary differs from the English one', () => {
	const same = EN.filter((en) => FR[en.id]?.description === undefined || FR[en.id].description === en.description).map((a) => a.id);
	assert.deepEqual(same, []);
});

test('no French value of a tier 1 adversary contains Hope, Fear, Spotlight, Countdown or Hit Points', () => {
	const bad = [];
	for (const en of EN) for (const s of frStrings(FR[en.id] ?? {})) {
		const m = s.match(/\b(Hope|Fear|Spotlight|Countdown|Hit Points)\b/);
		if (m) bad.push(`${en.id}: ${m[1]}`);
	}
	assert.deepEqual(bad, []);
});

test('lang=fr: GET /api/srd/adversaries/adv_acid_burrower is French, other fields English; lang=en stays English', async () => {
	const en = (await get('/api/srd/adversaries/adv_acid_burrower', 'en')).json;
	assert.equal(en.name, 'Acid Burrower');
	const r = await get('/api/srd/adversaries/adv_acid_burrower', 'fr');
	assert.equal(r.status, 200);
	const fr = r.json;
	assert.ok(fr.name && fr.name !== 'Acid Burrower', `French name, got ${fr.name}`);
	assert.equal(fr.nameLocalized, fr.name);
	for (const k of ['type', 'tier', 'difficulty', 'thresholds', 'hp', 'stress', 'atk', 'range', 'damage']) assert.deepEqual(fr[k], en[k], k);
	assert.equal(fr.feature.length, en.feature.length);
});

test('lang=fr: every tier 1 adversary is served with its French name', async () => {
	for (const en of EN) {
		const r = (await get(`/api/srd/adversaries/${en.id}`, 'fr')).json;
		assert.equal(r.name, FR[en.id]?.name, en.id);
	}
});

test('lang=fr: /reference shows the French name and feature lines of adv_acid_burrower inside lang="fr" elements', async () => {
	const fr = FR.adv_acid_burrower;
	assert.ok(fr, 'overlay entry');
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	p.setDefaultTimeout(8000);
	await p.goto(`${BASE}/reference?kind=adversaries&q=${encodeURIComponent(fr.name)}`);
	const item = p.locator('[data-testid="ref-adversaries"] [data-testid="ref-item"]').filter({ has: p.locator('details[data-testid="help"][data-help="adv_acid_burrower"]') });
	assert.equal(await item.count(), 1);
	await item.locator('details[data-testid="help"] > summary').click();
	const langsOf = (text) => item.evaluate((el, text) => {
		const out = [];
		const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			if (!n.textContent.replace(/\s+/g, ' ').includes(text)) continue;
			out.push(n.parentElement.closest('[lang]')?.getAttribute('lang') ?? null);
		}
		return out;
	}, text);
	const nl = await langsOf(fr.name);
	assert.ok(nl.length > 0 && nl.every((l) => l === 'fr'), `name langs ${JSON.stringify(nl)}`);
	for (const f of fr.feature) {
		const l = await langsOf(f.name);
		assert.ok(l.length > 0 && l.every((x) => x === 'fr'), `feature ${f.name}: ${JSON.stringify(l)}`);
	}
	await ctx.close();
});

test('TERMS.md still holds every row it had before', () => {
	const rows = (s) => s.split('\n').filter((l) => l.startsWith('|'));
	const now = new Set(rows(readFileSync(new URL('../../../src/lib/srd/fr/TERMS.md', import.meta.url), 'utf8')));
	const missing = rows(readFileSync(new URL('./terms.before.md', import.meta.url), 'utf8')).filter((l) => !now.has(l));
	assert.deepEqual(missing, []);
});
