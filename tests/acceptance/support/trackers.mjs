// Tracker grid: geometry and looks of tracker rows, the Fear band, and −/+ clicks. Reads only: no assertions.
export const VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820]];
export const LANGS = ['en', 'fr'];
export const TRACKER_NAMES = ['hp', 'stress', 'hope', 'armor'];

export const addFear = async (base, campaignId, delta) => {
	const r = await fetch(`${base}/api/campaigns/${campaignId}/fear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delta }) });
	if (!r.ok) throw new Error(`fear ${r.status}`);
};

// Left edges (x) of the − buttons and of the `<name>-pips` boxes inside a container.
export const leftEdges = (container) => container.evaluate((root, names) => {
	const x = (e) => e.getBoundingClientRect().left;
	const minus = names.map((n) => x(root.querySelector(`[data-testid="${n}"]`).closest('form').querySelector('button[name=delta][value="-1"]')));
	const pips = names.map((n) => x(root.querySelector(`[data-testid="${n}-pips"]`)));
	const labels = names.map((n) => {
		const f = root.querySelector(`[data-testid="${n}"]`).closest('form');
		return x([...f.querySelectorAll('button')].find((b) => b.name !== 'delta'));
	});
	const below = names.map((n) => {
		const f = root.querySelector(`[data-testid="${n}"]`).closest('form');
		const minusBottom = f.querySelector('button[name=delta][value="-1"]').getBoundingClientRect().bottom;
		return [...root.querySelector(`[data-testid="${n}-pips"]`).children].every((c) => c.getBoundingClientRect().top >= minusBottom - 1);
	});
	return { minus, pips, labels, below };
}, TRACKER_NAMES);
export const sheetTrackers = (page) => page.locator('[data-testid="sheet-trackers"]');
export const runCard = (page, i) => page.locator('[data-testid="character-card"]').nth(i);

// Geometry of one tracker's −, value and + (vertical centres, left edges).
export const rowGeometry = (page, name, scope) => (scope ?? page).locator(`[data-testid="${name}"]`).first().evaluate((val) => {
	const f = val.closest('form');
	const c = (e) => { const r = e.getBoundingClientRect(); return { cy: r.top + r.height / 2, left: r.left, right: r.right }; };
	return { minus: c(f.querySelector('button[name=delta][value="-1"]')), value: c(val), plus: c(f.querySelector('button[name=delta][value="1"]')) };
});

// Looks of the − and + buttons of a tracker.
export const stepperLooks = (page, name, scope) => (scope ?? page).locator(`[data-testid="${name}"]`).first().evaluate((val) =>
	['-1', '1'].map((v) => {
		const b = val.closest('form').querySelector(`button[name=delta][value="${v}"]`);
		const cs = getComputedStyle(b), r = b.getBoundingClientRect();
		return { cls: b.className.split(/\s+/), bg: cs.backgroundColor, color: cs.color, w: r.width, h: r.height };
	}));

export const fearBand = (page) => page.locator('[data-testid="fear"]').evaluate((val) => {
	const f = val.closest('form'), cs = getComputedStyle(f);
	const label = f.querySelector('[data-testid="help"] button') ?? f.querySelector('button');
	const run = document.querySelector('[data-testid="run"]');
	const pips = [...document.querySelector('[data-testid="fear-pips"]').children].map((p) => { const r = p.getBoundingClientRect(); return [r.width, r.height]; });
	return {
		width: f.getBoundingClientRect().width, runWidth: run.getBoundingClientRect().width,
		bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, borderW: cs.borderTopWidth, borderStyle: cs.borderTopStyle,
		labelFont: getComputedStyle(label).fontFamily, pips
	};
});

export const fearValue = async (page) => (await page.locator('[data-testid="fear"]').textContent()).trim();
export const clickPlus = (page, name) => page.locator('form', { has: page.locator(`[data-testid="${name}"]`) }).first().locator('button[name=delta][value="1"]').click();
export const hpText = async (page) => (await page.locator('[data-testid="hp"]').first().textContent()).trim();

// Per tracker in a container: the tops of its pips, the − button bottom/size, the label/−/value/+ centres.
export const pipTops = (container, names = TRACKER_NAMES) => container.evaluate((root, names) => names.map((n) => ({
	name: n, tops: [...root.querySelector(`[data-testid="${n}-pips"]`).children].map((c) => c.getBoundingClientRect().top)
})), names);
export const stepperSizes = (container, names = TRACKER_NAMES) => container.evaluate((root, names) => names.flatMap((n) => {
	const f = root.querySelector(`[data-testid="${n}"]`).closest('form');
	return ['-1', '1'].map((v) => { const r = f.querySelector(`button[name=delta][value="${v}"]`).getBoundingClientRect(); return { name: n, w: r.width, h: r.height }; });
}), names);
export const scrollOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
export const fearGeometry = (page) => page.locator('[data-testid="fear"]').evaluate((val) => {
	const f = val.closest('form');
	const cy = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
	const label = [...f.querySelectorAll('button')].find((b) => b.name !== 'delta');
	return { cys: [cy(label), cy(f.querySelector('button[name=delta][value="-1"]')), cy(val), cy(f.querySelector('button[name=delta][value="1"]')), cy(f.querySelector('[data-testid="fear-pips"]'))],
		pips: [...f.querySelector('[data-testid="fear-pips"]').children].map((p) => { const r = p.getBoundingClientRect(); return [r.width, r.height]; }) };
});
export const rowCentres = (page, name, scope) => (scope ?? page).locator(`[data-testid="${name}"]`).first().evaluate((val) => {
	const f = val.closest('form');
	const cy = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
	const label = [...f.querySelectorAll('button')].find((b) => b.name !== 'delta');
	return [cy(label), cy(f.querySelector('button[name=delta][value="-1"]')), cy(val), cy(f.querySelector('button[name=delta][value="1"]'))];
});
export const cardHeights = (page) => page.locator('[data-testid="character-card"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));

// ---- Sticky one-row Fear band (us-396). Reads and actions only: no assertions.
export const BAND_VIEWPORTS = [[375, 812], [768, 1024], [1024, 768], [1180, 820], [1280, 900]];
export const fearLabelButton = (page) => page.locator('[data-testid="fear"]').locator('xpath=ancestor::form[1]').locator('button:not([name=delta])').first();
export const fearMinus = (page) => page.locator('[data-testid="fear"]').locator('xpath=ancestor::form[1]').locator('button[name=delta][value="-1"]');

// Everything about the band's geometry: centres of label, −, value, +, 12 pips; sizes; widths; label column width.
export const fearBandRead = (page) => page.locator('[data-testid="fear"]').evaluate((val) => {
	const f = val.closest('form');
	const r = (e) => e.getBoundingClientRect();
	const cy = (e) => r(e).top + r(e).height / 2;
	const label = [...f.querySelectorAll('button')].find((b) => b.name !== 'delta');
	const minus = f.querySelector('button[name=delta][value="-1"]');
	const plus = f.querySelector('button[name=delta][value="1"]');
	const pips = [...f.querySelector('[data-testid="fear-pips"]').children].map((p) => r(p));
	return {
		centres: [cy(label), cy(minus), cy(val), cy(plus), ...pips.map((p) => p.top + p.height / 2)],
		pipCount: pips.length,
		pipSizes: pips.map((p) => [p.width, p.height]),
		pipGaps: pips.slice(1).map((p, i) => p.left - pips[i].right),
		height: r(f).height, top: r(f).top, width: r(f).width,
		runWidth: r(document.querySelector('[data-testid="run"]')).width,
		labelColumn: r(f.firstElementChild).width,
		minusLeft: r(minus).left
	};
});

// Label column width of a row tracker (the first cell of its form).
export const labelColumnWidth = (page, name, scope) => (scope ?? page).locator(`[data-testid="${name}"]`).first().evaluate((val) => val.closest('form').querySelector(':scope > :not(input[type=hidden])').getBoundingClientRect().width);

export const scrollRunDown = async (page, px = 600) => {
	await page.evaluate((y) => window.scrollTo(0, y), px);
	await page.waitForFunction((y) => window.scrollY >= y - 1, px);
	return page.evaluate(() => window.scrollY);
};

// The band while scrolled: top, background, and whether the element at the centre of the value is the value itself.
export const fearBandSticky = (page) => page.locator('[data-testid="fear"]').evaluate((val) => {
	const f = val.closest('form'), r = val.getBoundingClientRect();
	const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
	return { top: f.getBoundingClientRect().top, bg: getComputedStyle(f).backgroundColor, text: val.textContent.trim(), valueOnTop: hit === val || val.contains(hit) };
});

export const fearPlusButton = (page) => page.locator('[data-testid="fear"]').locator('xpath=ancestor::form[1]').locator('button[name=delta][value="1"]');
export const fearButtonSizes = (page) => page.locator('[data-testid="fear"]').evaluate((val) => {
	const f = val.closest('form');
	const label = [...f.querySelectorAll('button')].find((b) => b.name !== 'delta');
	const size = (b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; };
	return { label: size(label), minus: size(f.querySelector('button[name=delta][value="-1"]')), plus: size(f.querySelector('button[name=delta][value="1"]')) };
});
