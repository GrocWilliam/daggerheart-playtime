// Home, reference, modals and footer: reads of looks and geometry. Reads only: no assertions.
const LOOK = `(e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
	return { cls: [...e.classList], color: c.color, bg: c.backgroundColor, font: c.fontFamily, size: c.fontSize,
		left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; }`;
export const look = (loc) => loc.evaluate(eval(LOOK));
const all = async (loc) => { const n = await loc.count(); const o = []; for (let i = 0; i < n; i++) o.push(await look(loc.nth(i))); return o; };

export const gapBetween = (a, b) => Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);
export const sideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export const homeCards = (page) => all(page.locator('[data-testid="campaign-link"]').locator('xpath=ancestor::li[1]'));
export const campaignNames = (page) => all(page.locator('[data-testid="campaign-name"]'));
export const runLinks = (page) => all(page.locator('[data-testid="campaign-run-link"]'));
export const newCampaignOpener = (page) => look(page.locator('[data-testid="new-campaign"]'));
export const columnCount = (boxes) => new Set(boxes.map((b) => Math.round(b.left))).size;

export const modal = (page, kind) => page.locator(`[data-testid="modal-${kind}"]`);
export const modalOpen = (page, kind) => modal(page, kind).evaluate((d) => d.open);
export const modalSave = (page, kind) => look(modal(page, kind).locator('button[type="submit"]:not([data-testid^="help-"])').first());
export const modalCancel = (page, kind) => look(modal(page, kind).locator('[data-testid="modal-cancel"]'));
export const clickModalCancel = (page, kind) => modal(page, kind).locator('[data-testid="modal-cancel"]').click();
export const cancelRowClasses = (page, kind) => modal(page, kind).locator('[data-testid="modal-cancel"]').evaluate((a) => [...a.parentElement.classList]);
export const openDialogCount = (page) => page.locator('dialog[open]').count();

export const refItems = (page) => all(page.locator('[data-testid="ref-item"]'));
export const refItemLook = (page) => look(page.locator('[data-testid="ref-item"]').first());
export const refItemCard = (page) => page.locator('[data-testid="ref-item"]').first().evaluate((e) => {
	const c = getComputedStyle(e); return { bg: c.backgroundColor, borderLeft: c.borderLeftWidth, borderColor: c.borderLeftColor, radius: c.borderTopLeftRadius };
});
/** Name (first text span) and kind text of the first entry. The entry shows the kind in a small muted element other than the name. */
export const refNameAndKind = (page) => page.locator('[data-testid="ref-item"]').first().evaluate((e) => {
	const spans = [...e.querySelectorAll('span')].filter((s) => !s.closest('[data-testid^="help-"]') && !s.closest('[popover]') && s.textContent.trim());
	const cs = (s) => (s ? { font: getComputedStyle(s).fontFamily, size: getComputedStyle(s).fontSize, color: getComputedStyle(s).color } : null);
	return { name: cs(spans[0]), kind: cs(spans[1]) };
});
export const refSearchSubmit = (page) => look(page.locator('form[action="/reference"] button[type="submit"]'));
export const refHelpTexts = (page) => page.locator('[data-testid="ref-item"] [data-testid="help-open"]').first().textContent();

export const licenceLook = (page) => page.evaluate(() => {
	const e = document.querySelector('[data-testid="srd-licence"]'), c = getComputedStyle(e), r = e.getBoundingClientRect();
	let prev = e.previousElementSibling, bottom;
	if (prev) bottom = prev.getBoundingClientRect().bottom;
	else { const p = e.parentElement; bottom = [...p.children].filter((x) => x !== e).reduce((m, x) => Math.max(m, x.getBoundingClientRect().bottom), 0); }
	return { size: c.fontSize, color: c.color, lang: e.getAttribute('lang'), text: e.textContent.trim(), top: r.top, aboveBottom: bottom, gap: r.top - bottom };
});
