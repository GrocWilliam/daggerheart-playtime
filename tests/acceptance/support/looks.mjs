// Reads of computed looks (colours, sizes) on a page, and probes inserted into it. No expected values here.

const LOOK = (e) => {
	const c = getComputedStyle(e);
	const r = e.getBoundingClientRect();
	return {
		background: c.backgroundColor, text: c.color,
		borderStyle: c.borderTopStyle, borderWidth: c.borderTopWidth, borderColor: c.borderTopColor,
		borderStyles: [c.borderTopStyle, c.borderRightStyle, c.borderBottomStyle, c.borderLeftStyle],
		radius: c.borderTopLeftRadius, width: r.width, height: r.height,
		textDecoration: c.textDecorationLine, cursor: c.cursor
	};
};

/** Inserts `<tag class=cls [aria-pressed]>` at the start of `main` (or `body`) and returns its look. */
export const insertStyled = async (page, { tag = 'button', cls, pressed, id }) => {
	const testid = id ?? `probe-${tag}-${cls}-${pressed ?? 'none'}`;
	await page.evaluate(({ tag, cls, pressed, testid }) => {
		const e = document.createElement(tag);
		e.className = cls;
		e.textContent = 'Probe';
		e.dataset.testid = testid;
		if (tag === 'a') e.href = '/';
		if (tag === 'button') e.type = 'button';
		if (pressed !== undefined) e.setAttribute('aria-pressed', String(pressed));
		(document.querySelector('main') ?? document.body).prepend(e);
	}, { tag, cls, pressed, testid });
	return testid;
};

export const lookOf = (page, testid) => page.getByTestId(testid).evaluate(LOOK);

/** Presses Tab until the element has keyboard focus, then returns its outline. */
export const focusWithKeyboard = async (page, testid) => {
	for (let i = 0; i < 40; i++) {
		await page.keyboard.press('Tab');
		if (await page.evaluate((t) => document.activeElement?.dataset?.testid === t, testid)) break;
	}
	return page.evaluate((t) => {
		const e = document.activeElement;
		const c = getComputedStyle(e);
		return { focused: e.dataset.testid === t, focusVisible: e.matches(':focus-visible'), width: c.outlineWidth, style: c.outlineStyle, color: c.outlineColor };
	}, testid);
};

/** Inserts a probe bordered with `var(--border)` and paints its computed border-top-color on a 1×1 canvas: [r, g, b, a]. */
export const borderTokenPixel = (page) => page.evaluate(() => {
	const probe = document.createElement('div');
	probe.style.border = '1px solid var(--border)';
	document.body.append(probe);
	const colour = getComputedStyle(probe).borderTopColor;
	probe.remove();
	const canvas = document.createElement('canvas');
	canvas.width = 1; canvas.height = 1;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = colour;
	ctx.fillRect(0, 0, 1, 1);
	return [...ctx.getImageData(0, 0, 1, 1).data];
});

export const h1FontSize = (page) => page.locator('h1').first().evaluate((e) => getComputedStyle(e).fontSize);

/** The "use armor" checkbox of the sheet's damage form, and its label. */
export const useArmorCheckbox = (page) => page.locator('input[type=checkbox][name=useArmor]').evaluate((e) => {
	const r = e.getBoundingClientRect();
	const l = e.closest('label');
	return { width: r.width, height: r.height, accentColor: getComputedStyle(e).accentColor, labelHeight: l ? l.getBoundingClientRect().height : 0 };
});

/** Every `<button>` with no `btn-*` variant class (help triggers have their own look since us-246). */
export const plainButtonLooks = (page) => page.evaluate(() =>
	[...document.querySelectorAll('button:not([data-testid^="help-"])')]
		.filter((b) => ![...b.classList].some((c) => c.startsWith('btn-')))
		.map((b) => { const c = getComputedStyle(b); return { name: b.dataset.testid || b.textContent.trim(), background: c.backgroundColor, text: c.color }; }));
