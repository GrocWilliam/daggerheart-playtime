// us-213: tier 2 adversaries translated into French.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^﻿/, ''));
const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const ALL = read('../../../src/lib/srd/adversaries.json').map((a) => ({ ...a, id: `adv_${slug(a.name)}` }));
const EN = ALL.filter((a) => Number(a.tier) === 2);
const FR = read('../../../src/lib/srd/fr/adversaries.json');
const STR = ['name', 'description', 'motives_and_tactics', 'attack'];
const numbers = (s) => (s.match(/\d+d\d+(\+\d+)?|\b\d+\b/g) ?? []).sort();
const frStrings = (e) => [...STR, 'experience'].filter((f) => typeof e[f] === 'string').map((f) => e[f]).concat((e.feature ?? []).flatMap((x) => [x.name, x.text]));

test('there are 36 tier 2 adversaries and each has a complete French entry with the English shape', () => {
	assert.equal(EN.length, 36);
	assert.equal(ALL.filter((a) => Number(a.tier) <= 2).length, 88);
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
		if (!fr) { problems.push(`${en.id}: missing`); continue; }
		const pairs = [...STR, 'experience'].filter((f) => typeof en[f] === 'string' && typeof fr[f] === 'string').map((f) => [en[f], fr[f], f]);
		(en.feature ?? []).forEach((x, i) => { const y = fr.feature?.[i]; if (y) pairs.push([x.name, y.name, `feature[${i}].name`], [x.text, y.text, `feature[${i}].text`]); });
		for (const [e, t, f] of pairs) {
			const have = numbers(t);
			for (const n of numbers(e)) if (!have.includes(n)) problems.push(`${en.id}.${f}: ${n}`);
		}
	}
	assert.deepEqual(problems, []);
});

test('the French name and description of every tier 2 adversary differ from the English ones', () => {
	const same = EN.filter((en) => !FR[en.id]?.name || !FR[en.id]?.description || FR[en.id].name === en.name || FR[en.id].description === en.description).map((a) => a.id);
	assert.deepEqual(same, []);
});

test('no French value of a tier 2 adversary contains Hope, Fear, Spotlight, Countdown or Hit Points', () => {
	const bad = [];
	for (const en of EN) {
		assert.ok(FR[en.id], `${en.id} missing`);
		for (const s of frStrings(FR[en.id])) {
			const m = s.match(/\b(Hope|Fear|Spotlight|Countdown|Hit Points)\b/);
			if (m) bad.push(`${en.id}: ${m[1]}`);
		}
	}
	assert.deepEqual(bad, []);
});

test("lang=fr: list GET /api/srd/adversaries has nameLang 'fr' for tiers 1 to 3 and 'en' for tier 4", async () => {
	const get = async (lang) => (await fetch(`${BASE}/api/srd/adversaries`, { headers: { cookie: `lang=${lang}` } })).json();
	const fr = await get('fr');
	const tierOf = new Map(ALL.map((a) => [a.id, Number(a.tier)]));
	for (const t of [1, 2, 3, 4]) assert.ok(ALL.some((a) => Number(a.tier) === t));
	for (const a of fr) {
		const t = tierOf.get(a.id);
		assert.ok(t, `known id ${a.id}`);
		assert.equal(a.nameLang, t <= 3 ? 'fr' : 'en', `${a.id} (tier ${t})`);
	}
	for (const id of tierOf.keys()) assert.ok(fr.some((a) => a.id === id), `${id} listed`);
});

test('TERMS.md still holds every row it had before', () => {
	const rows = (s) => s.split('\n').filter((l) => l.startsWith('|'));
	const now = new Set(rows(readFileSync(new URL('../../../src/lib/srd/fr/TERMS.md', import.meta.url), 'utf8')));
	const missing = rows(readFileSync(new URL('./terms.before.md', import.meta.url), 'utf8')).filter((l) => !now.has(l));
	assert.deepEqual(missing, []);
});
