// us-218 HTTP/browser tests: French domain cards through the API and the reference help.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const BASE = process.env.BASE_URL;
const CARDS = JSON.parse(readFileSync(new URL('../../../src/lib/srd/core/domain-cards.json', import.meta.url), 'utf8'));
const get = async (lang, id) => {
	const r = await fetch(`${BASE}/api/srd/domain-cards/${id}`, { headers: { cookie: `lang=${lang}` } });
	assert.equal(r.status, 200, id);
	return r.json();
};
const texts = (v, out = []) => {
	if (typeof v === 'string') out.push(v);
	else if (Array.isArray(v)) v.forEach((x) => texts(x, out));
	else if (v && typeof v === 'object') Object.values(v).forEach((x) => texts(x, out));
	return out;
};
const codex = CARDS.filter((c) => c.domain === 'CODEX');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

test('fr GET /api/srd/domain-cards/<CODEX id>: French features under en-US keys, English shape, domain/level/recallCost unchanged', async () => {
	for (const c of codex) {
		const en = await get('en', c.id);
		const fr = await get('fr', c.id);
		assert.equal(fr.domain, 'CODEX');
		assert.equal(fr.level, c.level);
		assert.equal(fr.recallCost, c.recallCost);
		assert.equal(fr.features.length, c.features.length);
		const shape = (v) => (typeof v === 'string' ? 's' : Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : v);
		assert.deepEqual(shape(fr.features), shape(en.features), `${c.id} features shape`);
		assert.ok(JSON.stringify(fr.features).includes('"en-US"') || JSON.stringify(en.features).includes('"en-US"') === false, 'en-US keys');
		const enT = texts(en.features), frT = texts(fr.features);
		assert.equal(frT.length, enT.length);
		frT.forEach((t, i) => { if (enT[i].split(/\s+/).length > 4) assert.notEqual(t, enT[i], `${c.id} text ${i} translated`); });
	}
});

test('fr /reference: help of a CODEX card shows its lines with lang="fr"', async () => {
	const c = codex[0];
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'lang', value: 'fr', url: BASE }]);
	const p = await ctx.newPage();
	const r = await p.goto(`${BASE}/reference?kind=domain-cards&q=${encodeURIComponent(c.name['en-US'])}`);
	assert.equal(r.status(), 200);
	const details = p.locator(`[data-testid="ref-domain-cards"] [data-testid="ref-item"] details[data-testid="help"][data-help="${c.id}"]`);
	assert.equal(await details.count(), 1);
	const lines = await details.evaluate((d) =>
		[...d.querySelectorAll('[lang]')].filter((e) => !e.closest('summary') && !e.querySelector('[lang]')).map((e) => ({ lang: e.getAttribute('lang'), text: e.textContent.trim() })).filter((l) => l.text));
	assert.ok(lines.length >= 2, JSON.stringify(lines));
	for (const l of lines) assert.equal(l.lang, 'fr', JSON.stringify(l));
	await ctx.close();
});
