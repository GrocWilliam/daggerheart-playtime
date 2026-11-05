import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
let browser, camp, ch;
before(async () => {
	browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
	const post = async (p, b) => (await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
	camp = await post('/api/campaigns', { name: 'Camp' });
	ch = await post(`/api/campaigns/${camp.id}/characters`, { name: 'Ayla', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 });
});
after(async () => { await browser?.close(); });

const pages = () => ['/', '/reference', `/characters/${ch.id}`, `/campaigns/${camp.id}`];

test('divider follows the h1 on home, reference, character and campaign pages', async () => {
	for (const path of pages()) {
		const p = await browser.newPage();
		await p.goto(BASE + path);
		const r = await p.evaluate(() => {
			const h1 = document.querySelector('h1');
			const d = document.querySelector('[data-testid=divider]');
			if (!h1 || !d) return { missing: true };
			const after = !!(h1.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
			const sections = [...document.querySelectorAll('main section, main article, main form, main h2')];
			const sectionBetween = sections.some((s) => (h1.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && (s.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) && !s.contains(d) && !s.contains(h1));
			const svg = d.tagName.toLowerCase() === 'svg' ? d : d.querySelector('svg');
			const cls = svg ? [svg, ...svg.querySelectorAll('*')].map((e) => e.getAttribute('class') || '').join(' ') : '';
			return { after, sectionBetween, aria: d.getAttribute('aria-hidden'), hasSvg: !!svg, accent: /(fill|stroke)-accent/.test(cls) };
		});
		assert.ok(!r.missing, `${path}: h1 and divider present`);
		assert.ok(r.after, `${path}: divider after h1`);
		assert.ok(!r.sectionBetween, `${path}: no other section between h1 and divider`);
		assert.equal(r.aria, 'true', `${path}: aria-hidden`);
		assert.ok(r.hasSvg, `${path}: svg`);
		assert.ok(r.accent, `${path}: accent class`);
		await p.close();
	}
});

test('exactly one sigil in the header, aria-hidden, before the nav links', async () => {
	for (const path of [...pages(), '/?lang=fr']) {
		const p = await browser.newPage();
		await p.goto(BASE + path);
		assert.equal(await p.locator('[data-testid=sigil]').count(), 1, path);
		const r = await p.evaluate(() => {
			const s = document.querySelector('[data-testid=sigil]');
			const header = document.querySelector('header');
			const a = header?.querySelector('nav a');
			return { inHeader: !!header?.contains(s), aria: s.getAttribute('aria-hidden'), before: !!a && !!(s.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING), svg: s.tagName.toLowerCase() === 'svg' || !!s.querySelector('svg') };
		});
		assert.ok(r.inHeader, `${path}: in header`);
		assert.equal(r.aria, 'true');
		assert.ok(r.before, `${path}: before nav links`);
		assert.ok(r.svg, `${path}: svg`);
		await p.close();
	}
});

test('character sheet has campaign-run-link to the campaign run step', async () => {
	const p = await browser.newPage();
	await p.goto(`${BASE}/characters/${ch.id}`);
	const l = p.locator('[data-testid=campaign-run-link]');
	assert.equal(await l.count(), 1);
	assert.equal(await l.getAttribute('href'), `/campaigns/${camp.id}?step=run`);
	assert.ok((await l.textContent()).trim().length > 0);
	await p.close();
});

test('no style= attribute or <style> block in svelte files', () => {
	const walk = (d) => readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : [q]; });
	for (const f of walk('src').filter((f) => f.endsWith('.svelte'))) {
		const s = readFileSync(f, 'utf8');
		assert.ok(!/<style[\s>]/.test(s), `${f} has <style>`);
		assert.ok(!/\sstyle=/.test(s), `${f} has style=`);
	}
	assert.ok(statSync('src/lib/components/Divider.svelte').isFile());
});
