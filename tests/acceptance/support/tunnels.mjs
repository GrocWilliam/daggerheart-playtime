// The character tunnel and the level-up tunnel: URLs, setup and reads of their looks. No expected values here.
import { createCampaign, createCharacter } from './api.mjs';

export const TUNNEL_VALUES = { name: 'Mira', class: 'Bard', level: '2', ancestry: 'Clank', community: 'Highborne', agility: '2', strength: '1', finesse: '1', instinct: '0', presence: '0', knowledge: '-1' };

export const tunnelCampaign = (base) => createCampaign(base, 'Tunnelcamp');
export const tunnelUrl = (base, campaignId, step, values = TUNNEL_VALUES) =>
	`${base}/campaigns/${campaignId}/characters/new?${new URLSearchParams({ step: String(step), ...values })}`;

/** A level 1 Guardian with two Experiences (so the level-up plan is a plain 1 → 2). Returns its id. */
export const levelOneCharacter = async (base) => {
	const cid = await createCampaign(base, 'Levelcamp');
	return createCharacter(base, cid, 'Rook', {
		level: 1, evasion: 9, maxHp: 7,
		traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 }
	});
};
export const levelUpCardId = async (base, characterId) => (await (await fetch(`${base}/api/characters/${characterId}/level-up`)).json()).cards[0].id;
export const levelUpUrl = (base, characterId, step, values = {}) =>
	`${base}/characters/${characterId}/level-up?${new URLSearchParams({ step: String(step), ...values })}`;
export const levelUpValues = (cardId) => ({ newExperience: 'Brawler', pick1: 'hp', pick2: 'stress', domainCard: cardId });

const STEP_LOOK = (e) => {
	const c = getComputedStyle(e);
	return { text: e.textContent.replace(/\s+/g, ' ').trim(), current: e.getAttribute('aria-current'), background: c.backgroundColor, color: c.color };
};
/** Every step of a progress bar: its text, aria-current, background and text colour. */
export const stepsOf = (page, progressTestid) => page.getByTestId(progressTestid).locator('li').evaluateAll((els, f) => els.map(new Function('e', `return (${f})(e)`)), STEP_LOOK.toString());
export const progressText = (page, progressTestid) => page.getByTestId(progressTestid).innerText();

const BTN = (e) => {
	const r = e.getBoundingClientRect();
	const c = getComputedStyle(e);
	return { classes: [...e.classList], color: c.color, width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};
export const buttonLook = (page, testid) => page.getByTestId(testid).evaluate(BTN);
export const buttonLooks = async (page, testids) => Object.fromEntries(await Promise.all(testids.map(async (t) => [t, await buttonLook(page, t)])));
export const buttonsLike = (page, prefix) => page.locator(`[data-testid^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.dataset.testid));
export const selectWidths = (page, form) => page.locator(form).locator('select').evaluateAll((els) => els.map((e) => ({ name: e.name, width: e.getBoundingClientRect().width })));
export const pageScroll = (page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));

