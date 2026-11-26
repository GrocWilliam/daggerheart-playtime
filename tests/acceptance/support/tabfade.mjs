// Sheet tab bar fade: reads and actions only; expectations stay in the tests.
import { readFileSync } from 'node:fs';

const NAV = (page) => page.getByTestId('sheet-tabs');
const FADE = '[data-testid="sheet-tabs"] ~ span[aria-hidden="true"]';

export const fadeCount = (page) => page.locator(FADE).count();
export const barScrolls = (page) => NAV(page).evaluate((n) => ({ scrollWidth: n.scrollWidth, clientWidth: n.clientWidth }));
export const scrollBarToEnd = (page) => NAV(page).evaluate((n) => { n.scrollLeft = n.scrollWidth - n.clientWidth; });
export const scrollBarToStart = (page) => NAV(page).evaluate((n) => { n.scrollLeft = 0; });
export const barBox = (page) => NAV(page).evaluate((n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, height: r.height }; });

export const fadeLook = (page) => page.locator(FADE).evaluate((e) => {
	const r = e.getBoundingClientRect();
	const c = getComputedStyle(e);
	return { left: r.left, right: r.right, width: r.width, height: r.height, top: r.top, image: c.backgroundImage, pointerEvents: c.pointerEvents };
});
export const pageBackground = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

export const waitFadeGone = (page) => page.waitForFunction(
	() => !document.querySelector('[data-testid="sheet-tabs"] ~ span[aria-hidden="true"]'), null, { timeout: 500 });
export const waitFadePresent = (page) => page.waitForFunction(
	() => !!document.querySelector('[data-testid="sheet-tabs"] ~ span[aria-hidden="true"]'), null, { timeout: 2000 });

/** Click the visible part of the last tab link that lies under the fade; returns its key. */
export const clickLastTabUnderFade = async (page) => {
	const t = await page.evaluate(() => {
		const f = document.querySelector('[data-testid="sheet-tabs"] ~ span[aria-hidden="true"]').getBoundingClientRect();
		let hit = null;
		for (const a of document.querySelectorAll('[data-testid="sheet-tabs"] [data-testid^="tab-"]')) {
			const r = a.getBoundingClientRect();
			const l = Math.max(r.left, f.left), rr = Math.min(r.right, f.right);
			if (rr - l > 2) hit = { key: a.dataset.testid.slice(4), x: (l + rr) / 2, y: r.top + r.height / 2 };
		}
		return hit;
	});
	if (!t) return null;
	await page.mouse.click(t.x, t.y);
	return t.key;
};

export const tabLinkKeys = (page) => page.locator('[data-testid="sheet-tabs"] [data-testid^="tab-"]')
	.evaluateAll((els) => els.map((e) => e.dataset.testid.slice(4)));

export const uiDoc = () => readFileSync(new URL('../../../docs/ui.md', import.meta.url), 'utf8');
export const tabBarRule = () => uiDoc().split('\n').filter((l) => l.includes('sheet-tabs'));
