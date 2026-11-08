// us-217: tier 3 and 4 environments translated into French (completes the 19 environments).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^﻿/, ''));
const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const ALL = read('../../../src/lib/srd/environments.json').map((e) => ({ ...e, id: `env_${slug(e.name)}` }));
const EN = ALL.filter((e) => Number(e.tier) >= 3);
const FR = read('../../../src/lib/srd/fr/environments.json');
const STR = ['name', 'description', 'impulses', 'potential_adversaries'];
const numbers = (s) => (s.match(/\d+d\d+(\+\d+)?|\b\d+\b/g) ?? []).sort();
const frStrings = (e) => STR.filter((f) => typeof e[f] === 'string').map((f) => e[f]).concat((e.feature ?? []).flatMap((x) => [x.name, x.text, x.question].filter((v) => typeof v === 'string')));

test('there are 7 tier 3 and 4 environments (19 in all) and each has a complete French entry with the English shape', () => {
	assert.equal(EN.length, 7);
	assert.equal(ALL.length, 19);
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

test('the French name, description and impulses of every tier 3 and 4 environment differ from the English ones', () => {
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
			const frName = ADV[`adv_${slug(a.name)}`]?.name;
			if (frName && frName !== a.name && new RegExp(`(^|[^\\p{L}])${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(fr) && !fr.includes(frName)) bad.push(`${en.id}: ${a.name}`);
		}
	}
	assert.deepEqual(bad, []);
});

test('no French value in environments.json contains Hope, Fear, Spotlight or Countdown', () => {
	const bad = [];
	for (const en of ALL) {
		assert.ok(FR[en.id], `${en.id} missing`);
		for (const s of frStrings(FR[en.id])) {
			const m = s.match(/\b(Hope|Fear|Spotlight|Countdown)\b/);
			if (m) bad.push(`${en.id}: ${m[1]}`);
		}
	}
	assert.deepEqual(bad, []);
});

test('lang=fr: GET /api/srd/environments returns nameLang fr for all 19 environments', async () => {
	const r = await fetch(`${BASE}/api/srd/environments`, { headers: { cookie: 'lang=fr' } });
	assert.equal(r.status, 200);
	const list = await r.json();
	for (const e of ALL) {
		const item = list.find((x) => x.id === e.id);
		assert.ok(item, e.id);
		assert.equal(item.nameLang, 'fr', e.id);
		assert.equal(item.name, FR[e.id].name, e.id);
	}
});

test('lang=en: tier 3 and 4 environment names stay English', async () => {
	const list = await (await fetch(`${BASE}/api/srd/environments`, { headers: { cookie: 'lang=en' } })).json();
	for (const e of EN) assert.equal(list.find((x) => x.id === e.id)?.name, e.name);
});

test('TERMS.md still holds every row it had before', () => {
	const rows = (s) => s.split('\n').filter((l) => l.startsWith('|'));
	const now = new Set(rows(readFileSync(new URL('../../../src/lib/srd/fr/TERMS.md', import.meta.url), 'utf8')));
	const missing = rows(readFileSync(new URL('./terms.before.md', import.meta.url), 'utf8')).filter((l) => !now.has(l));
	assert.deepEqual(missing, []);
});
