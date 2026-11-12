import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BASE = process.env.BASE_URL;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
const send = (m, p, body) =>
	fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ok = async (r, status = 200) => {
	const text = await r.text();
	assert.equal(r.status, status, text);
	return JSON.parse(text);
};

const L = {
	en: {
		title: 'Level up', none: 'Nothing to choose here.', level: /level/i, prof: 'Proficiency',
		steps: ['Tier achievements', 'Advancements', 'Details', 'Domain card', 'Review'], next: 'Next', back: 'Back', cancel: 'Cancel'
	},
	fr: {
		title: 'Monter de niveau', none: 'Rien à choisir ici.', level: /niveau/i, prof: 'Maîtrise',
		steps: ['Accomplissements de palier', 'Progressions', 'Précisions', 'Carte de domaine', 'Récapitulatif'], next: 'Suivant', back: 'Retour', cancel: 'Annuler'
	}
};
const LANGS = ['en', 'fr'];

let browser, campaign;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function create(extra = {}) {
	campaign ??= (await ok(await send('POST', '/api/campaigns', { name: 'US288' }), 201)).id;
	return ok(
		await send('POST', `/api/campaigns/${campaign}/characters`, {
			name: 'Rook', class: 'Guardian', level: 1, evasion: 9, majorThreshold: 5, severeThreshold: 10,
			maxHp: 7, armorSlots: 3,
			traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
			...extra
		}), 201);
}
const character = async (id) => ok(await send('GET', `/api/characters/${id}`));
const plan = async (id) => ok(await send('GET', `/api/characters/${id}/level-up`));

/** A level 1 Guardian with two Experiences at +2. */
async function levelOne() {
	const c = await create();
	for (const name of ['Bodyguard', 'Blacksmith'])
		await ok(await send('POST', `/api/characters/${c.id}/experiences`, { name, modifier: 2 }), 201);
	return c;
}

/** A Guardian created at level 1 and levelled through the API to level 4 (Proficiency 2). */
async function levelFour() {
	const c = await create();
	const picks = {
		2: [{ option: 'hp' }, { option: 'stress' }],
		3: [{ option: 'hp' }, { option: 'stress' }],
		4: [{ option: 'evasion' }, { option: 'traits', traits: ['agility', 'strength'] }]
	};
	for (let lvl = 2; lvl <= 4; lvl++) {
		const p = await plan(c.id);
		assert.equal(p.toLevel, lvl);
		const body = { advancements: picks[lvl], domainCard: p.cards[0].id };
		if (p.achievements.experience) body.newExperience = `Lore ${lvl}`;
		await ok(await send('POST', `/api/characters/${c.id}/level-up`, body));
	}
	const after = await character(c.id);
	assert.equal(after.level, 4);
	return after;
}

async function open(lang, { width = 1024, js = false } = {}) {
	const ctx = await browser.newContext({ viewport: { width, height: 800 }, javaScriptEnabled: js });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	ctx.setDefaultTimeout(15000);
	return { ctx, page: await ctx.newPage() };
}
const flowUrl = (id, q = 'step=1') => `${BASE}/characters/${id}/level-up?${q}`;
const stepOf = (page) => new URL(page.url()).searchParams.get('step');
async function next(page, step) {
	await page.locator('[data-testid=levelup-next]').click();
	await page.waitForURL((u) => u.pathname.endsWith('/level-up') && u.searchParams.get('step') === String(step));
}
const values = async (sel) => (await sel.locator('option').evaluateAll((os) => os.map((o) => o.value))).filter((v) => v !== '');
const norm = (s) => s.replace(/[\s  ]+/g, ' ');
async function noOverflow(page, label) {
	const r = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
	assert.ok(r.s <= r.c, `${label}: scrollWidth ${r.s} > clientWidth ${r.c}`);
}
async function checkProgress(page, lang, step) {
	const prog = page.locator('[data-testid=levelup-progress]');
	const text = await prog.innerText();
	for (const s of L[lang].steps) assert.ok(text.includes(s), `progress lacks ${s}: ${text}`);
	assert.equal((await prog.locator('[aria-current=step]').innerText()).trim(), L[lang].steps[step - 1]);
}

/**
 * Walks the level 1 → 2 flow from step 1 to step 5 without confirming; `each(step)` runs on every step.
 * Returns the chosen domain card's label (its name in the page language).
 */
async function walkLevelTwo(page, id, each = async () => {}) {
	await page.goto(flowUrl(id));
	await each(1);
	await page.locator('input[name=newExperience]').fill('Brawler');
	await next(page, 2);
	await each(2);
	await page.locator('select[name=pick1]').selectOption('traits');
	await page.locator('select[name=pick2]').selectOption('experiences');
	await next(page, 3);
	await each(3);
	await page.locator('select[name=p1trait1]').selectOption('agility');
	await page.locator('select[name=p1trait2]').selectOption('knowledge');
	const exps = await values(page.locator('select[name=p2exp1]'));
	assert.equal(exps.length, 2, `experience options ${exps}`);
	await page.locator('select[name=p2exp1]').selectOption(exps[0]);
	await page.locator('select[name=p2exp2]').selectOption(exps[1]);
	await next(page, 4);
	await each(4);
	const card = page.locator('select[name=domainCard]');
	const cardId = (await values(card))[0];
	const cardName = await card.locator(`option[value="${cardId}"]`).getAttribute('label');
	assert.ok(cardName, 'domain card option has a label attribute');
	await card.selectOption(cardId);
	await next(page, 5);
	await each(5);
	return cardName;
}

for (const lang of LANGS) {
	test(`sheet of a level 3 SRD-class character shows the level-up link to step 1 in ${lang}`, async () => {
		const c = await create({ level: 3 });
		const { ctx, page } = await open(lang);
		await page.goto(`${BASE}/characters/${c.id}`);
		const link = page.locator('[data-testid=level-up]');
		assert.equal(await link.count(), 1);
		assert.equal(await link.getAttribute('href'), `/characters/${c.id}/level-up?step=1`);
		assert.equal((await link.innerText()).trim(), L[lang].title);
		await ctx.close();
	});

	test(`sheet of a level 10 character and of a non-SRD class character shows no level-up link in ${lang}`, async () => {
		const ten = await create({ level: 10 });
		const odd = await create({ level: 3, class: 'Chronomancer' });
		const { ctx, page } = await open(lang);
		for (const c of [ten, odd]) {
			await page.goto(`${BASE}/characters/${c.id}`);
			await page.locator('[data-testid=character-name]').waitFor();
			assert.equal(await page.locator('[data-testid=level-up]').count(), 0, c.class);
		}
		await ctx.close();
	});

	test(`without JavaScript a level 1 character levels up to 2 through the five steps in ${lang}`, async () => {
		const c = await levelOne();
		const { ctx, page } = await open(lang);
		await page.goto(`${BASE}/characters/${c.id}`);
		await page.locator('[data-testid=level-up]').click();
		await page.waitForURL((u) => u.pathname === `/characters/${c.id}/level-up`);
		const cardName = await walkLevelTwo(page, c.id, async (step) => {
			assert.equal(stepOf(page), String(step));
			assert.equal(await page.locator('h1').filter({ hasText: L[lang].title }).count(), 1, `heading on step ${step}`);
			await checkProgress(page, lang, step);
			assert.equal(await page.locator('[data-testid=levelup-cancel]').getAttribute('href'), `/characters/${c.id}`);
		});
		const summary = norm(await page.locator('[data-testid=levelup-summary]').innerText());
		assert.match(summary, new RegExp(`${L[lang].level.source}\\D*1\\D+2\\b`, 'i'), summary);
		assert.match(summary, new RegExp(`${L[lang].prof}\\D*1\\D+2\\b`), summary);
		const confirm = page.locator('[data-testid=levelup-confirm]');
		assert.equal((await confirm.innerText()).trim(), L[lang].title);
		await confirm.click();
		await page.waitForURL((u) => u.pathname === `/characters/${c.id}`);

		assert.match(norm(await page.locator('body').innerText()), new RegExp(`${L[lang].level.source} 2\\b`, 'i'));
		assert.match(await page.locator('[data-testid=proficiency]').innerText(), /\b2\b/);
		// Spec #298: traits and experiences live on the sheet's traits tab, cards on the cards tab.
		await page.goto(`${BASE}/characters/${c.id}?tab=traits`);
		for (const t of ['agility', 'knowledge']) assert.equal(await page.locator(`[data-testid=trait-marked-${t}]`).count(), 1, t);
		assert.equal(await page.locator('[data-testid=experience]').filter({ hasText: 'Brawler +2' }).count(), 1);
		await page.goto(`${BASE}/characters/${c.id}?tab=cards`);
		assert.equal(await page.locator('[data-testid=card]').filter({ hasText: cardName }).count(), 1, cardName);
		const after = await character(c.id);
		assert.equal(after.level, 2);
		assert.equal(after.proficiency, 2);
		await ctx.close();
	});

	test(`from level 3 step 1 shows nothing to choose and Next continues to step 2 in ${lang}`, async () => {
		const c = await create({ level: 3 });
		const { ctx, page } = await open(lang);
		await page.goto(flowUrl(c.id));
		assert.ok((await page.locator('body').innerText()).includes(L[lang].none));
		assert.equal(await page.locator('input[name=newExperience]').count(), 0);
		assert.equal((await page.locator('[data-testid=levelup-next]').innerText()).trim(), L[lang].next);
		await next(page, 2);
		assert.equal(await page.locator('select[name=pick1]').count(), 1);
		await ctx.close();
	});
}

test('at level 1 to 2 the step 2 selects list neither proficiency nor subclass', async () => {
	const c = await levelOne();
	const { ctx, page } = await open('en');
	await page.goto(flowUrl(c.id, 'step=2&newExperience=Brawler'));
	assert.equal(stepOf(page), '2');
	for (const name of ['pick1', 'pick2']) {
		const v = await values(page.locator(`select[name=${name}]`));
		assert.ok(v.includes('traits') && v.includes('hp'), `${name}: ${v}`);
		assert.ok(!v.includes('proficiency'), `${name}: ${v}`);
		assert.ok(!v.includes('subclass'), `${name}: ${v}`);
	}
	const label = await page.locator('select[name=pick1] option[value=hp]').evaluate((o) => o.label || o.textContent);
	assert.ok(label.includes('One more HP slot'), label);
	await ctx.close();
});

test('at level 4 to 5 pick1 lists proficiency and pick2 does not', async () => {
	const c = await levelFour();
	const { ctx, page } = await open('en');
	await page.goto(flowUrl(c.id, 'step=2&newExperience=Sailor'));
	assert.equal(stepOf(page), '2');
	assert.ok((await values(page.locator('select[name=pick1]'))).includes('proficiency'));
	assert.ok(!(await values(page.locator('select[name=pick2]'))).includes('proficiency'));
	const label = await page.locator('select[name=pick1] option[value=proficiency]').evaluate((o) => o.label || o.textContent);
	assert.ok(label.includes('+1 Proficiency (costs both advancements)'), label);
	await ctx.close();
});

for (const lang of LANGS) {
	test(`pick1=proficiency at 4 to 5 skips the details and the sheet then shows Proficiency 4 in ${lang}`, async () => {
		const c = await levelFour();
		assert.equal(c.proficiency, 2);
		const { ctx, page } = await open(lang);
		await page.goto(flowUrl(c.id));
		await page.locator('input[name=newExperience]').fill('Sailor');
		await next(page, 2);
		await page.locator('select[name=pick1]').selectOption('proficiency');
		await next(page, 3);
		assert.ok((await page.locator('body').innerText()).includes(L[lang].none));
		await next(page, 4);
		const card = page.locator('select[name=domainCard]');
		await card.selectOption((await values(card))[0]);
		await next(page, 5);
		await page.locator('[data-testid=levelup-confirm]').click();
		await page.waitForURL((u) => u.pathname === `/characters/${c.id}`);
		assert.match(await page.locator('[data-testid=proficiency]').innerText(), /\b4\b/);
		assert.equal((await character(c.id)).proficiency, 4);
		await ctx.close();
	});
}

test('step 3 without pick1 redirects to step 2 with invalid=pick1 and an alert', async () => {
	const c = await levelOne();
	const r = await fetch(flowUrl(c.id, 'step=3&newExperience=Brawler'), { redirect: 'manual' });
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.pathname, `/characters/${c.id}/level-up`);
	assert.equal(loc.searchParams.get('step'), '2');
	assert.equal(loc.searchParams.get('invalid'), 'pick1');
	const { ctx, page } = await open('en');
	await page.goto(flowUrl(c.id, 'step=3&newExperience=Brawler'));
	assert.equal(stepOf(page), '2');
	await page.locator('[role=alert]').first().waitFor();
	await ctx.close();
});

test('step 2 at a new level 2 without newExperience redirects to step 1 with invalid=newExperience and an alert', async () => {
	const c = await levelOne();
	const r = await fetch(flowUrl(c.id, 'step=2'), { redirect: 'manual' });
	assert.equal(r.status, 303);
	const loc = new URL(r.headers.get('location'), BASE);
	assert.equal(loc.searchParams.get('step'), '1');
	assert.equal(loc.searchParams.get('invalid'), 'newExperience');
	const { ctx, page } = await open('en');
	await page.goto(flowUrl(c.id, 'step=2'));
	assert.equal(stepOf(page), '1');
	await page.locator('[role=alert]').first().waitFor();
	assert.equal(await page.locator('input[name=newExperience]').count(), 1);
	await ctx.close();
});

for (const lang of LANGS) {
	test(`levelup-cancel leads to the sheet with nothing changed in ${lang}`, async () => {
		const c = await levelOne();
		const before = await character(c.id);
		const { ctx, page } = await open(lang);
		await page.goto(flowUrl(c.id));
		await page.locator('input[name=newExperience]').fill('Brawler');
		await next(page, 2);
		await page.locator('select[name=pick1]').selectOption('traits');
		await page.locator('select[name=pick2]').selectOption('hp');
		await next(page, 3);
		const cancel = page.locator('[data-testid=levelup-cancel]');
		assert.equal((await cancel.innerText()).trim(), L[lang].cancel);
		await cancel.click();
		await page.waitForURL((u) => u.pathname === `/characters/${c.id}`);
		const now = await character(c.id);
		assert.equal(now.level, 1);
		assert.equal(now.proficiency, before.proficiency);
		assert.deepEqual(now.experiences.map((e) => [e.name, e.modifier]), before.experiences.map((e) => [e.name, e.modifier]));
		assert.equal(now.hp.max, before.hp.max);
		assert.deepEqual(now.traits, before.traits);
		await ctx.close();
	});

	test(`levelup-back returns to the previous step with the values kept in ${lang}`, async () => {
		const c = await levelOne();
		const { ctx, page } = await open(lang);
		await page.goto(flowUrl(c.id));
		await page.locator('input[name=newExperience]').fill('Brawler');
		await next(page, 2);
		await page.locator('select[name=pick1]').selectOption('traits');
		await page.locator('select[name=pick2]').selectOption('experiences');
		await next(page, 3);
		const back = page.locator('[data-testid=levelup-back]');
		assert.equal((await back.innerText()).trim(), L[lang].back);
		await back.click();
		await page.waitForURL((u) => u.searchParams.get('step') === '2');
		assert.equal(await page.locator('select[name=pick1]').inputValue(), 'traits');
		assert.equal(await page.locator('select[name=pick2]').inputValue(), 'experiences');
		await page.locator('[data-testid=levelup-back]').click();
		await page.waitForURL((u) => u.searchParams.get('step') === '1');
		assert.equal(await page.locator('input[name=newExperience]').inputValue(), 'Brawler');
		await ctx.close();
	});
}

test('the level-up page of a level 10 character redirects to the sheet', async () => {
	const c = await create({ level: 10 });
	const r = await fetch(`${BASE}/characters/${c.id}/level-up`, { redirect: 'manual' });
	assert.equal(r.status, 303);
	assert.equal(new URL(r.headers.get('location'), BASE).pathname, `/characters/${c.id}`);
	const { ctx, page } = await open('en');
	await page.goto(`${BASE}/characters/${c.id}/level-up?step=1`);
	assert.equal(new URL(page.url()).pathname, `/characters/${c.id}`);
	await ctx.close();
});

test('the level-up page of an unknown character answers 404', async () => {
	const r = await fetch(`${BASE}/characters/00000000-0000-4000-8000-000000000000/level-up?step=1`, { redirect: 'manual' });
	assert.equal(r.status, 404);
});

for (const lang of LANGS) {
	test(`no level-up page text or option contains multiclass in ${lang}`, async () => {
		const { ctx, page } = await open(lang);
		const check = async (label) => {
			const html = (await page.content()).toLowerCase();
			assert.ok(!html.includes('multiclass'), `${label} mentions multiclass`);
		};
		const c = await levelOne();
		await walkLevelTwo(page, c.id, (step) => check(`1→2 step ${step}`));
		const four = await levelFour();
		await page.goto(flowUrl(four.id, 'step=2&newExperience=Sailor'));
		await check('4→5 step 2');
		await page.goto(flowUrl(four.id, 'step=3&newExperience=Sailor&pick1=card&pick2=hp'));
		assert.equal(stepOf(page), '3');
		await check('4→5 step 3');
		await ctx.close();
	});

	test(`every level-up step has no horizontal overflow at 360px in ${lang}`, async () => {
		const c = await levelOne();
		const { ctx, page } = await open(lang, { width: 360 });
		await walkLevelTwo(page, c.id, (step) => noOverflow(page, `step ${step}`));
		await page.goto(flowUrl(c.id, 'step=2&newExperience=Brawler&invalid=pick1'));
		await noOverflow(page, 'step 2 with an error');
		await ctx.close();
	});
}
