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
	return { minus, pips };
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
