// Tab bars: the DM screen step switch and the sheet tabs. Reads only; expectations stay in the tests.


const LOOK = (e) => {
	const c = getComputedStyle(e);
	return {
		current: e.getAttribute('aria-current'), bg: c.backgroundColor, color: c.color, deco: c.textDecorationLine,
		weight: Number(c.fontWeight), height: e.getBoundingClientRect().height, top: e.getBoundingClientRect().top
	};
};
export const linkLook = (page, testid) => page.getByTestId(testid).evaluate(LOOK);

/** The container of a link: the nav holding it. */
const BAR = (e) => {
	const bar = e.parentElement;
	const c = getComputedStyle(bar);
	const canvas = document.createElement('canvas');
	canvas.width = 1; canvas.height = 1;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = c.borderBottomColor;
	ctx.fillRect(0, 0, 1, 1);
	return {
		width: c.borderBottomWidth, style: c.borderBottomStyle, pixel: [...ctx.getImageData(0, 0, 1, 1).data],
		overflowX: c.overflowX, scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth
	};
};
export const barLook = (page, linkTestid) => page.getByTestId(linkTestid).evaluate(BAR);

export const pageScrolls = (page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));

export const clickTab = (page, tab) => page.getByTestId(`tab-${tab}`).click();
