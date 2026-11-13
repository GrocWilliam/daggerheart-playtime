// Reads and actions on the site header and the language switcher. No expected values here.
import { launchBrowser, closePage } from './browser.mjs';

export const openPageIn = async (browser, url, viewport, lang) => {
	const ctx = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, extraHTTPHeaders: { cookie: `lang=${lang}` } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(10000);
	await page.goto(url);
	await page.waitForLoadState('networkidle');
	return page;
};
export { launchBrowser, closePage };

/** Vertical centres of the four header items, the switcher's right edge and the header's content right edge. */
export const headerLayout = (page) => page.evaluate(() => {
	const box = (id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
	const centre = (r) => r.top + r.height / 2;
	const h = document.querySelector('header');
	const hr = h.getBoundingClientRect(), cs = getComputedStyle(h);
	return {
		centres: Object.fromEntries(['sigil', 'nav-home', 'nav-reference', 'language-switcher'].map((id) => [id, centre(box(id))])),
		switcherRight: box('language-switcher').right,
		contentRight: hr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
	};
});

export const headerHeight = (page) => page.evaluate(() => document.querySelector('header').getBoundingClientRect().height);
export const horizontalOverflow = (page) => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));

export const homeLink = async (page) => {
	const l = page.getByTestId('nav-home');
	const b = await l.boundingBox();
	return { box: b, name: await l.evaluate((e) => e.getAttribute('aria-label') ?? ([...e.childNodes].map((n) => n.textContent).join('').trim())) };
};

/** Accessible name through the browser's accessibility tree (aria-label, else content incl. sr-only). */
export const homeAccessibleName = (page) => page.getByTestId('nav-home').evaluate((e) => {
	const l = e.getAttribute('aria-label'); if (l) return l;
	return e.textContent.replace(/\s+/g, ' ').trim();
});

export const languageButton = (page, code) => page.getByTestId(`lang-${code}`).evaluate((e) => {
	const c = getComputedStyle(e), r = e.getBoundingClientRect();
	return {
		text: e.textContent.trim(), ariaLabel: e.getAttribute('aria-label'), lang: e.getAttribute('lang'),
		pressed: e.getAttribute('aria-pressed'), classes: [...e.classList], background: c.backgroundColor, color: c.color,
		width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom
	};
});

export const switchLanguage = async (page, code) => {
	await Promise.all([page.waitForLoadState('load'), page.getByTestId(`lang-${code}`).click()]);
	await page.waitForFunction((c) => document.documentElement.lang === c, code);
	await page.waitForLoadState('networkidle');
};
export const htmlLang = (page) => page.evaluate(() => document.documentElement.lang);
