// Home campaign cards (US-413): HTTP reads of the page HTML, a psql helper for back-dating journal entries, browser reads.
import { execFileSync } from 'node:child_process';
import { createCampaign } from './api.mjs';

export const fetchHome = async (base, lang) => {
	const res = await fetch(base + '/', { headers: lang ? { cookie: `lang=${lang}` } : {} });
	return { status: res.status, html: await res.text() };
};
const text = (s) => s.replace(/<[^>]*>/g, '').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const anchors = (html) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
const testid = (tag, id) => new RegExp(`data-testid=["']${id}["']`).test(tag);
export const campaignLinks = (html) => anchors(html).filter((a) => testid(a.match(/^<a\b[^>]*>/)[0], 'campaign-link'));
export const cardFor = (html, id) => {
	const a = campaignLinks(html).filter((l) => new RegExp(`href=["']/campaigns/${id}["']`).test(l));
	return a;
};
export const cardName = (a) => { const m = /<[a-z0-9]+\b[^>]*data-testid=["']campaign-name["'][^>]*>([\s\S]*?)<\/(?:h\d|span|p|strong|div)>/.exec(a); return m && text(m[1]); };
export const cardMeta = (a) => { const m = /<p\b[^>]*data-testid=["']campaign-meta["'][^>]*>([\s\S]*?)<\/p>/.exec(a); return m && text(m[1]); };
export const hasTestId = (html, id) => new RegExp(`data-testid=["']${id}["']`).test(html);
export const linksToCampaign = (html, id) => anchors(html).filter((a) => new RegExp(`href=["']/campaigns/${id}["']`).test(a)).length;

export const createScene = async (base, cid, title, status) => {
	const r = await fetch(`${base}/api/campaigns/${cid}/scenes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
	const s = await r.json();
	if (status) await fetch(`${base}/api/campaigns/${cid}/scenes/${s.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
	return s.id;
};
export const deleteAllCampaigns = async (base) => {
	for (const c of await (await fetch(base + '/api/campaigns')).json()) await fetch(`${base}/api/campaigns/${c.id}`, { method: 'DELETE' });
};
// Back-date every journal entry of a campaign through the test database (PG_URL), oldest first by `days` ago.
export const setJournalAge = (entryId, daysAgo) =>
	execFileSync('psql', [process.env.PG_URL, '-c', `UPDATE journal_entries SET created_at = now() - interval '${daysAgo} days' WHERE id = '${entryId}'`]);
export const mediumDate = (lang, d) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(d);
export const daysAgoDate = (n) => new Date(Date.now() - n * 86400000);

export const homeCardBoxes = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="campaign-link"]')].map((a) => {
	const li = a.closest('li'), s = getComputedStyle(li), r = a.getBoundingClientRect();
	const lr = li.getBoundingClientRect();
	return {
		id: a.getAttribute('href'), w: r.width, h: r.height, display: getComputedStyle(a).display,
		cl: lr.left + li.clientLeft + parseFloat(s.paddingLeft), cr: lr.left + li.clientLeft + li.clientWidth - parseFloat(s.paddingRight),
		ct: lr.top + li.clientTop + parseFloat(s.paddingTop), cb: lr.top + li.clientTop + li.clientHeight - parseFloat(s.paddingBottom),
		l: r.left, r: r.right, t: r.top, b: r.bottom
	};
}));
export const metaLooks = (page, href) => page.evaluate((h) => {
	const a = document.querySelector(`[data-testid="campaign-link"][href="${h}"]`);
	const m = a.querySelector('[data-testid="campaign-meta"]'), n = a.querySelector('[data-testid="campaign-name"]');
	const probe = document.createElement('span'); probe.style.color = 'var(--color-muted)'; document.body.append(probe);
	const muted = getComputedStyle(probe).color; probe.remove();
	return { color: getComputedStyle(m).color, muted, metaSize: parseFloat(getComputedStyle(m).fontSize), nameSize: parseFloat(getComputedStyle(n).fontSize) };
}, href);
export const clickMeta = (page, href) => page.locator(`[data-testid="campaign-link"][href="${href}"] [data-testid="campaign-meta"]`).click();
export const clickCardCorner = async (page, href) => {
	const a = page.locator(`[data-testid="campaign-link"][href="${href}"]`);
	await a.scrollIntoViewIfNeeded();
	const b = await a.boundingBox();
	await a.click({ position: { x: b.width - 3, y: b.height - 3 } });
};
export const sideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
export { createCampaign };
