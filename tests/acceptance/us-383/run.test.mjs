import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { runStepUrl, sheetUrl } from '../support/pages.mjs';
import { setupAlignCampaign, setupDownAndVulnerable, setupSixHp, cardOf, cardHeader, classLineText, levelHelpCount, hpTops,
	cardInner, conditionLayout, cardBoxes, sidewaysScroll, characterMarkedHp, applyDamage } from '../support/runstep.mjs';

const BASE = process.env.BASE_URL;
let browser, align, cond, six;
before(async () => {
	browser = await launchBrowser();
	align = await setupAlignCampaign(BASE);
	cond = await setupDownAndVulnerable(BASE);
	six = await setupSixHp(BASE);
});
after(async () => { await browser?.close(); });
const run = (c, vp, opts) => openPage(browser, runStepUrl(BASE, c.campaignId), vp, opts);

test('English: name and down share a centre, "Guardian · level 1" starts below the name in 14px muted text', async () => {
	const p = await run(cond, [1024, 768]);
	const card = cardOf(p, 'Brom');
	const h = await cardHeader(card);
	assert.notEqual(h.down, null);
	assert.ok(Math.abs(h.name - h.down) <= 8, JSON.stringify(h));
	assert.ok(h.metaTop >= h.nameBottom - 1, JSON.stringify(h));
	assert.equal(h.fontSize, '14px');
	assert.equal(h.color, 'rgb(185, 176, 143)');
	assert.equal(await classLineText(card, 'Guardian'), 'Guardian · level 1');
	await closePage(p);
});

test('French: the French class name and "niveau 1" on the line below the name', async () => {
	const p = await run(cond, [1024, 768], { lang: 'fr' });
	const card = cardOf(p, 'Brom');
	const h = await cardHeader(card, 'Gardien');
	assert.ok(h.metaTop >= h.nameBottom - 1, JSON.stringify(h));
	assert.equal(await classLineText(card, 'Gardien'), 'Gardien · niveau 1');
	await closePage(p);
});

for (const lang of ['en', 'fr'])
	test(`no level helper on Run cards in ${lang}, exactly one on the sheet`, async () => {
		const p = await run(cond, [1024, 768], { lang });
		const n = await p.getByTestId('character-card').count();
		assert.ok(n >= 2);
		for (let i = 0; i < n; i++) assert.equal(await levelHelpCount(p.getByTestId('character-card').nth(i)), 0, `card ${i}`);
		await closePage(p);
		const s = await openPage(browser, sheetUrl(BASE, cond.brom, 'play'), [1024, 768], { lang });
		assert.equal(await levelHelpCount(s), 1);
		await closePage(s);
	});

for (const lang of ['en', 'fr'])
	for (const vp of [[1024, 768], [1280, 900]])
		test(`cards in one visual row align their hp tracker at ${vp.join('x')} in ${lang}`, async () => {
			const p = await run(align, vp, { lang });
			const cs = await hpTops(p);
			assert.equal(cs.length, 3);
			let pairs = 0;
			for (let i = 0; i < cs.length; i++)
				for (let j = i + 1; j < cs.length; j++)
					if (Math.abs(cs[i].top - cs[j].top) <= 2) { pairs++; assert.ok(Math.abs(cs[i].hp - cs[j].hp) <= 1, `${JSON.stringify(cs)}`); }
			assert.ok(pairs >= 1, 'at least two cards share a row');
			await closePage(p);
		});

for (const lang of ['en', 'fr'])
	test(`375x812 in ${lang}: one column, no sideways scroll, long name and class line inside the card`, async () => {
		const p = await run(align, [375, 812], { lang });
		const bs = await cardBoxes(p);
		assert.equal(bs.length, 3);
		for (const b of bs) assert.ok(Math.abs(b.x - bs[0].x) <= 1, 'one column');
		for (let i = 1; i < bs.length; i++) assert.ok(bs[i].y >= bs[i - 1].y + bs[i - 1].height - 1, 'stacked');
		assert.ok((await sidewaysScroll(p)) <= 0);
		const i = await cardInner(cardOf(p, 'Kael'));
		assert.ok(i.name.left >= i.left - 1 && i.name.right <= i.right + 1, JSON.stringify(i));
		assert.ok(i.cls.left >= i.left - 1 && i.cls.right <= i.right + 1, JSON.stringify(i));
		await closePage(p);
	});

test('without a condition each card is at most 440px tall at 1024x768', async () => {
	const p = await run(align, [1024, 768]);
	for (const b of await cardBoxes(p)) assert.ok(b.height <= 440, `height ${b.height}`);
	await closePage(p);
});

test('Vulnerable shows above hp and below the class/level line', async () => {
	const p = await run(cond, [1024, 768]);
	const l = await conditionLayout(cardOf(p, 'Dara'));
	assert.notEqual(l.vulnTop, undefined);
	assert.ok(l.vulnTop >= l.classBottom - 1, JSON.stringify(l));
	assert.ok(l.vulnBottom <= l.hpTop + 1, JSON.stringify(l));
	await closePage(p);
});

test('without JavaScript, damage 3 on a 6 HP card with thresholds 5/10 marks 1 HP', async () => {
	const p = await run(six, [1024, 768], { js: false });
	const before = await characterMarkedHp(BASE, six.id);
	await applyDamage(cardOf(p, 'Sixy'), 3);
	await p.waitForLoadState('load');
	assert.equal(await characterMarkedHp(BASE, six.id), before + 1);
	assert.equal(await characterMarkedHp(BASE, six.id), 1);
	await closePage(p);
});

test('docs/ui.md: character-card text says own line, no level Help, aligned first tracker, keeps 440px', () => {
	const doc = readFileSync('docs/ui.md', 'utf8');
	const bullet = doc.split('\n').find((l) => l.startsWith('- `character-card`'));
	assert.ok(bullet, 'character-card bullet');
	assert.match(bullet, /own line/i);
	assert.match(bullet, /no (level )?`?Help`?/i);
	assert.match(bullet, /first tracker/i);
	assert.match(doc, /440px/);
});
