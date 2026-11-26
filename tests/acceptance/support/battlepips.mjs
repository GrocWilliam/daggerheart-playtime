// us-401: Run sidebar (adversary HP pips, folded add form, journal order). Setup over HTTP; reads and actions only.
import { createCampaign, createCharacter, createCurrentScene, addJournalEntry } from './api.mjs';

const call = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
export const RAT = 'adv_giant_rat', BUR = 'adv_acid_burrower';

/** Campaign with a current scene. Encounter: 1 giant rat (max 1) and 3 acid burrowers (max 8) marked 3, 8 and 2 HP. */
export const setupBattle = async (base, { journal = 0, encounter = true } = {}) => {
	const campaignId = await createCampaign(base, 'Pips');
	await createCharacter(base, campaignId, 'Alyndra');
	const sceneId = await createCurrentScene(base, campaignId, 'Pitfight');
	if (encounter) {
		const url = `/api/campaigns/${campaignId}/scenes/${sceneId}/encounter`;
		await call(base, 'POST', url, { partySize: 3, tier: 1, seed: 1 });
		const p = await call(base, 'PATCH', url, { adversaries: [{ id: RAT, count: 1 }, { id: BUR, count: 3 }] });
		if (p.status !== 200) throw new Error('encounter setup ' + p.status);
		for (const [i, n] of [[0, 3], [1, 8], [2, 2]])
			for (let k = 0; k < n; k++) await call(base, 'POST', `${url}/hp`, { adversaryId: BUR, index: i, delta: 1 });
	}
	for (let i = 0; i < journal; i++) await addJournalEntry(base, campaignId, `Entry ${i + 1}: the party walks on`);
	return { campaignId, sceneId, url: `${base}/campaigns/${campaignId}?step=run` };
};

export const unit = (page, adv, i) => page.locator(`[data-testid="battle-unit"][data-adversary="${adv}"][data-index="${i}"]`);
export const unitHp = async (page, adv, i) => (await unit(page, adv, i).getByTestId('unit-hp').textContent()).trim();
export const pipsOf = (page, adv, i) => unit(page, adv, i).getByTestId('adversary-pips').evaluate((el) => {
	const pips = [...el.querySelectorAll('.pip')];
	return { total: pips.length, filled: pips.filter((p) => p.classList.contains('filled')).length,
		filledColours: [...new Set(pips.filter((p) => p.classList.contains('filled')).map((p) => getComputedStyle(p).backgroundColor))] };
});
export const clickUnitHpPlus = (page, adv, i) => unit(page, adv, i).getByTestId('unit-hp-plus').click();

export const addMore = (page) => page.getByTestId('battle-add-more');
export const addMoreIsOpen = (page) => addMore(page).evaluate((d) => d.open);
export const addMoreSummary = async (page) => (await addMore(page).locator('summary').first().textContent()).trim();
export const openAddMore = (page) => addMore(page).locator('summary').first().click();
export const battleAddVisible = (page) => page.getByTestId('battle-add').isVisible();
export const addAdversary = async (page, adv, count) => {
	const f = page.getByTestId('battle-add');
	await f.getByTestId('battle-add-adversary').selectOption(adv);
	if (count !== undefined) await f.getByTestId('battle-add-count').fill(String(count));
	await f.getByTestId('battle-add-submit').click();
};
export const battleAddInsideMore = (page) => addMore(page).getByTestId('battle-add').count();

/** Vertical order inside `journal`: tops of the textarea, the add button, the first entry (or empty text) and the h2 bottom. */
export const journalLayout = (page) => page.getByTestId('journal').evaluate((j) => {
	const top = (e) => (e ? e.getBoundingClientRect().top : null);
	const entry = j.querySelector('[data-testid="journal-entry"]');
	const form = j.querySelector('textarea').closest('form');
	const after = entry ?? [...j.querySelectorAll('p')].find((p) => !p.closest('form'));
	const btn = form.querySelector('button[type=submit]');
	return { h2Bottom: j.querySelector('h2').getBoundingClientRect().bottom, textareaTop: top(j.querySelector('textarea')), buttonTop: top(btn),
		buttonClasses: [...btn.classList], afterTop: top(after), hasAfter: !!after };
});
export const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth);

/** The palette colours as computed rgb strings. */
export const paletteRgb = (page) => page.evaluate(() => {
	const probe = (v) => { const e = document.createElement('i'); e.style.color = `var(${v})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
	return { muted: probe('--muted'), danger: probe('--danger') };
});

/** POST the battleAdd form action as the page would (enhance header: JSON result). */
export const postBattleAdd = async (base, campaignId, sceneId, fields) => {
	const body = new URLSearchParams({ sceneId, ...fields });
	const r = await fetch(`${base}/campaigns/${campaignId}?/battleAdd&step=run`, { method: 'POST', body, redirect: 'manual',
		headers: { 'x-sveltekit-action': 'true', origin: base, 'content-type': 'application/x-www-form-urlencoded' } });
	const out = await r.json();
	return { httpStatus: r.status, type: out.type, status: out.status, dataText: typeof out.data === 'string' ? out.data : JSON.stringify(out.data) };
};
