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

let browser, campaign;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function create({ subclass, ...extra } = {}) {
	campaign ??= (await ok(await send('POST', '/api/campaigns', { name: 'US286' }), 201)).id;
	const c = await ok(
		await send('POST', `/api/campaigns/${campaign}/characters`, {
			name: 'Rook', class: 'Guardian', level: 1, evasion: 9, majorThreshold: 5, severeThreshold: 10,
			maxHp: 7, armorSlots: 3,
			traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 },
			...extra
		}), 201);
	if (subclass) await ok(await send('PATCH', `/api/characters/${c.id}`, { subclass }));
	return c;
}
const plan = async (id) => ok(await send('GET', `/api/characters/${id}/level-up`));
const levelUp = async (id, body) => ok(await send('POST', `/api/characters/${id}/level-up`, body));

async function open(id, lang, width = 1024) {
	const ctx = await browser.newContext({ viewport: { width, height: 800 } });
	await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/characters/${id}`);
	return { page, ctx };
}

const L = {
	en: { prof: 'Proficiency', marked: 'Marked', spec: 'Specialization', help: 'Number of damage dice you roll on a successful attack.' },
	fr: { prof: 'Maîtrise', marked: 'Marqué', spec: 'Spécialisation', help: "Nombre de dés de dégâts lancés lors d'une attaque réussie." }
};

for (const lang of ['en', 'fr']) {
	test(`new character sheet shows proficiency 1 with its label and Help in ${lang}`, async () => {
		const c = await create();
		const { page, ctx } = await open(c.id, lang);
		const el = page.locator('[data-testid=proficiency]');
		assert.equal(await el.count(), 1);
		const text = await el.innerText();
		assert.ok(text.includes(L[lang].prof), text);
		assert.match(text, /\b1\b/);
		await el.locator('[data-testid=help-open]').click();
		const panel = el.locator('[data-testid=help-panel]');
		await panel.waitFor({ state: 'visible' });
		assert.ok((await panel.innerText()).includes(L[lang].help), await panel.innerText());
		await ctx.close();
	});

	test(`after level 1 to 2 with traits agility and knowledge the sheet marks them in ${lang}`, async () => {
		const c = await create();
		const card = (await plan(c.id)).cards.find((x) => x.level === 1);
		for (const name of ['Bodyguard', 'Blacksmith'])
			await ok(await send('POST', `/api/characters/${c.id}/experiences`, { name, modifier: 2 }), 201);
		const ids = (await ok(await send('GET', `/api/characters/${c.id}`))).experiences.map((e) => e.id);
		await levelUp(c.id, {
			newExperience: 'Brawler',
			advancements: [
				{ option: 'traits', traits: ['agility', 'knowledge'] },
				{ option: 'experiences', experiences: ids }
			],
			domainCard: card.id
		});
		const { page, ctx } = await open(c.id, lang);
		for (const t of ['agility', 'knowledge']) {
			const b = page.locator(`[data-testid=trait-marked-${t}]`);
			assert.equal(await b.count(), 1);
			assert.equal((await b.innerText()).trim(), L[lang].marked);
		}
		assert.equal(await page.locator('[data-testid=trait-marked-strength]').count(), 0);
		assert.match(await page.locator('[data-testid=proficiency]').innerText(), /\b2\b/);
		await ctx.close();
	});

	test(`subclass-stage is absent without a subclass advancement and shows Specialization after one in ${lang}`, async () => {
		const plain = await create();
		let s = await open(plain.id, lang);
		assert.equal(await s.page.locator('[data-testid=subclass-stage]').count(), 0);
		await s.ctx.close();

		const c = await create({ level: 4, subclass: 'core_subclass_stalwart' });
		const p = await plan(c.id);
		assert.equal(p.toLevel, 5);
		await levelUp(c.id, {
			newExperience: 'Sailor',
			advancements: [{ option: 'subclass' }, { option: 'hp' }],
			domainCard: p.cards[0].id
		});
		s = await open(c.id, lang);
		const el = s.page.locator('[data-testid=subclass-stage]');
		assert.equal(await el.count(), 1);
		assert.ok((await el.innerText()).includes(L[lang].spec));
		await s.ctx.close();
	});

	test(`sheet has no horizontal overflow at 360px in ${lang}`, async () => {
		const c = await create({ level: 4, subclass: 'core_subclass_stalwart' });
		const p = await plan(c.id);
		await levelUp(c.id, {
			newExperience: 'Sailor',
			advancements: [{ option: 'subclass' }, { option: 'traits', traits: ['agility', 'strength'] }],
			domainCard: p.cards[0].id
		});
		const { page, ctx } = await open(c.id, lang, 360);
		const r = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
		assert.ok(r.s <= r.c, `scrollWidth ${r.s} > clientWidth ${r.c}`);
		await ctx.close();
	});
}

