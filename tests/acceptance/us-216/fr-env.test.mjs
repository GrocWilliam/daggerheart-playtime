// us-216: tier 1 and 2 environments translated into French.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^﻿/, ''));
const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const ALL = read('../../../src/lib/srd/environments.json').map((e) => ({ ...e, id: `env_${slug(e.name)}` }));
const EN = ALL.filter((e) => Number(e.tier) <= 2);
const FR = read('../../../src/lib/srd/fr/environments.json');
const STR = ['name', 'description', 'impulses', 'potential_adversaries'];
const numbers = (s) => (s.match(/\d+d\d+(\+\d+)?|\b\d+\b/g) ?? []).sort();
const frStrings = (e) => STR.filter((f) => typeof e[f] === 'string').map((f) => e[f]).concat((e.feature ?? []).flatMap((x) => [x.name, x.text, x.question].filter((v) => typeof v === 'string')));

test('there are 12 tier 1 and 2 environments and each has a complete French entry with the English shape', () => {
	assert.equal(EN.length, 12);
	const problems = [];
	for (const en of EN) {
		const fr = FR[en.id];
		if (!fr) { problems.push(`${en.id}: missing`); continue; }
		for (const f of STR) if (typeof en[f] === 'string' && en[f].trim() && (typeof fr[f] !== 'string' || !fr[f].trim())) problems.push(`${en.id}.${f}`);
		if (!Array.isArray(fr.feature) || fr.feature.length !== (en.feature ?? []).length) { problems.push(`${en.id}.feature length`); continue; }
		fr.feature.forEach((x, i) => {
			const e = en.feature[i];
			if (!x || typeof x.name !== 'string' || !x.name.trim() || typeof x.text !== 'string' || !x.text.trim()) problems.push(`${en.id}.feature[${i}]`);
			else if (e.question && (typeof x.question !== 'string' || !x.question.trim())) problems.push(`${en.id}.feature[${i}].question`);
		});
	}
	assert.deepEqual(problems, []);
});

test('French values keep every dice expression and number of the English text', () => {
	const problems = [];
	for (const en of EN) {
		const fr = FR[en.id];
		if (!fr) { problems.push(`${en.id}: missing`); continue; }
		const pairs = STR.filter((f) => typeof en[f] === 'string' && typeof fr[f] === 'string').map((f) => [en[f], fr[f], f]);
		(en.feature ?? []).forEach((x, i) => {
			const y = fr.feature?.[i];
			if (y) for (const k of ['name', 'text', 'question']) if (typeof x[k] === 'string' && typeof y[k] === 'string') pairs.push([x[k], y[k], `feature[${i}].${k}`]);
		});
		for (const [e, t, f] of pairs) {
			const have = numbers(t);
			for (const n of numbers(e)) if (!have.includes(n)) problems.push(`${en.id}.${f}: ${n}`);
		}
	}
	assert.deepEqual(problems, []);
});

test('the French name, description and impulses of every tier 1 and 2 environment differ from the English ones', () => {
	const same = EN.filter((en) => ['name', 'description', 'impulses'].some((f) => !FR[en.id]?.[f] || FR[en.id][f] === en[f])).map((e) => e.id);
	assert.deepEqual(same, []);
});

test('potential_adversaries use French adversary names from adversaries.json', () => {
	const ADV = read('../../../src/lib/srd/fr/adversaries.json');
	const advEn = read('../../../src/lib/srd/adversaries.json');
	const bad = [];
	for (const en of EN) {
		const fr = FR[en.id]?.potential_adversaries;
		if (typeof fr !== 'string') { bad.push(`${en.id}: missing`); continue; }
		for (const a of advEn) {
			const id = `adv_${slug(a.name)}`;
			// An English name present in the English list must be replaced by its French name when that differs.
			const frName = ADV[id]?.name;
			if (frName && frName !== a.name && new RegExp(`(^|[^\\p{L}])${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(fr) && !fr.includes(frName)) bad.push(`${en.id}: ${a.name}`);
		}
	}
	assert.deepEqual(bad, []);
});

test('no French value of a tier 1 or 2 environment contains Hope, Fear, Spotlight or Countdown', () => {
	const bad = [];
	for (const en of EN) {
		assert.ok(FR[en.id], `${en.id} missing`);
		for (const s of frStrings(FR[en.id])) {
			const m = s.match(/\b(Hope|Fear|Spotlight|Countdown)\b/);
			if (m) bad.push(`${en.id}: ${m[1]}`);
		}
	}
	assert.deepEqual(bad, []);
});

test('GET /api/srd/environments/env_abandoned_grove: French name with lang=fr, English with lang=en', async () => {
	const get = async (lang) => (await fetch(`${BASE}/api/srd/environments/env_abandoned_grove`, { headers: { cookie: `lang=${lang}` } })).json();
	const fr = await get('fr');
	assert.ok(fr.name && fr.name !== 'Abandoned Grove');
	assert.equal(fr.name, FR.env_abandoned_grove.name);
	assert.equal(fr.type, 'Exploration');
	assert.equal(String(fr.tier), '1');
	const en = await get('en');
	assert.equal(en.name, 'Abandoned Grove');
});

test('TERMS.md still holds every row it had before', () => {
	const rows = (s) => s.split('\n').filter((l) => l.startsWith('|'));
	const now = new Set(rows(readFileSync(new URL('../../../src/lib/srd/fr/TERMS.md', import.meta.url), 'utf8')));
	const missing = rows(readFileSync(new URL('./terms.before.md', import.meta.url), 'utf8')).filter((l) => !now.has(l));
	assert.deepEqual(missing, []);
});

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });
const api = async (method, path, body) => {
	const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie: 'lang=fr' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
const langsOf = (root, text) => root.evaluate((el, text) => {
	const out = [];
	const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let n = w.nextNode(); n; n = w.nextNode()) {
		if (!n.textContent.includes(text)) continue;
		const l = n.parentElement.closest('[lang]');
		out.push(l && l !== document.documentElement && l !== document.body ? l.getAttribute('lang') : null);
	}
	return out;
}, text);

test('lang=fr: scene-environment and current-scene show the French name, impulses and features in lang="fr"', async () => {
	const c = (await api('POST', '/api/campaigns', { name: 'Envcamp' })).json;
	const s = (await api('POST', `/api/campaigns/${c.id}/scenes`, { title: 'Clairiere', environmentId: 'env_abandoned_grove' })).json;
	await api('PATCH', `/api/campaigns/${c.id}/scenes/${s.id}`, { status: 'current' });
	const fr = FR.env_abandoned_grove;
	assert.ok(fr, 'env_abandoned_grove translated');
	for (const [url, scope] of [[`/campaigns/${c.id}?step=build`, '[data-testid=scene] [data-testid=scene-environment]'], [`/campaigns/${c.id}`, '[data-testid=current-scene] [data-testid=scene-environment]']]) {
		const ctx = await browser.newContext();
		await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
		const p = await ctx.newPage();
		p.setDefaultTimeout(8000);
		assert.equal((await p.goto(BASE + url)).status(), 200);
		const box = p.locator(scope).first();
		assert.equal(await box.count(), 1, scope);
		const checks = [fr.name, fr.impulses, ...fr.feature.map((f) => f.name.trim())];
		for (const text of checks) {
			const l = await langsOf(box, text);
			assert.ok(l.length > 0 && l.every((x) => x === 'fr'), `${scope}: "${text}" -> ${JSON.stringify(l)}`);
		}
		await ctx.close();
	}
});
