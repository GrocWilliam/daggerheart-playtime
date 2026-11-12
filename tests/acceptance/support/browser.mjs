// One browser per test file; pages fail fast.
import { createRequire } from 'node:module';

export const launchBrowser = () => {
	const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core');
	return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
};

export const openPage = async (browser, url, [width, height]) => {
	const ctx = await browser.newContext({ viewport: { width, height } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(10000);
	await page.goto(url);
	await page.waitForLoadState('networkidle');
	return page;
};

export const closePage = (page) => page.context().close();
